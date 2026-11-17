import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/lib/server/config";
import { sampleSettings, sampleViewers } from "@/lib/main-wam/sample";

/*
 * Agen A's APIs (mainWamApi.home, agenda, session, notifications, guideFile): who is refused (no
 * session 401, Main WAM not on for them 404, another site 403), what is checked (zod), and that a
 * person only ever touches their own notes.
 */

type Gate = "masuk" | "login" | "tutup";
let gate: Gate = "masuk";
const viewer = sampleViewers.peserta;

vi.mock("@/lib/server/main-wam/gate", () => ({
  requireMainWamApi: async () => {
    if (gate === "login") throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
    if (gate === "tutup") throw new ServiceError(404, "Halaman tidak ditemukan.");
    return { viewer, settings: sampleSettings() };
  },
}));
const loadHome = vi.fn(async () => ({ migrated: true, now: { kind: "kosong" }, session: null, card: null, refreshAt: null, failed: false }));
vi.mock("@/lib/server/main-wam/peserta/home", () => ({ loadHome }));
const loadSession = vi.fn<(context: unknown, id: string) => Promise<unknown>>(async () => null);
const loadAgenda = vi.fn(async (_context: unknown, hari?: string) => ({ day: Number(hari ?? 2) }));
vi.mock("@/lib/server/main-wam/peserta/agenda", () => ({ loadAgenda, loadSession }));
vi.mock("@/lib/server/main-wam/peserta/saya", () => ({ loadNotifications: async () => ({ migrated: true, today: [], earlier: [], unread: 0 }) }));
const markMainWamRead = vi.fn(async () => undefined);
vi.mock("@/lib/server/main-wam/notes", () => ({ markMainWamRead }));
const limitPerson = vi.fn(async () => undefined);
vi.mock("@/lib/server/main-wam/peserta/limit", () => ({ limitPerson }));
const guideFileKey = vi.fn<(id: string) => Promise<{ key: string; mime: string } | null>>(async () => null);
vi.mock("@/lib/server/main-wam/read", () => ({ guideFileKey }));
vi.mock("@/lib/server/r2", () => ({ presignDownload: async (key: string) => `https://r2.example/${key}?sig=1` }));

const beranda = await import("./route");
const agenda = await import("../agenda/route");
const session = await import("../agenda/[id]/route");
const notes = await import("../notifikasi/route");
const file = await import("../panduan/[id]/berkas/route");

const ORIGIN = "http://localhost:3100";
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const post = (path: string, body: unknown, origin = ORIGIN) => new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const ID = "00000000-0000-4000-8004-000000000010";

beforeEach(() => { gate = "masuk"; vi.clearAllMocks(); });

describe("every API of agen A", () => {
  const calls = () => [
    beranda.GET(), agenda.GET(get("/api/wam/acara/agenda")), session.GET(get(`/api/wam/acara/agenda/${ID}`), params({ id: ID })),
    notes.GET(), notes.POST(post("/api/wam/acara/notifikasi", {})), file.GET(get(`/api/wam/acara/panduan/${ID}/berkas`), params({ id: ID })),
  ];
  it("answers 401 without a session and 404 when Main WAM is not on for the person, reading nothing", async () => {
    for (const [state, status] of [["login", 401], ["tutup", 404]] as const) {
      gate = state;
      for (const response of await Promise.all(calls())) expect(response.status).toBe(status);
    }
    expect(loadHome).not.toHaveBeenCalled();
    expect(markMainWamRead).not.toHaveBeenCalled();
    expect(guideFileKey).not.toHaveBeenCalled();
  });
});

describe("Beranda and Agenda", () => {
  it("give the person's Beranda and a day of the agenda", async () => {
    const home = await beranda.GET();
    expect(home.status).toBe(200);
    expect(loadHome).toHaveBeenCalledWith(expect.objectContaining({ viewer }), expect.any(Date));
    const day = await agenda.GET(get("/api/wam/acara/agenda?hari=3"));
    expect((await day.json()).data).toEqual({ day: 3 });
  });

  it("refuse a day that is not a number", async () => {
    expect((await agenda.GET(get("/api/wam/acara/agenda?hari=semua"))).status).toBe(422);
  });

  it("a session that is a draft or unknown is not found", async () => {
    expect((await session.GET(get(`/api/wam/acara/agenda/${ID}`), params({ id: ID }))).status).toBe(404);
    loadSession.mockResolvedValueOnce({ view: { title: "Pemaparan" }, contact: null, denah: null, session: { id: ID } });
    const found = await session.GET(get(`/api/wam/acara/agenda/${ID}`), params({ id: ID }));
    expect(found.status).toBe(200);
    expect((await found.json()).data).toEqual({ view: { title: "Pemaparan" }, contact: null, denah: null });
  });
});

describe("Notifikasi", () => {
  it("marks the person's own notes read, one or all, within a limit", async () => {
    expect((await notes.POST(post("/api/wam/acara/notifikasi", {}))).status).toBe(200);
    expect(markMainWamRead).toHaveBeenLastCalledWith(viewer.id, undefined);
    expect((await notes.POST(post("/api/wam/acara/notifikasi", { id: ID }))).status).toBe(200);
    expect(markMainWamRead).toHaveBeenLastCalledWith(viewer.id, ID);
    expect(limitPerson).toHaveBeenCalledWith("notifikasi-dibaca", viewer.id, 60);
  });

  it("refuses another site, a bad id, and another person's id field", async () => {
    expect((await notes.POST(post("/api/wam/acara/notifikasi", {}, "https://evil.example"))).status).toBe(403);
    expect((await notes.POST(post("/api/wam/acara/notifikasi", { id: "1; drop" }))).status).toBe(422);
    expect((await notes.POST(post("/api/wam/acara/notifikasi", { employeeId: "someone-else" }))).status).toBe(422);
    expect(markMainWamRead).not.toHaveBeenCalled();
  });
});

describe("a guide's file", () => {
  it("is not found unless published with a file; then a short-lived private address", async () => {
    expect((await file.GET(get(`/api/wam/acara/panduan/${ID}/berkas`), params({ id: ID }))).status).toBe(404);
    guideFileKey.mockResolvedValueOnce({ key: "main-wam/panduan/denah.webp", mime: "image/webp" });
    const response = await file.GET(get(`/api/wam/acara/panduan/${ID}/berkas`), params({ id: ID }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://r2.example/main-wam/panduan/denah.webp?sig=1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
