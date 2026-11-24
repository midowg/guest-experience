import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamSettings, MainWamViewer, ModuleSwitches } from "@/lib/main-wam/types";

/*
 * Who reaches Misi's APIs, through the real gate: nobody signed in → 401; the module off, and a BOD
 * (who do not take part) → 404, one answer. Bad input → 422, another site → 403. Admin WAM's Misi APIs
 * need the admin session. The work itself is mocked.
 */

const state = vi.hoisted(() => ({ settings: null as unknown as MainWamSettings, viewer: null as MainWamViewer | null, admin: true, calls: [] as string[] }));

vi.mock("@/lib/pra-wam/session-token", () => ({ praWamSecret: () => "x".repeat(40) }));
vi.mock("@/lib/server/main-wam/settings", () => ({ readMainWamSettings: async () => state.settings }));
vi.mock("@/lib/server/main-wam/viewer", () => ({ mainWamViewer: async () => state.viewer, testsMainWam: async () => false }));
vi.mock("@/lib/server/pra-wam/session", () => ({ currentMember: async () => state.viewer }));
vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return { requireApiAdmin: async () => { if (!state.admin) throw new ServiceError(401, "Masuk sebagai admin dulu."); return "admin"; } };
});
const record = (name: string, value: unknown = null) => async () => { state.calls.push(name); return value; };
vi.mock("@/lib/server/main-wam/misi/read", () => ({
  loadMisi: record("loadMisi", { migrated: true, sample: false, items: [], summary: {}, points: 0, place: null, leaderboardOpen: true, taggedIn: [], settings: {} }),
  loadLeaderboard: record("loadLeaderboard", { migrated: true, open: true, rows: [] }),
}));
vi.mock("@/lib/server/main-wam/misi/actions", () => ({
  checkPosition: record("checkPosition", { inside: true }), checkIn: record("checkIn", { status: "disetujui" }),
  startPhoto: record("startPhoto", { id: "x", token: "t", uploads: {} }), confirmPhoto: record("confirmPhoto", { status: "disetujui", reasons: [] }),
}));
vi.mock("@/lib/server/main-wam/misi/review", () => ({ listReviewQueue: record("listReviewQueue", []) }));
vi.mock("@/lib/server/main-wam/misi/deteksi", () => ({
  setAutoSwitch: record("setAutoSwitch", { on: true, stored: true }), checkMyPhotos: record("checkMyPhotos", { checked: 0, results: [] }), submitSuggestion: record("submitSuggestion", { completionStatus: "perlu_ditinjau" }),
  dismissSuggestion: record("dismissSuggestion"), takeBack: record("takeBack"), detectionOfPhoto: record("detectionOfPhoto", { pending: false, items: [] }),
}));
vi.mock("@/lib/server/main-wam/misi/deteksi-store", () => ({ readAutoPref: record("readAutoPref", { on: true, stored: true }) }));
vi.mock("@/lib/server/main-wam/misi/tags", () => ({ removeMyTag: record("removeMyTag") }));
vi.mock("@/lib/server/main-wam/misi/admin", () => ({
  adminMisi: record("adminMisi", {}), createMission: record("createMission", {}), updateMission: record("updateMission", {}), deleteMission: record("deleteMission"),
  saveMissionSettings: record("saveMissionSettings", {}), grantCompletion: record("grantCompletion"), reviewCompletion: record("reviewCompletion"), deleteCompletion: record("deleteCompletion"),
  addManualPoints: record("addManualPoints"), deleteManualEntry: record("deleteManualEntry"), proofRedirect: record("proofRedirect", "https://storage.test/x.jpg"),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://journey.test";
const req = (method: string, body?: unknown) => new Request(`${ORIGIN}/api/x`, {
  method, headers: { origin: ORIGIN, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const p = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
const person = (roles: MainWamViewer["roles"]): MainWamViewer => ({ id: "22222222-2222-4222-8222-222222222222", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: roles.length > 0, group: null, room: null });
const ALL_ON: ModuleSwitches = { absen: true, voting: true, silent: true, survei: true, mozaik: true, karbon: true, kuis: true, ceklis: true, misi: true };
const withModules = (modules: Partial<ModuleSwitches>) => { state.settings = { ...defaultSettings(), migrated: true, mode: "semua", modules: { ...defaultSettings().modules, ...modules } }; };
const position = { latitude: -7.87, longitude: 112.52, accuracy: 12, at: new Date().toISOString() };
const photo = { clientId: ID, position, size: 400_000, thumbSize: 40_000, tileSize: 8_000, width: 1280, height: 1600, tags: [] as string[] };

async function routes() {
  const [list, board, check, checkin, start, keep, untag, switchRoute, checkMine, suggest, takeBack, ofPhoto] = await Promise.all([
    import("./route"), import("./peringkat/route"), import("./[id]/cek/route"), import("./[id]/checkin/route"), import("./[id]/foto/unggah/route"), import("./[id]/foto/simpan/route"), import("./tag/[photoId]/route"),
    import("./deteksi/route"), import("./periksa/route"), import("./[id]/ajukan/route"), import("./[id]/otomatis/route"), import("../momen/[id]/deteksi/route"),
  ]);
  return {
    list: () => list.GET(),
    board: () => board.GET(),
    check: () => check.POST(req("POST", { kind: "checkin", position }), p({ id: ID })),
    checkin: () => checkin.POST(req("POST", { position }), p({ id: ID })),
    start: () => start.POST(req("POST", photo), p({ id: ID })),
    keep: () => keep.POST(req("POST", { ...photo, token: `1767000000.${"a".repeat(64)}` }), p({ id: ID })),
    untag: () => untag.DELETE(req("DELETE"), p({ photoId: ID })),
    switchRead: () => switchRoute.GET(),
    switchSave: () => switchRoute.PUT(req("PUT", { on: false })),
    checkMine: () => checkMine.POST(req("POST")),
    suggest: () => suggest.POST(req("POST", { photoId: ID }), p({ id: ID })),
    dismiss: () => suggest.DELETE(req("DELETE", { photoId: ID }), p({ id: ID })),
    takeBack: () => takeBack.DELETE(req("DELETE"), p({ id: ID })),
    ofPhoto: () => ofPhoto.GET(req("GET"), p({ id: ID })),
  };
}
type Name = keyof Awaited<ReturnType<typeof routes>>;
async function statuses() {
  const all = await routes();
  const out: Partial<Record<Name, number>> = {};
  for (const name of Object.keys(all) as Name[]) out[name] = (await all[name]()).status;
  return out;
}

beforeEach(() => { withModules(ALL_ON); state.viewer = person([]); state.admin = true; state.calls = []; });

describe("Misi's participant APIs", () => {
  it("ask to sign in first", async () => {
    state.viewer = null;
    expect(Object.values(await statuses()).every(status => status === 401)).toBe(true);
    expect(state.calls).toEqual([]);
  });

  it("do not exist while the module is off, for every role: one answer, 404", async () => {
    withModules({ misi: false });
    for (const roles of [[], ["panitia"], ["admin"], ["bod"]] as MainWamViewer["roles"][]) {
      state.viewer = person(roles);
      expect(Object.values(await statuses()).every(status => status === 404)).toBe(true);
    }
    expect(state.calls).toEqual([]);
  });

  it("do not exist for a BOD, who are not ranked and do not take part (404, not 403)", async () => {
    state.viewer = person(["bod"]);
    expect(Object.values(await statuses()).every(status => status === 404)).toBe(true);
    expect(state.calls).toEqual([]);
  });

  it("serve a participant, panitia and an admin", async () => {
    for (const roles of [[], ["panitia"], ["admin"]] as MainWamViewer["roles"][]) {
      state.viewer = person(roles);
      expect(Object.values(await statuses()).every(status => status === 200)).toBe(true);
    }
  });

  it("do not send the admin settings to the phone", async () => {
    const list = await import("./route");
    const body = await (await list.GET()).json() as { data: Record<string, unknown> };
    expect(body.data).not.toHaveProperty("settings");
    expect(body.data).toHaveProperty("items");
  });

  it("stay apart from the other modules", async () => {
    withModules({ misi: true, voting: false, absen: false, karbon: false, silent: false });
    expect(Object.values(await statuses()).every(status => status === 200)).toBe(true);
  });

  it("refuse another site and an input outside the schema, and save nothing", async () => {
    const checkin = await import("./[id]/checkin/route");
    const foreign = new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: "https://lain.example", "content-type": "application/json" }, body: JSON.stringify({ position }) });
    expect((await checkin.POST(foreign, p({ id: ID }))).status).toBe(403);
    expect((await checkin.POST(req("POST", { position, employeeId: ID }), p({ id: ID }))).status).toBe(422);
    expect((await checkin.POST(req("POST", { position: { latitude: 200, longitude: 0, accuracy: 3, at: new Date().toISOString() } }), p({ id: ID }))).status).toBe(422);
    expect((await checkin.POST(req("POST", { position }), p({ id: "bukan-uuid" }))).status).toBe(422);
    const start = await import("./[id]/foto/unggah/route");
    expect((await start.POST(req("POST", { ...photo, size: 9_000_000 }), p({ id: ID }))).status).toBe(422);
    const keep = await import("./[id]/foto/simpan/route");
    expect((await keep.POST(req("POST", { ...photo, token: "x" }), p({ id: ID }))).status).toBe(422);
    const check = await import("./[id]/cek/route");
    expect((await check.POST(req("POST", { kind: "lain", position }), p({ id: ID }))).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("refuse the detection APIs from another site, with input outside the schema, and change nothing", async () => {
    const switchRoute = await import("./deteksi/route");
    const suggest = await import("./[id]/ajukan/route");
    const takeBack = await import("./[id]/otomatis/route");
    const foreign = (method: string, body?: unknown) => new Request(`${ORIGIN}/x`, { method, headers: { origin: "https://lain.example", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    expect((await switchRoute.PUT(foreign("PUT", { on: true }))).status).toBe(403);
    expect((await suggest.POST(foreign("POST", { photoId: ID }), p({ id: ID }))).status).toBe(403);
    expect((await takeBack.DELETE(foreign("DELETE"), p({ id: ID }))).status).toBe(403);
    expect((await switchRoute.PUT(req("PUT", { on: "ya" }))).status).toBe(422);
    expect((await switchRoute.PUT(req("PUT", { on: true, lain: 1 }))).status).toBe(422);
    expect((await suggest.POST(req("POST", { photoId: "bukan-uuid" }), p({ id: ID }))).status).toBe(422);
    expect((await suggest.POST(req("POST", { photoId: ID, status: "disetujui" }), p({ id: ID }))).status).toBe(422);
    expect((await suggest.POST(req("POST", { photoId: ID }), p({ id: "bukan-uuid" }))).status).toBe(422);
    expect((await takeBack.DELETE(req("DELETE"), p({ id: "bukan-uuid" }))).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("answer the detection of a photo and the checks without any position or place", async () => {
    const all = await routes();
    const body = JSON.stringify(await (await all.ofPhoto()).json()) + JSON.stringify(await (await all.checkMine()).json()) + JSON.stringify(await (await all.switchRead()).json());
    expect(body).not.toMatch(/latitude|longitude|geo|accuracy/i);
  });
});

describe("Admin WAM → Main WAM → Misi APIs", () => {
  async function adminCalls() {
    const [list, one, grant, completion, proof, points, point, settings, review] = await Promise.all([
      import("../../../admin/wam2026/misi/route"), import("../../../admin/wam2026/misi/[id]/route"), import("../../../admin/wam2026/misi/[id]/catat/route"),
      import("../../../admin/wam2026/misi/penyelesaian/[id]/route"), import("../../../admin/wam2026/misi/penyelesaian/[id]/foto/route"),
      import("../../../admin/wam2026/misi/poin/route"), import("../../../admin/wam2026/misi/poin/[id]/route"), import("../../../admin/wam2026/misi/pengaturan/route"),
      import("../../../admin/wam2026/misi/tinjauan/route"),
    ]);
    const mission = { title: "Foto apel", kind: "foto", points: 40 };
    return [
      () => list.GET(), () => list.POST(req("POST", mission)), () => one.PATCH(req("PATCH", mission), p({ id: ID })), () => one.DELETE(req("DELETE"), p({ id: ID })),
      () => grant.POST(req("POST", { employeeId: ID }), p({ id: ID })),
      () => completion.PATCH(req("PATCH", { status: "ditolak", note: "Bukan di tugu" }), p({ id: ID })), () => completion.DELETE(req("DELETE"), p({ id: ID })),
      () => proof.GET(req("GET"), p({ id: ID })),
      () => points.POST(req("POST", { employeeId: ID, points: 10, note: "Bantu panitia" })), () => point.DELETE(req("DELETE"), p({ id: ID })),
      () => settings.PUT(req("PUT", { defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true })),
      () => review.GET(),
    ];
  }

  it("need the admin session", async () => {
    state.admin = false;
    for (const call of await adminCalls()) expect((await call()).status).toBe(401);
    expect(state.calls).toEqual([]);
    state.admin = true;
    for (const call of await adminCalls()) expect([200, 302]).toContain((await call()).status);
  });

  it("refuse a mission that breaks the schema, points by hand of zero, and a decision that is not one", async () => {
    const list = await import("../../../admin/wam2026/misi/route");
    expect((await list.POST(req("POST", { title: "Taman", kind: "checkin", points: 30 }))).status).toBe(422);
    const points = await import("../../../admin/wam2026/misi/poin/route");
    expect((await points.POST(req("POST", { employeeId: ID, points: 0, note: "Nol" }))).status).toBe(422);
    const completion = await import("../../../admin/wam2026/misi/penyelesaian/[id]/route");
    expect((await completion.PATCH(req("PATCH", { status: "menunggu" }), p({ id: ID }))).status).toBe(422);
    // A rejection without its reason is refused: the person reads that reason.
    expect((await completion.PATCH(req("PATCH", { status: "ditolak" }), p({ id: ID }))).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it("serve the review queue to an admin only, and refuse a decision from another site", async () => {
    const review = await import("../../../admin/wam2026/misi/tinjauan/route");
    state.admin = false;
    expect((await review.GET()).status).toBe(401);
    expect(state.calls).toEqual([]);
    state.admin = true;
    const body = await (await review.GET()).json() as { data: { items: unknown[] } };
    expect(body.data.items).toEqual([]);
    const completion = await import("../../../admin/wam2026/misi/penyelesaian/[id]/route");
    const foreign = new Request(`${ORIGIN}/x`, { method: "PATCH", headers: { origin: "https://lain.example", "content-type": "application/json" }, body: JSON.stringify({ status: "disetujui" }) });
    expect((await completion.PATCH(foreign, p({ id: ID }))).status).toBe(403);
    expect(state.calls).toEqual(["listReviewQueue"]);
  });
});
