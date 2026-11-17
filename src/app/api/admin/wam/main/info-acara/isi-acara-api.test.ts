import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankSession } from "@/lib/main-wam/admin/rundown";
import { blankTrip } from "@/lib/main-wam/admin/trips";

/*
 * Every API of Admin WAM → Main WAM's isi acara (agen E): the admin session first (401 without
 * it, before anything is read), the same-site check (403), zod on the body (422), ids that are
 * not uuids are "not found" (404), and only then the server function. "Kabari peserta" is rate
 * limited. The server functions are stand-ins that record their calls.
 */
const state = vi.hoisted(() => ({ admin: true, calls: [] as string[], limited: [] as string[] }));

vi.mock("@/lib/server/admin-session", async () => {
  const { ServiceError } = await import("@/lib/server/config");
  return { requireApiAdmin: async () => { if (!state.admin) throw new ServiceError(401, "Sesi berakhir."); return "admin"; } };
});
vi.mock("@/lib/server/http", async importActual => ({
  ...(await importActual<typeof import("@/lib/server/http")>()),
  enforceRateLimit: async (_request: Request, scope: string) => { state.limited.push(scope); },
}));
const record = (names: string[]) => Object.fromEntries(names.map(name => [name, async () => { state.calls.push(name); return { sessions: [], groups: [], trips: [], seats: [], guides: [], links: {}, storage: true, recipients: 0, added: 1, saved: 1, id: "x" }; }]));
vi.mock("@/lib/server/main-wam/admin/sessions", () => record(["createSession", "importSessions", "shiftSessions", "updateSession", "copySession", "deleteSession"]));
vi.mock("@/lib/server/main-wam/admin/groups", () => record(["createGroup", "importGroups", "updateGroup", "deleteGroup", "setGroupMembers", "createActivityGroup", "importActivityGroups", "updateActivityGroup", "deleteActivityGroup"]));
vi.mock("@/lib/server/main-wam/admin/rooms", () => record(["saveRoomDetail"]));
vi.mock("@/lib/server/main-wam/admin/trips", () => record(["createTrip", "updateTrip", "deleteTrip", "setSeats"]));
vi.mock("@/lib/server/main-wam/admin/guides", () => record(["createGuide", "updateGuide", "deleteGuide", "startGuideFile", "confirmGuideFile"]));
vi.mock("@/lib/server/main-wam/admin/event-info", () => ({ saveEventInfo: async () => { state.calls.push("saveEventInfo"); return { groupsPublished: true }; } }));
vi.mock("@/lib/server/main-wam/admin/common", () => ({ adminActor: async () => ({ employeeId: null, name: "Admin" }) }));

const ID = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://journey.test";
const send = (method: string, body?: unknown, origin = ORIGIN) => new Request(`${ORIGIN}/api/admin/wam/main/x`, {
  method, headers: { origin, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});
const params = <K extends string>(key: K, value = ID) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });

const session = { ...blankSession("2027-01-05"), title: "Pemaparan departemen" };
const trip = { ...blankTrip("berangkat", "2027-01-04"), title: "Kereta" };
const guide = { kind: "denah", title: "Denah venue", body: "", sort: 1, published: false };

