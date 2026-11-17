import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/server/config";

/*
 * Momen's and Mozaik's APIs: each calls the gate first (who is refused: no session 401, Main WAM not
 * on for the person 404, module Mozaik off 404), checks the origin of every change, and validates.
 */

let gate: "ok" | 401 | 404 = "ok";
let mosaicOff = false;
const context = { viewer: { id: "11111111-1111-4111-8111-111111111111", roles: [], group: null }, settings: { modules: { mozaik: true } } };
const refuse = () => { if (gate !== "ok") throw new ServiceError(gate, gate === 401 ? "Sesi berakhir." : "Halaman tidak ditemukan."); return context; };
vi.mock("@/lib/server/main-wam/gate", () => ({
  requireMainWamApi: async () => refuse(),
  requireActionApi: async () => refuse(),
  requireModuleApi: async (module: string) => { const ok = refuse(); if (module === "mozaik" && mosaicOff) throw new ServiceError(404, "Halaman tidak ditemukan."); return ok; },
}));
const calls: string[] = [];
vi.mock("@/lib/server/main-wam/momen/feed", () => ({
  listFeed: async () => { calls.push("listFeed"); return { items: [], next: null, total: 0, migrated: true }; },
  sessionCounts: async () => [],
  markSeen: async (_viewer: unknown, ids: string[]) => { calls.push(`seen:${ids.length}`); return ids.length; },
  setHeart: async () => ({ hearts: 1, hearted: true }),
  personLimit: async () => undefined,
  reportPhoto: async () => ({ hiddenForMe: true }),
  unhideReported: async () => undefined,
}));
vi.mock("@/lib/server/main-wam/momen/upload", () => ({
  startUpload: async () => { calls.push("start"); return { kind: "selesai", id: "x", visibleAt: "y" }; },
  confirmUpload: async () => ({ id: "x", visibleAt: "y" }),
  deletePhoto: async () => { calls.push("delete"); const refusal = deleteRefusal; deleteRefusal = null; if (refusal) throw refusal; },
}));
let deleteRefusal: ServiceError | null = null;
vi.mock("@/lib/server/main-wam/momen/mosaic", () => ({
  mosaicHead: async () => { calls.push("mosaicHead"); return { version: "v1", migrated: true }; },
  mosaicManifest: async (_context: unknown, _now: Date, head: { version: string }) => { calls.push("mosaicManifest"); return { version: head.version, tiles: [], migrated: true }; },
}));
vi.mock("@/lib/server/main-wam/momen/files", () => ({
  parsePhotoSize: (raw: string | null) => (raw === "kecil" || raw === "ubin" ? raw : "besar"),
  photoFileAddress: async (_context: unknown, _id: string, size: string) => ({ address: `https://r2.example/x-${size}.jpg?sig`, cacheSeconds: size === "besar" ? 300 : 3000 }),
}));

const feedRoute = await import("./route");
const startRoute = await import("./unggah/route");
const seenRoute = await import("./dilihat/route");
const photoRoute = await import("./[id]/route");
const heartRoute = await import("./[id]/hati/route");
const reportRoute = await import("./[id]/laporan/route");
const fileRoute = await import("./[id]/berkas/route");
const mosaicRoute = await import("../mozaik/route");

