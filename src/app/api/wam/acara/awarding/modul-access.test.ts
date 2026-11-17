import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "@/lib/main-wam/settings";
import type { MainWamSettings, MainWamViewer, ModuleSwitches } from "@/lib/main-wam/types";

/*
 * Who reaches agen D's APIs (KONTRAK §3), through the real gate: nobody signed in → 401; a module
 * that is off → 404 for everyone (no trace); a role that may not → 403 (BOD do not vote or send
 * Silent Meeting feedback; participants do not open or close it, read the recap, approve, or open
 * a session's QR). Admin WAM's module APIs need the admin session. The work itself is mocked.
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
vi.mock("@/lib/server/main-wam/modul/rate", () => ({ limitPerson: async () => undefined }));
vi.mock("@/lib/server/main-wam/modul/absen", () => ({
  checkInWithQr: record("checkIn", { kind: "tidak-dikenal" }),
  sessionQrToken: record("qrToken", { token: "AbCdEfGhIjKlMnOpQrStUvWx", session: { title: "Sesi" } }),
  sessionQrSheet: record("qrSheet", new Uint8Array([37, 80, 68, 70])),
}));
vi.mock("@/lib/server/main-wam/modul/silent", () => ({
  silentNow: record("silentNow", { view: null, migrated: true }), mySentCount: record("sent", 0),
  sendSilentFeedback: record("feedback", { sent: 1, remaining: 9 }), controlSilent: record("control", {}), silentCounts: record("counts", { count: 0, people: 0 }),
  silentRecap: record("recap", { recap: null, migrated: true }),
}));
vi.mock("@/lib/server/main-wam/modul/awards", () => ({
  awardsShown: record("awards", { categories: [], approvals: new Map(), migrated: true }), myVotes: record("myVotes", new Map()),
  nomineeViews: record("nominees", { nominees: new Map(), owners: new Map() }), voteCounts: record("counts", new Map()),
  castVote: record("vote"), approveWinner: record("approve", {}),
}));
vi.mock("@/lib/server/main-wam/modul/admin", () => ({
  adminAwards: record("adminAwards", {}), createCategory: record("createCategory", {}), updateCategory: record("updateCategory", { published: false }), deleteCategory: record("deleteCategory"),
  setNominees: record("setNominees", {}), adminSilent: record("adminSilent", {}), createQuestion: record("createQuestion", {}), updateQuestion: record("updateQuestion", {}), deleteQuestion: record("deleteQuestion"),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWx";
const ORIGIN = "https://journey.test";
const req = (method: string, body?: unknown, path = "/api/wam/acara/x") => new Request(`${ORIGIN}${path}`, {
  method, headers: { origin: ORIGIN, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const p = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const person = (roles: MainWamViewer["roles"]): MainWamViewer => ({ id: "22222222-2222-4222-8222-222222222222", name: "Rani", fullName: "Rani Contoh", department: "CoE", photo: null, roles, tester: roles.length > 0, group: null, room: null });
const ALL_ON: ModuleSwitches = { absen: true, voting: true, silent: true, survei: true, mozaik: true, karbon: true };
const withModules = (modules: Partial<ModuleSwitches>) => { state.settings = { ...defaultSettings(), migrated: true, mode: "semua", modules: { ...defaultSettings().modules, ...modules } }; };

async function routes() {
  const [absen, qr, silent, feedback, control, recap, awards, vote, approve] = await Promise.all([
    import("../absen/[token]/route"), import("../kelola/qr/[sesiId]/route"), import("../silent-meeting/route"), import("../silent-meeting/masukan/route"),
    import("../silent-meeting/[id]/kontrol/route"), import("../silent-meeting/rekap/route"), import("./route"), import("./[id]/suara/route"), import("./[id]/setujui/route"),
  ]);
  return {
    absen: () => absen.POST(req("POST", {}), p({ token: TOKEN })),
    qrGet: () => qr.GET(req("GET"), p({ sesiId: ID })),
    qrNew: () => qr.POST(req("POST", {}), p({ sesiId: ID })),
    silent: () => silent.GET(req("GET")),
    feedback: () => feedback.POST(req("POST", { questionId: ID, topic: "", body: "Rapat terlalu panjang." })),
    control: () => control.POST(req("POST", { action: "buka" }), p({ id: ID })),
    recap: () => recap.GET(),
    awards: () => awards.GET(),
    vote: () => vote.PUT(req("PUT", { nomineeId: ID }), p({ id: ID })),
    approve: () => approve.POST(req("POST", { nomineeId: ID }), p({ id: ID })),
  };
}
type Name = keyof Awaited<ReturnType<typeof routes>>;
async function statuses(names?: Name[]) {
  const all = await routes();
  const out: Partial<Record<Name, number>> = {};
  for (const name of names ?? (Object.keys(all) as Name[])) out[name] = (await all[name]()).status;
  return out;
}

beforeEach(() => { withModules(ALL_ON); state.viewer = person([]); state.admin = true; state.calls = []; });

describe("agen D's participant APIs", () => {
  it("ask to sign in first", async () => {
    state.viewer = null;
    expect(Object.values(await statuses()).every(status => status === 401)).toBe(true);
    expect(state.calls).toEqual([]);
  });

  it("do not exist while their module is off (a role's own action: 404; another role's: 403 as always)", async () => {
    withModules({});
    const off = { absen: 404, qrGet: 404, qrNew: 404, silent: 404, awards: 404 };
    state.viewer = person([]);
    expect(await statuses()).toEqual({ ...off, feedback: 404, vote: 404, control: 403, recap: 403, approve: 403 });
    state.viewer = person(["panitia"]);
    expect(await statuses()).toEqual({ ...off, feedback: 404, vote: 404, control: 404, recap: 403, approve: 403 });
    state.viewer = person(["bod"]);
    expect(await statuses()).toEqual({ ...off, feedback: 403, vote: 403, control: 403, recap: 404, approve: 404 });
    expect(state.calls).toEqual([]);
  });

  it("keep each module apart: only the module that is off disappears", async () => {
    withModules({ voting: true });
    expect(await statuses(["awards", "vote", "silent", "absen"])).toEqual({ awards: 200, vote: 200, silent: 404, absen: 404 });
    withModules({ silent: true, absen: true });
    expect(await statuses(["awards", "silent", "feedback", "absen"])).toEqual({ awards: 404, silent: 200, feedback: 200, absen: 200 });
  });

  it("let a participant check in, send feedback and vote, but nothing of panitia or BOD", async () => {
    expect(await statuses()).toEqual({ absen: 200, qrGet: 403, qrNew: 403, silent: 200, feedback: 200, control: 403, recap: 403, awards: 200, vote: 200, approve: 403 });
  });

  it("let panitia open or close Silent Meeting and handle the session's QR", async () => {
    state.viewer = person(["panitia"]);
    expect(await statuses(["control", "qrGet", "qrNew", "recap", "approve"])).toEqual({ control: 200, qrGet: 200, qrNew: 200, recap: 403, approve: 403 });
    state.viewer = person(["admin"]);
    expect(await statuses(["control", "qrGet"])).toEqual({ control: 200, qrGet: 200 });
  });

  it("let the BOD read the recap and approve, but not vote or send feedback", async () => {
    state.viewer = person(["bod"]);
    expect(await statuses(["recap", "approve", "vote", "feedback", "control", "qrGet"])).toEqual({ recap: 200, approve: 200, vote: 403, feedback: 403, control: 403, qrGet: 403 });
    state.calls = [];
    // A BOD's scan is answered ("tidak perlu absen"), never refused with an error.
    expect((await (await routes()).absen()).status).toBe(200);
  });

  it("refuse a request from another site and an input outside the schema", async () => {
    const all = await import("../silent-meeting/masukan/route");
    const foreign = new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: "https://lain.example", "content-type": "application/json" }, body: JSON.stringify({ questionId: ID, body: "Hai" }) });
    expect((await all.POST(foreign)).status).toBe(403);
    expect((await all.POST(req("POST", { questionId: ID, body: "Hai", employeeId: ID }))).status).toBe(422);
    expect((await all.POST(req("POST", { questionId: ID, body: "   " }))).status).toBe(422);
    const vote = await import("./[id]/suara/route");
    expect((await vote.PUT(req("PUT", { nomineeId: "bukan" }), p({ id: ID }))).status).toBe(422);
    expect(state.calls).not.toContain("feedback");
    expect(state.calls).not.toContain("vote");
  });
});

describe("Admin WAM → Main WAM module APIs", () => {
  async function adminCalls() {
    const [awards, award, nominees, silent, question] = await Promise.all([
      import("../../../admin/wam/main/awarding/route"), import("../../../admin/wam/main/awarding/[id]/route"), import("../../../admin/wam/main/awarding/[id]/nominasi/route"),
      import("../../../admin/wam/main/silent-meeting/route"), import("../../../admin/wam/main/silent-meeting/[id]/route"),
    ]);
    const category = { title: "Rekan paling suportif", method: "juri", nomineeKind: "orang" };
    const q = { sessionId: ID, question: "Apa yang perlu diubah?" };
    return [
      () => awards.GET(), () => awards.POST(req("POST", category)), () => award.PATCH(req("PATCH", category), p({ id: ID })), () => award.DELETE(req("DELETE"), p({ id: ID })),
      () => nominees.PUT(req("PUT", { nominees: [{ label: "CoE" }] }), p({ id: ID })),
      () => silent.GET(), () => silent.POST(req("POST", q)), () => question.PATCH(req("PATCH", q), p({ id: ID })), () => question.DELETE(req("DELETE"), p({ id: ID })),
    ];
  }

  it("need the admin session", async () => {
    state.admin = false;
    for (const call of await adminCalls()) expect((await call()).status).toBe(401);
    expect(state.calls).toEqual([]);
    state.admin = true;
    for (const call of await adminCalls()) expect((await call()).status).toBe(200);
  });
});