async function calls() {
  const [sesi, sesiId, kelompok, kelompokId, anggota, kegiatan, kegiatanId, kamar, perjalanan, perjalananId, kursi, panduan, panduanId, unggah, simpan, info] = await Promise.all([
    import("../sesi/route"), import("../sesi/[id]/route"), import("../kelompok/route"), import("../kelompok/[id]/route"), import("../kelompok/[id]/anggota/route"),
    import("../kelompok-kegiatan/route"), import("../kelompok-kegiatan/[id]/route"), import("../kamar/[roomId]/route"), import("../perjalanan/route"),
    import("../perjalanan/[id]/route"), import("../perjalanan/[id]/kursi/route"), import("../panduan/route"), import("../panduan/[id]/route"),
    import("../panduan/unggah/route"), import("../panduan/simpan/route"), import("./route"),
  ]);
  return {
    createSession: (origin?: string) => sesi.POST(send("POST", { action: "tambah", session }, origin)),
    importSessions: (origin?: string) => sesi.POST(send("POST", { action: "impor", sessions: [session] }, origin)),
    shiftSessions: (origin?: string) => sesi.POST(send("POST", { action: "geser", ids: [ID], minutes: 30, notify: true }, origin)),
    updateSession: (origin?: string) => sesiId.PUT(send("PUT", { session, notify: false }, origin), params("id")),
    copySession: (origin?: string) => sesiId.POST(send("POST", { date: null }, origin), params("id")),
    deleteSession: (origin?: string) => sesiId.DELETE(send("DELETE", undefined, origin), params("id")),
    createGroup: (origin?: string) => kelompok.POST(send("POST", { action: "tambah", group: { number: 4, name: "Arjuno" } }, origin)),
    importGroups: (origin?: string) => kelompok.POST(send("POST", { action: "impor", groups: [{ number: 4, name: "Arjuno", employeeIds: [PERSON], coordinatorId: PERSON }] }, origin)),
    updateGroup: (origin?: string) => kelompokId.PUT(send("PUT", { number: 4, name: "Arjuno" }, origin), params("id")),
    deleteGroup: (origin?: string) => kelompokId.DELETE(send("DELETE", undefined, origin), params("id")),
    setGroupMembers: (origin?: string) => anggota.PUT(send("PUT", { employeeIds: [PERSON], coordinatorId: null }, origin), params("id")),
    createActivityGroup: (origin?: string) => kegiatan.POST(send("POST", { action: "tambah", group: { sessionId: ID, kind: "pos", label: "Pos 2", note: "", sort: 2 } }, origin)),
    importActivityGroups: (origin?: string) => kegiatan.POST(send("POST", { action: "impor", sessionId: ID, groups: [{ kind: "pos", label: "Pos 2", note: "", sort: 2, employeeIds: [PERSON] }] }, origin)),
    updateActivityGroup: (origin?: string) => kegiatanId.PUT(send("PUT", { group: { sessionId: ID, kind: "pos", label: "Pos 2", note: "", sort: 2 }, employeeIds: [] }, origin), params("id")),
    deleteActivityGroup: (origin?: string) => kegiatanId.DELETE(send("DELETE", undefined, origin), params("id")),
    saveRoomDetail: (origin?: string) => kamar.PUT(send("PUT", { floor: "Lantai 2", note: "" }, origin), params("roomId")),
    createTrip: (origin?: string) => perjalanan.POST(send("POST", trip, origin)),
    updateTrip: (origin?: string) => perjalananId.PUT(send("PUT", trip, origin), params("id")),
    deleteTrip: (origin?: string) => perjalananId.DELETE(send("DELETE", undefined, origin), params("id")),
    setSeats: (origin?: string) => kursi.PUT(send("PUT", { seats: [{ employeeId: PERSON, seat: "12A", vehicle: "" }], replace: false }, origin), params("id")),
    createGuide: (origin?: string) => panduan.POST(send("POST", guide, origin)),
    updateGuide: (origin?: string) => panduanId.PUT(send("PUT", { ...guide, removeFile: true }, origin), params("id")),
    deleteGuide: (origin?: string) => panduanId.DELETE(send("DELETE", undefined, origin), params("id")),
    startGuideFile: (origin?: string) => unggah.POST(send("POST", { guideId: ID, mime: "application/pdf", size: 1000 }, origin)),
    confirmGuideFile: (origin?: string) => simpan.POST(send("POST", { guideId: ID, mime: "application/pdf", size: 1000, key: `main-wam/panduan/${ID}.pdf`, token: `${"1".repeat(10)}.${"a".repeat(64)}` }, origin)),
    saveEventInfo: (origin?: string) => info.PUT(send("PUT", { groupsPublished: true }, origin)),
  };
}

