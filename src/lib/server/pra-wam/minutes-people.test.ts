import { beforeEach, expect, it, vi } from "vitest";

/*
 * Absen from the MoM (12 Nov 2026): saving the MoM checks in who it says came and takes back only a
 * manual check-in of who it says did not; a check-in someone made themselves stays. A small fake.
 */

vi.mock("server-only", () => ({}));
type Row = Record<string, unknown>;
let participants: Row[];
let attendance: Row[];

function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let action: "select" | "delete" = "select";
  const rows = () => (table === "pw_session_participants" ? participants : attendance);
  const run = () => {
    const hit = rows().filter(row => filters.every(test => test(row)));
    if (action === "delete") attendance = attendance.filter(row => !hit.includes(row));
    return { data: hit, error: null };
  };
  const query = {
    select: () => query,
    delete: () => { action = "delete"; return query; },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
    upsert: async (values: Row[]) => {
      for (const value of values) if (!attendance.some(row => row.session_id === value.session_id && row.employee_id === value.employee_id)) attendance.push(value);
      return { error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve(run()),
  };
  return query;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from }) }));
vi.mock("./appraisal", () => ({ listPeople: async () => [] }));

const { recordMinutesAttendance } = await import("./minutes-people");
const S = "5e550000-0000-4000-8000-000000000001";
const member = { id: "notulis", name: "Raja", nickname: "", department: "", position: "", mustChangePassword: false, roles: [], photo: null };

beforeEach(() => {
  participants = ["a", "b", "c", "d", "notulis"].map(id => ({ session_id: S, employee_id: id }));
  attendance = [
    { session_id: S, employee_id: "a", method: "qr" },
    { session_id: S, employee_id: "b", method: "manual", recorded_by: "panitia" },
  ];
});

it("checks in who came at the meeting's start, by the notetaker, and takes back only a manual check-in", async () => {
  // The MoM says a, b and c did not come; d and the notetaker came.
  await recordMinutesAttendance(S, "2026-11-12T02:00:00Z", ["a", "b", "c"], member, new Date("2026-11-12T05:00:00Z"));
  const by = Object.fromEntries(attendance.map(row => [row.employee_id, row]));
  // a scanned the QR themselves: kept. b was manual: taken back. c had nothing: nothing.
  expect(Object.keys(by).sort()).toEqual(["a", "d", "notulis"]);
  expect(by.d).toMatchObject({ method: "manual", recorded_by: "notulis", checked_in_at: "2026-11-12T02:00:00Z" });
  // Saving again changes nothing.
  await recordMinutesAttendance(S, "2026-11-12T02:00:00Z", ["a", "b", "c"], member, new Date("2026-11-12T05:00:00Z"));
  expect(attendance).toHaveLength(3);
});

it("keeps an existing check-in as it is, and dates one for a meeting still to start now", async () => {
  await recordMinutesAttendance(S, "2026-11-12T09:00:00Z", [], member, new Date("2026-11-12T05:00:00Z"));
  expect(attendance.find(row => row.employee_id === "b")).toMatchObject({ recorded_by: "panitia" });
  expect(attendance.find(row => row.employee_id === "c")).toMatchObject({ checked_in_at: "2026-11-12T05:00:00.000Z" });
  expect(attendance).toHaveLength(5);
});
