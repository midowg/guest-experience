import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MainWamContext } from "../gate";

/*
 * Area C's server rules that the database alone does not hold (fase 4): an undo of "Hadir" removes
 * only what panitia recorded, never a QR scan (audit L8); a moderation decision carries the reason
 * panitia gave (L8); "orang acara" is fondasi's one count (R5). The database client is a stand-in
 * that records each query and answers what the test says.
 */

type Call = { table: string; ops: [string, unknown[]][] };
const calls: Call[] = [];
let answer: (call: Call) => { data: unknown; error: unknown } = () => ({ data: [], error: null });

/** A query builder: every method chains, awaiting it gives `answer(call)`. */
function from(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const chain: Record<string | symbol, unknown> = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(answer(call)).then(resolve, reject);
      return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
    },
  });
  return chain;
}
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [{ out_owner: "owner-1", out_row: {} }], error: null }));

const PEOPLE = new Map(["a", "b", "c", "bod"].map(id => [id, { id, name: id.toUpperCase(), fullName: id, department: "CoE", photo: null, active: true }]));
const attendees = vi.fn(async () => ["a", "b"]);
const SESSION = { id: "s1", title: "Pemaparan departemen", status: "terbit", usesAttendance: true, startsAt: "2027-01-05T01:00:00Z", endsAt: "2027-01-05T05:00:00Z" };

vi.mock("./common", async importOriginal => ({ ...(await importOriginal<typeof import("./common")>()), db: () => ({ from, rpc }) }));
vi.mock("../people", () => ({ mainWamPeople: async () => PEOPLE, mainWamAttendees: () => attendees(), mainWamEventPeople: async () => ({ accounts: ["a", "b", "bod"], bod: new Set(["bod"]), panitia: new Set(), admin: new Set() }) }));
vi.mock("../read", () => ({
  sessionById: async () => SESSION,
  listGroups: async () => ({ data: [], migrated: true }),
  attendanceOf: async () => ({ data: [{ sessionId: "s1", employeeId: "c", method: "qr", checkedInAt: "2027-01-05T00:52:00Z" }], migrated: true }),
  allSessions: async () => ({ data: [], migrated: true }),
}));
vi.mock("../notes", () => ({ trySendMainWamNote: vi.fn(async () => 1), sendMainWamNote: vi.fn(async () => 1), mainWamAudience: async () => [] }));
vi.mock("../../r2", () => ({ isR2Configured: () => false, presignDownload: async () => null, removeObjects: async () => undefined }));

const { setAttendance, sessionRows } = await import("./attendance");
const { moderatePhoto } = await import("./moderation");
const context = { viewer: { id: "panitia-1" }, settings: {} } as unknown as MainWamContext;
const AT = new Date("2027-01-05T03:15:00Z");

beforeEach(() => { calls.length = 0; rpc.mockClear(); attendees.mockClear(); answer = () => ({ data: [], error: null }); });

describe("Batalkan hadir (audit L8)", () => {
  it("deletes only a record panitia made, in the same statement", async () => {
    answer = call => ({ data: call.ops.some(([op]) => op === "delete") ? [{ employee_id: "a" }] : [], error: null });
    await setAttendance(context, "s1", "a", false, AT);
    const removal = calls.find(call => call.ops.some(([op]) => op === "delete"))!;
    expect(removal.table).toBe("mw_attendance");
    expect(removal.ops).toEqual(expect.arrayContaining([["eq", ["session_id", "s1"]], ["eq", ["employee_id", "a"]], ["eq", ["method", "manual"]]]));
  });

  it("refuses a QR scan with words, and removes nothing", async () => {
    answer = call => call.ops.some(([op]) => op === "delete") ? { data: [], error: null }
      : call.ops.some(([op]) => op === "maybeSingle") ? { data: { method: "qr" }, error: null } : { data: [], error: null };
    await expect(setAttendance(context, "s1", "c", false, AT)).rejects.toMatchObject({ status: 409, message: "C absen lewat scan QR. Absen ini tidak bisa dibatalkan panitia." });
  });

  it("is quiet when there was nothing to undo (someone else undid it first)", async () => {
    answer = call => call.ops.some(([op]) => op === "maybeSingle") ? { data: null, error: null } : { data: [], error: null };
    await expect(setAttendance(context, "s1", "a", false, AT)).resolves.toBeTruthy();
  });
});

describe("Moderasi: the reason panitia gave (audit L8)", () => {
  it("sends the quick reason and the note to the log, and nothing for Tampilkan lagi", async () => {
    await moderatePhoto(context, "p1", { action: "sembunyikan", from: "ditinjau", reason: "tidak_pantas", note: "Ada nomor kamar" });
    expect(rpc).toHaveBeenLastCalledWith("mw_moderate_photo", expect.objectContaining({ p_action: "sembunyikan", p_reason: "Tidak pantas · Ada nomor kamar", p_by: "panitia-1" }));
    await moderatePhoto(context, "p1", { action: "hapus", from: "disembunyikan", reason: null, note: "" });
    expect(rpc).toHaveBeenLastCalledWith("mw_moderate_photo", expect.objectContaining({ p_action: "hapus", p_reason: "" }));
    await moderatePhoto(context, "p1", { action: "tampilkan", from: "disembunyikan", reason: "keberatan", note: "x" });
    expect(rpc).toHaveBeenLastCalledWith("mw_moderate_photo", expect.objectContaining({ p_action: "tampilkan", p_reason: "" }));
  });
});

describe("Orang acara (audit R5)", () => {
  it("lists Absen sesi from fondasi's mainWamAttendees, plus anyone recorded who is not on it", async () => {
    const { rows } = await sessionRows("s1");
    expect(attendees).toHaveBeenCalled();
    expect(rows.map(row => [row.id, row.method])).toEqual([["a", null], ["b", null], ["c", "qr"]]);
  });

  it("never counts people on its own: no area C server file reads accounts or roles itself", () => {
    const folder = join(process.cwd(), "src/lib/server/main-wam/panitia");
    for (const file of readdirSync(folder).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const source = readFileSync(join(folder, file), "utf8");
      expect(source, file).not.toMatch(/from\("pw_accounts"\)|from\("pw_roles"\)/);
      expect(source, file).not.toMatch(/expectedAttendees|eventPeople\(/);
    }
    for (const file of ["attendance.ts", "summary.ts"]) expect(readFileSync(join(folder, file), "utf8"), file).toContain("mainWamAttendees()");
  });
});