beforeEach(() => { Object.assign(state, { admin: true, calls: [], limited: [] }); });

describe("Admin WAM → Main WAM → isi acara APIs", () => {
  it("refuse everyone without the admin session, before anything runs", async () => {
    state.admin = false;
    for (const [name, call] of Object.entries(await calls())) expect((await call()).status, name).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("refuse a request from another site", async () => {
    for (const [name, call] of Object.entries(await calls())) expect((await call("https://evil.test")).status, name).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("go through for an Admin WAM admin, each to its own server function", async () => {
    const all = await calls();
    for (const [name, call] of Object.entries(all)) {
      const response = await call();
      expect(response.status, name).toBe(200);
      expect(state.calls.at(-1), name).toBe(name);
    }
    expect(state.calls).toHaveLength(Object.keys(all).length);
    // Only "Kabari peserta" and the file upload are rate limited (updateSession here does not notify).
    expect(state.limited).toEqual(["mw-admin-kabar", "mw-admin-panduan-unggah"]);
  });

  it("check the body with zod and refuse what does not fit (422)", async () => {
    const [sesi, kelompok, anggota, kursi, info, unggah] = await Promise.all([
      import("../sesi/route"), import("../kelompok/route"), import("../kelompok/[id]/anggota/route"), import("../perjalanan/[id]/kursi/route"), import("./route"), import("../panduan/unggah/route"),
    ]);
    const bad = [
      await sesi.POST(send("POST", { action: "tambah", session: { ...session, end: "07:00" } })),
      await sesi.POST(send("POST", { action: "tambah", session: { ...session, kind: "makan", usesAttendance: true } })),
      await sesi.POST(send("POST", { action: "geser", ids: [ID], minutes: 7, notify: false })),
      await sesi.POST(send("POST", { action: "hapus-semua" })),
      await kelompok.POST(send("POST", { action: "impor", groups: [{ number: 1, name: "A", employeeIds: [PERSON], coordinatorId: null }, { number: 2, name: "B", employeeIds: [PERSON], coordinatorId: null }] })),
      await anggota.PUT(send("PUT", { employeeIds: [PERSON], coordinatorId: ID }), params("id")),
      await kursi.PUT(send("PUT", { seats: [{ employeeId: "bukan-id", seat: "1A", vehicle: "" }], replace: false }), params("id")),
      await info.PUT(send("PUT", { checkIn: { date: "2027-01-04", time: "15:30" }, checkOut: { date: "2027-01-04", time: "10:00" } })),
      await info.PUT(send("PUT", { mode: "semua" })),
      await unggah.POST(send("POST", { guideId: ID, mime: "image/gif", size: 10 })),
    ];
    for (const response of bad) expect(response.status).toBe(422);
    const body = await bad[4].json();
    expect(body.fieldErrors["groups.1.employeeIds"]).toEqual(["Satu orang hanya boleh di satu kelompok."]);
    expect(state.calls).toEqual([]);
  });

  it("treat an id that is not a uuid as not found", async () => {
    const [sesiId, kamar, panduanId] = await Promise.all([import("../sesi/[id]/route"), import("../kamar/[roomId]/route"), import("../panduan/[id]/route")]);
    expect((await sesiId.DELETE(send("DELETE"), params("id", "../pengaturan"))).status).toBe(404);
    expect((await kamar.PUT(send("PUT", { floor: "", note: "" }), params("roomId", "208"))).status).toBe(404);
    expect((await panduanId.PUT(send("PUT", guide), params("id", "x"))).status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it("need JSON", async () => {
    const { POST } = await import("../sesi/route");
    const response = await POST(new Request(`${ORIGIN}/api/admin/wam/main/sesi`, { method: "POST", headers: { origin: ORIGIN, "content-type": "text/plain" }, body: "x" }));
    expect(response.status).toBe(415);
  });
});
