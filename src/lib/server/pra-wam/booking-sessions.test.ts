import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "./session";

/*
 * A room booking that is also a published session (migration 202611050004), against a small
 * in-memory stand-in for Supabase. The database triggers that keep the two in step are checked
 * in tests/backend/pra-wam-booking-sessions-check.sql; here: how the server reads, shows once,
 * guards, notifies and cleans up, and that nothing changes before the migration.
 */

type Row = Record<string, unknown>;
type Failure = { code: string; message: string };
let db: Record<string, Row[]>;
/** Before migration 202611050004: pw_sessions has no booking_id. */
let unmigrated = false;
/** Make the next delete of this table fail. */
let failDelete: string | null = null;
const writes: { table: string; kind: string; values?: Row }[] = [];

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let columns = "*";
  let mode: { kind: "select" } | { kind: "update"; values: Row } | { kind: "delete" } = { kind: "select" };
  let single: "maybe" | "one" | null = null;
  const touches = (text: string) => table === "pw_sessions" && unmigrated && text.includes("booking_id");
  let missingColumn = false;
  const rows = () => (db[table] ??= []);
  const run = (): { data: unknown; error: Failure | null } => {
    if (missingColumn || touches(columns)) return { data: null, error: { code: "42703", message: "column pw_sessions.booking_id does not exist" } };
    const found = rows().filter(row => filters.every(test => test(row)));
    if (mode.kind === "update") {
      const values = mode.values;
      writes.push({ table, kind: "update", values });
      found.forEach(row => Object.assign(row, values));
      return { data: found, error: null };
    }
    if (mode.kind === "delete") {
      writes.push({ table, kind: "delete" });
      if (failDelete === table) { failDelete = null; return { data: null, error: { code: "XX000", message: "boom" } }; }
      db[table] = rows().filter(row => !found.includes(row));
      // The database cascade: a booking takes its session with it.
      if (table === "pw_room_bookings") db.pw_sessions = (db.pw_sessions ?? []).filter(session => !found.some(booking => booking.id === session.booking_id));
      return { data: found, error: null };
    }
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const field = (key: string) => { if (key === "booking_id") missingColumn ||= touches(key); return key; };
  const builder = {
    select: (value = "*") => { if (mode.kind === "select") columns = value; return builder; },
    eq: (key: string, value: unknown) => { filters.push(row => row[field(key)] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[field(key)])); return builder; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return builder; },
    gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
    gt: (key: string, value: string) => { filters.push(row => new Date(String(row[key])) > new Date(value)); return builder; },
    lt: (key: string, value: string) => { filters.push(row => new Date(String(row[key])) < new Date(value)); return builder; },
    or: (expression: string) => {
      const booker = /booked_by\.eq\.([^,]+)/.exec(expression)?.[1];
      const ids = /id\.in\.\(([^)]*)\)/.exec(expression)?.[1]?.split(",") ?? [];
      filters.push(row => row.booked_by === booker || ids.includes(String(row.id)));
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => { single = "maybe"; return builder; },
    single: () => { single = "one"; return builder; },
    update: (values: Row) => { mode = { kind: "update", values }; return builder; },
    delete: () => { mode = { kind: "delete" }; return builder; },
    then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
  };
  return builder;
}

const notifySession = vi.fn(async (...args: unknown[]) => { void args; });
const removeObjects = vi.fn(async (keys: string[]) => { void keys; });
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("../r2", () => ({ isR2Configured: () => true, removeObjects: (keys: string[]) => removeObjects(keys), presignUpload: vi.fn(), presignDownload: vi.fn(), uploadedStart: vi.fn() }));
vi.mock("./announcements", () => ({ notifySession: (...args: unknown[]) => notifySession(...args), notifyPeople: vi.fn() }));
vi.mock("./events", () => ({
  listEvents: async () => ({ events: [{ id: "ev", kind: "pra_wam", status: "aktif", modules: { appraisal: true } }], migrated: true }),
  appraisalOpen: async () => true,
}));

const { cancelBooking, daySchedule, deleteBooking } = await import("./appraisal");
const { getSession, listSessions, roomUses, saveSession, setSessionStatus } = await import("./sessions");
const { agendaItems } = await import("./agenda");
const { withBookingLink } = await import("./booking-sessions");