const ID = "33333333-3333-4333-8333-333333333333";
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const site = "http://localhost:3100";
const json = (path: string, body: unknown, method = "POST", origin = site) => new Request(`${site}${path}`, { method, headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const start = { clientId: "22222222-2222-4222-8222-222222222222", audience: "semua", sessionId: null, takenAt: "2027-01-05T08:20:00.000Z", width: 1280, height: 1600, size: 400_000, thumbSize: 40_000, tileSize: 9_000 };

beforeEach(() => { gate = "ok"; mosaicOff = false; calls.length = 0; });

describe("Momen APIs refuse who they are not for", () => {
  it("401 without a session, 404 when Main WAM is not on for the person, on every route", async () => {
    for (const status of [401, 404] as const) {
      gate = status;
      const answers = await Promise.all([
        feedRoute.GET(new Request(`${site}/api/wam/acara/momen`)),
        startRoute.POST(json("/api/wam/acara/momen/unggah", start)),
        seenRoute.POST(json("/api/wam/acara/momen/dilihat", { ids: [ID] })),
        photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params()),
        heartRoute.PUT(new Request(`${site}/x`, { method: "PUT", headers: { origin: site } }), params()),
        reportRoute.POST(json("/x", { reason: "tidak_pantas" }), params()),
        fileRoute.GET(new Request(`${site}/x`), params()),
        mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`)),
      ]);
      expect(answers.map(answer => answer.status)).toEqual(Array(8).fill(status));
    }
    expect(calls).toEqual([]);
  });

  it("hides the Mozaik while its module is off (404, nothing about it)", async () => {
    mosaicOff = true;
    const answer = await mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`));
    expect(answer.status).toBe(404);
    expect(await answer.text()).not.toContain("mozaik");
  });
});

describe("Momen APIs check what they are sent", () => {
  it("refuse a change from another site, and an invalid upload or report", async () => {
    expect((await startRoute.POST(json("/x", start, "POST", "https://evil.example"))).status).toBe(403);
    expect((await startRoute.POST(json("/x", { ...start, size: 5_000_000 }))).status).toBe(422);
    expect((await reportRoute.POST(json("/x", { reason: "lainnya", note: " " }), params())).status).toBe(422);
    expect((await photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params("bukan-id"))).status).toBe(422);
    expect((await seenRoute.POST(json("/x", { ids: Array(101).fill(ID) }))).status).toBe(422);
    expect((await feedRoute.GET(new Request(`${site}/api/wam/acara/momen?sebelum=zzz`))).status).toBe(422);
    expect(calls).toEqual([]);
  });

  it("answer the allowed ones; the file is a short-lived redirect, the Mozaik a 304 when unchanged", async () => {
    expect((await startRoute.POST(json("/x", start))).status).toBe(200);
    expect((await feedRoute.GET(new Request(`${site}/api/wam/acara/momen?lihat=kelompok&sebelum=b~`))).status).toBe(200);
    const file = await fileRoute.GET(new Request(`${site}/x?ukuran=kecil`), params());
    expect(file.status).toBe(302);
    expect(file.headers.get("location")).toContain("r2.example");
    expect(file.headers.get("cache-control")).toBe("private, max-age=3000");
    const mosaic = await mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`));
    expect(mosaic.headers.get("etag")).toBe('"v1"');
    expect((await mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`, { headers: { "if-none-match": '"v1"' } }))).status).toBe(304);
  });

  it("let the browser reuse a large photo's redirect 5 minutes only (audit L5)", async () => {
    const file = await fileRoute.GET(new Request(`${site}/x?ukuran=besar`), params());
    expect(file.headers.get("location")).toContain("x-besar.jpg");
    expect(file.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("answer an unchanged Mozaik 304 without building the manifest (audit R3)", async () => {
    for (const header of ['"v1"', 'W/"v1"', '"v0", "v1"', "*"]) {
      calls.length = 0;
      const answer = await mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`, { headers: { "if-none-match": header } }));
      expect(answer.status).toBe(304);
      expect(answer.headers.get("etag")).toBe('"v1"');
      expect(calls).toEqual(["mosaicHead"]);
    }
    calls.length = 0;
    const changed = await mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`, { headers: { "if-none-match": '"v0"' } }));
    expect(changed.status).toBe(200);
    expect(calls).toEqual(["mosaicHead", "mosaicManifest"]);
    expect((await changed.json()).data.version).toBe("v1");
  });
});

describe("Momen's DELETE", () => {
  it("passes the owner's request on and answers the server's refusal as is (403 not the owner, 409 nominated)", async () => {
    deleteRefusal = new ServiceError(403, "Hanya pemilik foto yang bisa menghapusnya.");
    const forbidden = await photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params());
    expect(forbidden.status).toBe(403);
    deleteRefusal = new ServiceError(409, "Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus.");
    const nominated = await photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params());
    expect(nominated.status).toBe(409);
    expect((await nominated.json()).message).toBe("Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus.");
    expect((await photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params())).status).toBe(200);
    // A change from another site never reaches it.
    expect((await photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: "https://evil.example" } }), params())).status).toBe(403);
  });
});
