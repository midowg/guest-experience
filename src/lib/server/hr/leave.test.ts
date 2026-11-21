import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../pra-wam/session";

/* Cuti, sakit, izin, dinas and Admin HR's tables against a small in-memory stand-in for Supabase. Made-up people and places. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "upsert"; row: Row } = { kind: "select" };
  let single = false;
  let window: [number, number] | null = null;
  let limit = Infinity;
  const rows = () => (db[table] ??= []);
  const run = () => {
    if (mode.kind === "insert" || mode.kind === "upsert") {
      const row: Row = { id: `${table}-${rows().length + 1}`, status: "menunggu", created_at: "2026-11-21T01:00:00Z", ...mode.row };
      const same = mode.kind === "upsert" ? rows().find(item => item.id === row.id) : null;
      if (same) Object.assign(same, row); else rows().push(row);
      return { data: single ? row : [row], error: null };
    }
    let found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "update") { found.forEach(row => Object.assign(row, (mode as { patch: Row }).patch)); return { data: found, error: null }; }
    if (window) found = found.slice(window[0], window[1] + 1);
    found = found.slice(0, limit);
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return builder; },
    gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
    lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    order: () => builder,
    limit: (value: number) => { limit = value; return builder; },
    range: (from: number, to: number) => { window = [from, to]; return builder; },
    single: () => { single = true; return builder; },
    maybeSingle: () => { single = true; return builder; },
    insert: (row: Row) => { mode = { kind: "insert", row }; return builder; },
    upsert: (row: Row) => { mode = { kind: "upsert", row }; return builder; },
    update: (patch: Row) => { mode = { kind: "update", patch }; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("../pra-wam/zone", () => ({ viewerZone: async () => "WIB" }));
const PERSON = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
vi.mock("../pra-wam/appraisal", () => ({
  listPeople: async () => [
    { id: PERSON, name: "Satu", fullName: "Contoh Satu", department: "Contoh", active: true },
    { id: OTHER, name: "Dua", fullName: "Contoh Dua", department: "Contoh", active: true },
  ],
}));

const { adminMonth, cancelLeave, createLeave, decideLeave, teamLeaves, withdrawLeave } = await import("./leave");
const me = { id: PERSON, name: "Contoh Satu" } as Member;
const now = new Date("2026-11-21T03:00:00Z");
const actor = { employeeId: OTHER, label: "Admin Contoh" };

beforeEach(() => {
  db = {
    pw_leave_requests: [],
    pw_hr_settings: [{ id: true, clock_method: "gerakan", late_after: "09:00:00" }],
    pw_accounts: [{ employee_id: PERSON, active: true }, { employee_id: OTHER, active: true }],
    pw_offices: [{ id: "o1", name: "Kantor Contoh", lat: -7.8, lng: 110.4, radius_m: 100, zone: "WITA", active: true, sort_order: 0 }],
    pw_daily_attendance: [],
  };
});

describe("cuti, sakit, izin and dinas", () => {
  it("takes a request, refuses one over the same days, and one too far back", async () => {
    const made = await createLeave(me, { type: "cuti", startDate: "2026-11-24", endDate: "2026-11-26", note: "Pulang kampung" }, now);
    expect(made).toMatchObject({ type: "cuti", startDate: "2026-11-24", endDate: "2026-11-26", status: "menunggu" });
    await expect(createLeave(me, { type: "izin", startDate: "2026-11-26", endDate: "2026-11-26", note: "Urusan keluarga" }, now)).rejects.toMatchObject({ status: 409 });
    await expect(createLeave(me, { type: "sakit", startDate: "2026-10-01", endDate: "2026-10-02", note: "Demam" }, now)).rejects.toMatchObject({ status: 422 });
  });
  it("lets the owner withdraw a waiting one only, and Admin HR decide it once", async () => {
    const made = await createLeave(me, { type: "dinas", startDate: "2026-11-24", endDate: "2026-11-24", note: "Klien di Surabaya" }, now);
    const decided = await decideLeave(made.id, { approve: true, note: "" }, actor, now);
    expect(decided).toMatchObject({ status: "disetujui", decidedLabel: "Admin Contoh" });
    await expect(decideLeave(made.id, { approve: false, note: "Salah" }, actor, now)).rejects.toMatchObject({ status: 409 });
    await expect(cancelLeave(me, made.id)).rejects.toMatchObject({ status: 409 });
  });
  it("never lets Admin HR decide their own request (the super admin may), and lets them withdraw an approved one", async () => {
    const made = await createLeave(me, { type: "cuti", startDate: "2026-11-24", endDate: "2026-11-25", note: "Liburan" }, now);
    await expect(decideLeave(made.id, { approve: true, note: "" }, { employeeId: PERSON, label: "Contoh Satu" }, now)).rejects.toMatchObject({ status: 403 });
    await decideLeave(made.id, { approve: true, note: "" }, { employeeId: PERSON, label: "Contoh Satu" }, now, true);
    const withdrawn = await withdrawLeave(made.id, "Jadwal berubah", actor, now);
    expect(withdrawn).toMatchObject({ status: "dibatalkan", decisionNote: "Dibatalkan: Jadwal berubah" });
    await expect(withdrawLeave(made.id, "", actor, now)).rejects.toMatchObject({ status: 409 });
    // Its days are free again.
    expect((await createLeave(me, { type: "izin", startDate: "2026-11-24", endDate: "2026-11-24", note: "Urusan keluarga" }, now)).status).toBe("menunggu");
  });
  it("shows the team who and when, without the notes, waiting and approved only", async () => {
    db.pw_leave_requests.push(
      { id: "a", employee_id: OTHER, type: "sakit", start_date: "2026-11-20", end_date: "2026-11-20", note: "Rahasia", status: "disetujui", created_at: "2026-11-20T00:00:00Z" },
      { id: "b", employee_id: OTHER, type: "cuti", start_date: "2026-11-27", end_date: "2026-11-28", note: "Rahasia", status: "ditolak", created_at: "2026-11-20T00:00:00Z" },
      { id: "c", employee_id: PERSON, type: "izin", start_date: "2026-10-30", end_date: "2026-11-02", note: "Saya", status: "menunggu", created_at: "2026-10-20T00:00:00Z" },
    );
    const { ready, leaves } = await teamLeaves(me, "2026-11");
    expect(ready).toBe(true);
    expect(leaves.map(leave => leave.id).sort()).toEqual(["a", "c"]);
    expect(leaves.find(leave => leave.id === "c")).toMatchObject({ mine: true, name: "Contoh Satu", status: "menunggu" });
    expect(JSON.stringify(leaves)).not.toContain("Rahasia");
  });
});

describe("Rekap bulanan", () => {
  it("colours each day from the clock-ins (late in the office's zone) and the requests", async () => {
    db.pw_daily_attendance.push(
      // The first clock-in anyone made: absensi starts on 16 Nov, so 1–13 Nov stay blank.
      { employee_id: OTHER, work_date: "2026-11-16", kind: "masuk", at: "2026-11-16T00:30:00Z", method: "wajah", status: "sah", office_id: "o1", office_name: "Kantor Contoh", reason_kind: null },
      // 09.10 WITA = 01.10Z: late after 09.00 in the office's own zone (it would be 08.10 in WIB).
      { employee_id: PERSON, work_date: "2026-11-18", kind: "masuk", at: "2026-11-18T01:10:00Z", method: "wajah", status: "sah", office_id: "o1", office_name: "Kantor Contoh", reason_kind: null },
      { employee_id: PERSON, work_date: "2026-11-18", kind: "pulang", at: "2026-11-18T09:30:00Z", method: "wajah", status: "sah", office_id: "o1", office_name: "Kantor Contoh", reason_kind: null },
      { employee_id: PERSON, work_date: "2026-11-19", kind: "masuk", at: "2026-11-19T00:40:00Z", method: "wajah", status: "sah", office_id: "o1", office_name: "Kantor Contoh", reason_kind: null },
    );
    db.pw_leave_requests.push({ id: "a", employee_id: OTHER, type: "sakit", start_date: "2026-11-18", end_date: "2026-11-19", note: "Demam", status: "disetujui", created_at: "2026-11-17T00:00:00Z" });
    const month = await adminMonth("2026-11", "2026-11-21");
    expect(month.dates).toHaveLength(30);
    expect(month.lateAfter).toBe("09:00");
    const mine = month.people.find(person => person.employeeId === PERSON)!.cells;
    expect(mine.find(cell => cell.date === "2026-11-18")).toMatchObject({ kind: "telat", masuk: "09.10", pulang: "17.30" });
    expect(mine.find(cell => cell.date === "2026-11-19")).toMatchObject({ kind: "hadir", incomplete: true });
    expect(mine.find(cell => cell.date === "2026-11-17")?.kind).toBe("alpa");
    expect(mine.find(cell => cell.date === "2026-11-13")?.kind).toBe("nanti");
    expect(month.since).toBe("2026-11-16");
    expect(mine.find(cell => cell.date === "2026-11-22")?.kind).toBe("libur");
    expect(mine.find(cell => cell.date === "2026-11-24")?.kind).toBe("nanti");
    const other = month.people.find(person => person.employeeId === OTHER)!.cells;
    expect(other.find(cell => cell.date === "2026-11-19")?.kind).toBe("sakit");
  });
});
