import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_SIZE, FACE_MODEL_VERSION } from "@/lib/hr/face-match";
import type { TabletRequest } from "@/lib/main-wam/panitia/face-tablet";
import type { MainWamContext } from "../gate";

/*
 * Absen mode tablet on the server: who a face is, the window, and the one row per person. The
 * database is a small in-memory stand-in (face profiles, check-ins) behind the same query calls the
 * code makes; the people, the session and the count are stubbed.
 */

type Call = { table: string; ops: [string, unknown[]][] };
const calls: Call[] = [];
type Profile = { employee_id: string; embedding: number[]; model_version: string; status: string };
let profiles: Profile[] = [];
let present = new Map<string, string>();
const op = (call: Call, name: string) => call.ops.find(([key]) => key === name)?.[1];

function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const result = () => {
    if (table === "pw_face_profiles") {
      const statuses = (op(call, "in") as [string, string[]] | undefined)?.[1] ?? [];
      return { data: profiles.filter(row => statuses.includes(row.status)), error: null };
    }
    if (table === "mw_attendance") {
      const upsert = op(call, "upsert") as [{ session_id: string; employee_id: string; checked_in_at: string; method: string; recorded_by: string }[], unknown] | undefined;
      if (upsert) {
        const inserted = upsert[0].filter(row => !present.has(row.employee_id));
        for (const row of inserted) present.set(row.employee_id, row.checked_in_at);
        return { data: inserted.map(row => ({ employee_id: row.employee_id })), error: null };
      }
      const ids = ((op(call, "in") as [string, string[]] | undefined)?.[1]) ?? [];
      return { data: ids.filter(id => present.has(id)).map(id => ({ employee_id: id, checked_in_at: present.get(id) })), error: null };
    }
    return { data: [], error: null };
  };
  const chain: Record<string | symbol, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(result()).then(resolve, reject);
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
    },
  });
  return chain;
}

let session: Record<string, unknown> | null;
let bodIds = new Set<string>();
const SESSION = { id: "00000000-0000-4000-8000-0000000000a1", title: "Pemaparan departemen", status: "terbit", usesAttendance: true, required: true, startsAt: "2027-01-05T01:00:00Z", endsAt: "2027-01-05T05:00:00Z" };
const PEOPLE = new Map(["a", "b", "c", "bod"].map(id => [id, { id, name: id.toUpperCase(), fullName: id, department: "CoE", photo: null }]));

vi.mock("./common", async importOriginal => ({ ...(await importOriginal<typeof import("./common")>()), db: () => ({ from }) }));
vi.mock("../people", () => ({ mainWamPeople: async () => PEOPLE, mainWamEventPeople: async () => ({ accounts: ["a", "b", "c", "bod"], bod: bodIds, panitia: new Set(["c"]) }) }));
vi.mock("../read", () => ({ sessionById: async () => session, allSessions: async () => ({ data: [], migrated: true }) }));
vi.mock("../modul/absen", () => ({ presentCount: async () => ({ present: present.size, expected: 3 }) }));
vi.mock("./attendance", () => ({ sessionRows: async () => ({ rows: [], migrated: true }) }));
vi.mock("./rundown", () => ({ waitingUpdate: () => new Error("waiting") }));
vi.mock("../demo-panitia", () => ({ demoAttendanceSessions: () => [], demoAttendeeRows: () => [] }));

const { identifyFaces } = await import("./face-tablet");

const context = { viewer: { id: "panitia-1" }, settings: {} } as unknown as MainWamContext;
const unit = (i: number) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === i ? 1 : 0));
const at = (c: number, axis = 1) => Array.from({ length: EMBEDDING_SIZE }, (_, j) => (j === 0 ? c : j === axis ? Math.sqrt(1 - c * c) : 0));
const profile = (employee_id: string, embedding: number[], status = "aktif", model_version = FACE_MODEL_VERSION): Profile => ({ employee_id, embedding, model_version, status });
const request = (...faces: TabletRequest["faces"]): TabletRequest => ({ sessionId: SESSION.id, faces });
const INSIDE = new Date("2027-01-05T02:00:00Z");
const written = () => calls.filter(call => call.table === "mw_attendance" && op(call, "upsert"));

beforeEach(() => {
  calls.length = 0;
  present = new Map();
  bodIds = new Set(["bod"]);
  session = { ...SESSION };
  profiles = [profile("a", unit(0)), profile("b", unit(1)), profile("bod", unit(2))];
});