const member = (id: string, roles: Member["roles"] = []): Member => ({ id, name: id, nickname: "", department: "", position: "", mustChangePassword: false, roles, photo: null });
const citra = member("citra"), budi = member("budi"), panitia = member("panitia", ["panitia"]);
// Senin 16 Nov 2026, 10.00–11.00 WIB.
const start = "2026-11-16T03:00:00.000Z", end = "2026-11-16T04:00:00.000Z";

beforeEach(() => {
  unmigrated = false; failDelete = null; writes.length = 0;
  notifySession.mockClear(); removeObjects.mockClear();
  db = {
    employees: [
      { id: "citra", full_name: "Citra Dewi", department: "HC", active: true },
      { id: "budi", full_name: "Budi Santoso", department: "IT", active: true },
      { id: "panitia", full_name: "Panitia", department: "GA", active: true },
    ],
    pw_rooms: [{ id: "vasuki", slug: "vasuki", name: "Vasuki", kind: "utama", capacity: 6, bookable: true, facilities: [], min_people: null, plan_key: null }],
    pw_room_bookings: [{ id: "b1", room_id: "vasuki", title: "1-on-1 Q4", description: "Target", starts_at: start, ends_at: end, booked_by: "citra", status: "aktif" }],
    pw_room_booking_participants: [{ booking_id: "b1", employee_id: "citra" }, { booking_id: "b1", employee_id: "budi" }],
    // What the migration's sync writes for b1, plus a panitia forum in the afternoon.
    pw_sessions: [
      { id: "s1", title: "1-on-1 Q4", kind: "rapat", description: "Target", status: "terbit", plan_from: null, plan_to: null, starts_at: start, ends_at: end, room_id: "vasuki", location: "", created_by: "citra", booking_id: "b1" },
      { id: "s2", title: "Forum HC", kind: "forum", description: "", status: "terbit", plan_from: null, plan_to: null, starts_at: "2026-11-16T07:00:00.000Z", ends_at: "2026-11-16T08:00:00.000Z", room_id: "vasuki", location: "", created_by: "panitia", booking_id: null },
    ],
    pw_session_participants: [{ session_id: "s1", employee_id: "citra" }, { session_id: "s1", employee_id: "budi" }, { session_id: "s2", employee_id: "budi" }],
    // One hold per room use: the booking's is the session's.
    pw_room_holds: [
      { source: "sesi", source_id: "s1", room_id: "vasuki", starts_at: start, ends_at: end },
      { source: "sesi", source_id: "s2", room_id: "vasuki", starts_at: "2026-11-16T07:00:00.000Z", ends_at: "2026-11-16T08:00:00.000Z" },
    ],
    pw_documents: [{ id: "d1", session_id: "s1", file_key: "pra-wam/dokumen/s1/bahan.pdf" }],
    pw_announcements: [{ id: "n1", session_id: "s1" }, { id: "n2", session_id: "s2" }],
  };
});

/** As before migration 202611050004: no link, the booking holds its own room. */
function beforeMigration() {
  unmigrated = true;
  db.pw_sessions = db.pw_sessions.filter(session => session.id !== "s1").map(({ booking_id, ...session }) => { void booking_id; return session; });
  db.pw_session_participants = db.pw_session_participants.filter(link => link.session_id !== "s1");
  db.pw_room_holds = [{ source: "booking", source_id: "b1", room_id: "vasuki", starts_at: start, ends_at: end }, ...db.pw_room_holds.filter(hold => hold.source_id !== "s1")];
}

describe("reading a booking's session", () => {
  it("maps the booking link and the booker onto the session", async () => {
    const session = await getSession("s1", panitia);
    expect(session).toMatchObject({ status: "terbit", kind: "rapat", roomName: "Vasuki", participantCount: 2, booking: { id: "b1", bookedBy: { id: "citra", name: "Citra Dewi" } } });
    expect((await getSession("s2", panitia)).booking).toBeNull();
    // A participant sees it on their list like any published session.
    expect((await listSessions(budi)).sessions.map(item => [item.id, item.booking?.id ?? null])).toEqual([["s1", "b1"], ["s2", null]]);
  });

  it("works as before without the migration", async () => {
    beforeMigration();
    const { sessions, migrated } = await listSessions(panitia);
    expect(migrated).toBe(true);
    expect(sessions.map(item => [item.id, item.booking])).toEqual([["s2", null]]);
    const read = await withBookingLink(withLink => query("pw_sessions").select(withLink ? "id,booking_id" : "id") as unknown as PromiseLike<{ data: unknown; error: Failure | null }>);
    expect(read.linked).toBe(false);
    expect(read.error).toBeNull();
  });
});

