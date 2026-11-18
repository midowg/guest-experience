import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/server/config";

/*
 * Momen's and Mozaik's APIs: each calls the gate first (who is refused: no session 401, Main WAM not
 * on for the person 404, module Mozaik off 404), checks the origin of every change, and validates.
 */

let gate: "ok" | 401 | 404 = "ok";
let mosaicOff = false;
let limited = false;
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
  photoReactors: async () => { calls.push("reactors"); return { reactors: [{ person: { id: "sari", name: "Sari", photo: null }, emoji: "🔥", mine: false, at: "2027-01-05T03:00:00Z" }] }; },
  setReaction: async (_viewer: unknown, _id: string, emoji: string | null) => { calls.push(`react:${emoji}`); return { reactions: emoji ? [{ emoji, count: 1, mine: true }] : [] }; },
  personLimit: async (scope: string, _person: string, limit: number) => { calls.push(`limit:${scope}:${limit}`); if (limited) throw new ServiceError(429, "Terlalu sering dalam waktu singkat. Coba lagi beberapa menit lagi."); },
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
const reactionRoute = await import("./[id]/reaksi/route");
const reportRoute = await import("./[id]/laporan/route");
const fileRoute = await import("./[id]/berkas/route");
const mosaicRoute = await import("../mozaik/route");

const HEART = "❤️";
const ID = "33333333-3333-4333-8333-333333333333";
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const site = "http://localhost:3100";
const json = (path: string, body: unknown, method = "POST", origin = site) => new Request(`${site}${path}`, { method, headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const start = { clientId: "22222222-2222-4222-8222-222222222222", sessionId: null, takenAt: "2027-01-05T08:20:00.000Z", width: 1280, height: 1600, size: 400_000, thumbSize: 40_000, tileSize: 9_000 };

beforeEach(() => { gate = "ok"; mosaicOff = false; limited = false; calls.length = 0; });

describe("Momen APIs refuse who they are not for", () => {
  it("401 without a session, 404 when Main WAM is not on for the person, on every route", async () => {
    for (const status of [401, 404] as const) {
      gate = status;
      const answers = await Promise.all([
        feedRoute.GET(new Request(`${site}/api/wam/acara/momen`)),
        startRoute.POST(json("/api/wam/acara/momen/unggah", start)),
        seenRoute.POST(json("/api/wam/acara/momen/dilihat", { ids: [ID] })),
        photoRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params()),
        reactionRoute.GET(new Request(`${site}/x`), params()),
        reactionRoute.PUT(json("/x", { emoji: HEART }, "PUT"), params()),
        reactionRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params()),
        reportRoute.POST(json("/x", { reason: "tidak_pantas" }), params()),
        fileRoute.GET(new Request(`${site}/x`), params()),
        mosaicRoute.GET(new Request(`${site}/api/wam/acara/mozaik`)),
      ]);
      expect(answers.map(answer => answer.status)).toEqual(Array(10).fill(status));
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

describe("the reaction API", () => {
  const put = (body: unknown, id = ID, origin = site) => reactionRoute.PUT(json("/x", body, "PUT", origin), params(id));
  const del = (id = ID) => reactionRoute.DELETE(new Request(`${site}/x`, { method: "DELETE", headers: { origin: site } }), params(id));

  it("takes an emoji from the app's list only, never free text", async () => {
    for (const emoji of ["🤡", "hore", "❤", "", "❤️❤️", HEART + " "]) expect((await put({ emoji })).status, `emoji ${JSON.stringify(emoji)}`).toBe(422);
    expect((await put({})).status).toBe(422);
    expect((await put({ emoji: 5 })).status).toBe(422);
    expect((await put({ emoji: HEART, extra: "x" })).status).toBe(200);
    expect((await put({ emoji: "🙏" })).status).toBe(200);
    expect((await put({ emoji: "🥇" })).status).toBe(200);
    expect(calls.filter(call => call.startsWith("react:"))).toEqual([`react:${HEART}`, "react:🙏", "react:🥇"]);
  });

  it("answers the photo's reactions, and DELETE takes the person's own back", async () => {
    const answer = await put({ emoji: "🔥" });
    expect((await answer.json()).data).toEqual({ reactions: [{ emoji: "🔥", count: 1, mine: true }] });
    const gone = await del();
    expect(gone.status).toBe(200);
    expect((await gone.json()).data).toEqual({ reactions: [] });
    expect(calls).toContain("react:null");
  });

  it("refuses another site, a photo address that is not an id, and a person over the limit (per person, 200 per 10 minutes)", async () => {
    expect((await put({ emoji: HEART }, ID, "https://evil.example")).status).toBe(403);
    expect((await put({ emoji: HEART }, "bukan-id")).status).toBe(422);
    expect((await del("bukan-id")).status).toBe(422);
    expect(calls).toEqual([]);
    limited = true;
    expect((await put({ emoji: HEART })).status).toBe(429);
    expect((await del()).status).toBe(429);
    expect(calls.filter(call => call.startsWith("react:"))).toEqual([]);
    expect(calls).toContain("limit:mw-foto-reaksi:200");
  });
});

describe("the list of who reacted (GET on the reaction address)", () => {
  const get = (id = ID) => reactionRoute.GET(new Request(`${site}/x`), params(id));

  it("answers who reacted with what, never from a cache, with a limit per person", async () => {
    const answer = await get();
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect((await answer.json()).data.reactors).toEqual([{ person: { id: "sari", name: "Sari", photo: null }, emoji: "🔥", mine: false, at: "2027-01-05T03:00:00Z" }]);
    expect(calls).toEqual(["limit:mw-foto-reaktor:120", "reactors"]);
  });

  it("refuses an address that is not a photo id and a person over the limit", async () => {
    expect((await get("bukan-id")).status).toBe(422);
    expect(calls).toEqual([]);
    limited = true;
    expect((await get()).status).toBe(429);
    expect(calls).not.toContain("reactors");
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
    expect((await feedRoute.GET(new Request(`${site}/api/wam/acara/momen?sebelum=b~`))).status).toBe(200);
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