describe("Absen mode tablet: recognising and recording", () => {
  it("names a face, records it once as a check-in by the panitia whose tablet it is, and counts", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toMatchObject({ kind: "dikenali", person: { employeeId: "a", name: "A", role: "peserta" }, recorded: true, already: false });
    expect(answer).toMatchObject({ present: 1, total: 3 });
    const [call] = written();
    expect(op(call, "upsert")).toEqual([[{ session_id: SESSION.id, employee_id: "a", method: "manual", recorded_by: "panitia-1", checked_in_at: INSIDE.toISOString() }], { onConflict: "session_id,employee_id", ignoreDuplicates: true }]);
  });

  it("is idempotent: the same face again is 'sudah', with the first time, and writes nothing", async () => {
    await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    calls.length = 0;
    const again = await identifyFaces(context, request({ embedding: unit(0) }), new Date("2027-01-05T02:05:00Z"));
    expect(again.faces[0]).toMatchObject({ kind: "dikenali", already: true, recorded: false, checkedInAt: INSIDE.toISOString() });
    expect(written()).toHaveLength(0);
  });

  it("several faces at once: each one its person, one row each; a face nobody knows is just unknown", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(1) }, { embedding: unit(0) }, { embedding: unit(50) }), INSIDE);
    expect(answer.faces.map(face => face.kind)).toEqual(["dikenali", "dikenali", "tidak-dikenali"]);
    expect([...present.keys()].sort()).toEqual(["a", "b"]);
    expect(written()).toHaveLength(1);
  });

  it("never records the same person twice from one picture", async () => {
    const answer = await identifyFaces(context, request({ embedding: at(0.7) }, { embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toEqual({ kind: "ragu" });
    expect(answer.faces[1]).toMatchObject({ kind: "dikenali", recorded: true });
    expect(present.size).toBe(1);
  });

  it("names a BOD but does not record them (BOD do not check in)", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(2) }), INSIDE);
    expect(answer.faces[0]).toMatchObject({ kind: "dikenali", person: { employeeId: "bod", role: "bod" }, recorded: false, already: false, checkedInAt: null });
    expect(written()).toHaveLength(0);
  });

  it("marks a panitia as panitia", async () => {
    profiles.push(profile("c", unit(9)));
    const answer = await identifyFaces(context, request({ embedding: unit(9) }), INSIDE);
    expect(answer.faces[0]).toMatchObject({ person: { role: "panitia" } });
  });

  it("does not guess when two people look alike", async () => {
    profiles = [profile("a", at(0.7)), profile("b", at(0.7, 2))];
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toEqual({ kind: "ragu" });
    expect(written()).toHaveLength(0);
  });

  it("a face below the minimum is unknown and nothing is written", async () => {
    profiles = [profile("a", at(0.4))];
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toEqual({ kind: "tidak-dikenali" });
    expect(written()).toHaveLength(0);
  });

  it("says 'belum terdaftar' for every face when nobody of the event has an enrolled face", async () => {
    profiles = [];
    const answer = await identifyFaces(context, request({ embedding: unit(0) }, { embedding: unit(1) }), INSIDE);
    expect(answer.faces).toEqual([{ kind: "belum-terdaftar" }, { kind: "belum-terdaftar" }]);
  });

  it("compares only profiles in use (aktif) of this model; one that waits for consent or approval is not a gallery", async () => {
    profiles = [profile("a", unit(0), "siap"), profile("b", unit(1), "menunggu"), profile("c", unit(2), "aktif", "another-model")];
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toEqual({ kind: "belum-terdaftar" });
    const read = calls.find(call => call.table === "pw_face_profiles")!;
    expect(op(read, "in")).toEqual(["status", ["aktif"]]);
  });

  it("only people of the event can be named (an enrolled face of someone else is not in the gallery)", async () => {
    profiles = [profile("stranger", unit(0))];
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), INSIDE);
    expect(answer.faces[0]).toEqual({ kind: "belum-terdaftar" });
  });
});

describe("Absen mode tablet: the session's window", () => {
  it("before it opens nothing is looked up or written", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), new Date("2027-01-05T00:29:00Z"));
    expect(answer.faces[0]).toMatchObject({ kind: "di-luar-jam", window: "belum" });
    expect(calls.filter(call => call.table === "pw_face_profiles")).toHaveLength(0);
    expect(written()).toHaveLength(0);
  });

  it("after it closes nothing is looked up or written", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(0) }), new Date("2027-01-05T05:31:00Z"));
    expect(answer.faces[0]).toMatchObject({ kind: "di-luar-jam", window: "tutup" });
    expect(calls.filter(call => call.table === "pw_face_profiles")).toHaveLength(0);
    expect(written()).toHaveLength(0);
  });

  it("a face queued offline keeps its own time when that is inside the window and at most 30 minutes old", async () => {
    const seenAt = "2027-01-05T05:20:00.000Z";
    const answer = await identifyFaces(context, request({ embedding: unit(0), seenAt }), new Date("2027-01-05T05:40:00Z"));
    expect(answer.faces[0]).toMatchObject({ kind: "dikenali", recorded: true, checkedInAt: seenAt });
  });

  it("a queued face older than 30 minutes counts at the server's time, and the window is judged on that", async () => {
    const answer = await identifyFaces(context, request({ embedding: unit(0), seenAt: "2027-01-05T04:00:00.000Z" }), new Date("2027-01-05T05:40:00Z"));
    expect(answer.faces[0]).toMatchObject({ kind: "di-luar-jam", window: "tutup" });
  });

  it("a session that is not published or takes no attendance does not exist for the tablet", async () => {
    session = { ...SESSION, usesAttendance: false };
    await expect(identifyFaces(context, request({ embedding: unit(0) }), INSIDE)).rejects.toMatchObject({ status: 404 });
    session = { ...SESSION, status: "draf" };
    await expect(identifyFaces(context, request({ embedding: unit(0) }), INSIDE)).rejects.toMatchObject({ status: 404 });
    session = null;
    await expect(identifyFaces(context, request({ embedding: unit(0) }), INSIDE)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Absen mode tablet: nothing about a face is logged", () => {
  it("writes nothing to the console while recognising", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined));
    await identifyFaces(context, request({ embedding: unit(0) }, { embedding: unit(40) }), INSIDE);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach(spy => spy.mockRestore());
  });
});
