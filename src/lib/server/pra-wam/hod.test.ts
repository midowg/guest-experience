import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Meeting HOD's room (migration 202611060003): once every invited HOD accepts, the room is booked
 * in the name of the HOD who asked; a taken room leaves the meeting scheduled without it; cancelling
 * cancels the booking. The database is a small fake: each table is an array.
 */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let rpcResult: { data: unknown; error: { code?: string; message: string } | null };
const rpc = vi.fn(async (...args: unknown[]) => { void args; return rpcResult; });
const notes: { ids: string[]; title: string; body: string }[] = [];

/** A query on one table: eq filters, then select / update / maybeSingle. */
function from(table: string) {
  const filters: [string, unknown][] = [];
  let patch: Row | null = null;
  const rows = () => (tables[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value));
  const query = {
    select: () => query,
    update: (values: Row) => { patch = values; return query; },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => void) => {
      const hit = rows();
      if (patch) for (const row of hit) Object.assign(row, patch);
      resolve({ data: hit, error: null });
    },
  };
  return query;
}

vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from, rpc }) }));
vi.mock("./announcements", () => ({
  HOD_NOTE_LABEL: "Meeting HOD",
  notifyPeople: async (ids: string[], note: { title: string; body: string }) => { notes.push({ ids, title: note.title, body: note.body }); },
}));
vi.mock("./leads", () => ({
  leadsOf: async (id: string) => ({ departments: id === "requester" ? ["HC"] : ["IT"], businessUnits: [] }),
  listLeads: async () => ({ byPerson: new Map(), migrated: true }), leadOptions: async () => ({ departments: [], businessUnits: [] }),
}));
vi.mock("./appraisal", () => ({ listPeople: async () => [], listRooms: async () => [] }));

const { answerHodMeeting, cancelHodMeeting } = await import("./hod");
const member = (id: string) => ({ id, name: id, nickname: id, department: "", position: "", mustChangePassword: false, roles: [], photo: null });

beforeEach(() => {
  notes.length = 0;
  rpc.mockClear();
  rpcResult = { data: "booking-1", error: null };
  tables = {
    pw_hod_meetings: [{ id: "m1", title: "Rencana 2027", agenda: "Target", starts_at: "2099-11-10T03:00:00+00:00", ends_at: "2099-11-10T04:00:00+00:00", place: "Nagapadma", requested_by: "requester", status: "menunggu", created_at: "x", room_id: "room-1", booking_id: null }],
    pw_hod_meeting_invites: [{ meeting_id: "m1", employee_id: "budi", response: "menunggu" }],
    pw_room_bookings: [{ id: "booking-1", status: "aktif" }],
  };
});

describe("Meeting HOD books its room", () => {
  it("books the room in the asker's name, with the invited HODs, once everyone accepts", async () => {
    expect(await answerHodMeeting(member("budi"), "m1", true, "")).toBe("terjadwal");
    expect(rpc).toHaveBeenCalledWith("pw_save_booking", expect.objectContaining({
      p_room: "room-1", p_booked_by: "requester", p_participants: ["budi"], p_title: "Meeting HOD: Rencana 2027",
      p_starts: "2099-11-10T03:00:00+00:00", p_ends: "2099-11-10T04:00:00+00:00",
    }));
    expect(tables.pw_hod_meetings[0]).toMatchObject({ status: "terjadwal", booking_id: "booking-1" });
    expect(notes.at(-1)?.title).toBe("Meeting HOD terjadwal: Rencana 2027");
  });

  it("keeps the meeting scheduled without the room when it is already taken, and says so", async () => {
    rpcResult = { data: null, error: { code: "23P01", message: "conflicting key value violates exclusion constraint" } };
    expect(await answerHodMeeting(member("budi"), "m1", true, "")).toBe("terjadwal");
    expect(tables.pw_hod_meetings[0]).toMatchObject({ status: "terjadwal", booking_id: null });
    expect(notes.at(-1)?.body).toContain("Nagapadma ternyata sudah terpakai di jam itu");
  });

  it("books nothing while a HOD has not answered, nor for a place outside the office", async () => {
    tables.pw_hod_meeting_invites.push({ meeting_id: "m1", employee_id: "sari", response: "menunggu" });
    expect(await answerHodMeeting(member("budi"), "m1", true, "")).toBe("menunggu");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cancels the room's booking with the meeting", async () => {
    tables.pw_hod_meetings[0] = { ...tables.pw_hod_meetings[0], status: "terjadwal", booking_id: "booking-1" };
    await cancelHodMeeting(member("requester"), "m1");
    expect(tables.pw_hod_meetings[0].status).toBe("batal");
    expect(tables.pw_room_bookings[0]).toMatchObject({ status: "batal", cancelled_by: "requester" });
  });
});