describe("one room use, shown once", () => {
  it("puts the booking on Book's schedule once, next to panitia's session", async () => {
    const { bookings } = await daySchedule("2026-11-16", citra);
    expect(bookings.map(item => [item.id, !!item.isSession])).toEqual([["b1", false], ["sesi:s2", true]]);
  });

  it("does the same before the migration", async () => {
    beforeMigration();
    const { bookings } = await daySchedule("2026-11-16", citra);
    expect(bookings.map(item => item.id)).toEqual(["b1", "sesi:s2"]);
  });

  it("names the session's hold after its booker for the room picker", async () => {
    expect((await roomUses("2026-11-16")).map(use => [use.source, use.sourceId, use.label])).toEqual([["sesi", "s1", "1-on-1 Q4 (Citra Dewi)"], ["sesi", "s2", "Forum HC"]]);
  });

  it("lists the booking on the agenda once, as the session that carries the booking", async () => {
    const { items } = await agendaItems(citra, "2026-11-16");
    expect(items.map(item => [item.kind, item.key])).toEqual([["sesi", "s1"]]);
    expect(items[0]).toMatchObject({ sessionId: "s1", bookingId: "b1", booking: { room: "Vasuki", mine: true, bookedBy: { name: "Citra Dewi" } } });
  });

  it("keeps the plain booking on the agenda before the migration", async () => {
    beforeMigration();
    const { items } = await agendaItems(citra, "2026-11-16");
    expect(items.map(item => [item.kind, item.key, item.bookingId])).toEqual([["appraisal", "b1", "b1"]]);
  });
});

describe("changing a booking's session from Kelola acara", () => {
  const input = { title: "Lain", kind: "rapat" as const, description: "", date: "2026-11-16", start: "13:00", end: "14:00", roomId: "", location: "", participants: [] };

  it("is refused: it changes with the booking", async () => {
    await expect(saveSession(input, panitia, { id: "s1" })).rejects.toMatchObject({ status: 409, message: "Sesi ini dari booking ruang; ubah lewat booking." });
    await expect(setSessionStatus("s1", "draf", panitia)).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });

  it("may be cancelled, which cancels the booking with who did it, and tells everyone", async () => {
    const saved = await setSessionStatus("s1", "batal", panitia);
    expect(saved.status).toBe("batal");
    expect(db.pw_room_bookings[0]).toMatchObject({ status: "batal", cancelled_by: "panitia" });
    expect(notifySession).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }), "batal", panitia);
  });
});

describe("the booker's own changes", () => {
  it("cancelling the booking tells the session's people, except the one who cancelled", async () => {
    // The trigger cancels the session in the database; the server only adds the note.
    await cancelBooking("b1", citra);
    expect(db.pw_room_bookings[0]).toMatchObject({ status: "batal", cancelled_by: "citra" });
    expect(notifySession).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", title: "1-on-1 Q4", roomName: "Vasuki", startsAt: start }), "batal", citra, { except: "citra" });
  });

  it("cancelling before the migration sends nothing", async () => {
    beforeMigration();
    await cancelBooking("b1", citra);
    expect(notifySession).not.toHaveBeenCalled();
  });

  it("deleting the booking takes its session, its files and its notifications", async () => {
    await deleteBooking("b1", citra);
    expect(db.pw_sessions.map(session => session.id)).toEqual(["s2"]);
    expect(removeObjects).toHaveBeenCalledWith(["pra-wam/dokumen/s1/bahan.pdf"]);
    expect(db.pw_announcements.map(note => note.id)).toEqual(["n2"]);
  });

  it("a failed delete cleans nothing up", async () => {
    failDelete = "pw_room_bookings";
    await expect(deleteBooking("b1", citra)).rejects.toBeTruthy();
    expect(db.pw_sessions).toHaveLength(2);
    expect(removeObjects).not.toHaveBeenCalled();
    expect(db.pw_announcements).toHaveLength(2);
  });
});
