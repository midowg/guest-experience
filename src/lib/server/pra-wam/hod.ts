import "server-only";
import { clockLabel, dayLabel, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { statusFromAnswers, type HodDepartment, type HodMeeting, type HodMeetingInput, type HodMeetingStatus, type HodResponse } from "@/lib/pra-wam/hod";
import { isHod } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { HOD_NOTE_LABEL, notifyPeople } from "./announcements";
import { listPeople, listRooms } from "./appraisal";
import type { Member } from "./session";
import { leadOptions, leadsOf, listLeads } from "./leads";

/*
 * Meeting HOD (migration 202611060001): meetings between department heads, asked by one HOD and
 * accepted or declined by each HOD invited (src/lib/pra-wam/hod.ts has the rules). Every HOD reads
 * the list; nobody else does.
 */

const MIGRATION = "202611060001_pra_wam_hod_meetings.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_hod_meeting/.test(error.message ?? "");
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw new ServiceError(503, `Meeting HOD menunggu migrasi ${MIGRATION}.`);
  databaseError(error);
}

/**
 * The departments and who heads each (6 Nov 2026): the department names of Data karyawan, and the
 * HODs set per person in Akun dan peran or Data karyawan (pw_leads; one person may head several).
 * A department is known by its name (`id` is the name).
 */
async function headsByDepartment(): Promise<HodDepartment[]> {
  const [people, { byPerson }, options] = await Promise.all([listPeople(), listLeads(), leadOptions()]);
  const active = new Map(people.filter(person => person.active).map(person => [person.id, person.name]));
  return options.departments.map(name => ({
    id: name, name,
    heads: [...byPerson.entries()].filter(([id, leads]) => active.has(id) && leads.departments.includes(name))
      .map(([id]) => ({ id, name: active.get(id)! })).sort((a, b) => a.name.localeCompare(b.name, "id")),
  }));
}

/** Whether this person is a HOD, and of which departments. */
export async function hodStanding(member: Pick<Member, "id">): Promise<{ isHod: boolean; unitIds: string[] }> {
  const { departments } = await leadsOf(member.id).catch(() => ({ departments: [] as string[] }));
  return { isHod: isHod({ isLead: departments.length > 0 }), unitIds: departments };
}

/** The departments to invite, each with its HODs; a department without a HOD shows but cannot be picked. */
export async function hodDepartments(): Promise<HodDepartment[]> {
  return headsByDepartment();
}

type MeetingRow = { id: string; title: string; agenda: string; starts_at: string; ends_at: string; place: string; requested_by: string; status: HodMeetingStatus; created_at: string; room_id?: string | null; booking_id?: string | null };
type InviteRow = { meeting_id: string; employee_id: string; department?: string; response: HodResponse; note: string; responded_at: string | null };

/** Every meeting, with the names of who asked and who was asked; `migrated: false` before the migration. */
export async function listHodMeetings(): Promise<{ meetings: HodMeeting[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_hod_meetings").select("*").order("starts_at", { ascending: false }).limit(300);
  if (error) { if (missing(error)) return { meetings: [], migrated: false }; databaseError(error); }
  const rows = (data ?? []) as MeetingRow[];
  if (!rows.length) return { meetings: [], migrated: true };
  const [{ data: invites, error: inviteError }, people, leads] = await Promise.all([
    client.from("pw_hod_meeting_invites").select("*").in("meeting_id", rows.map(row => row.id)),
    listPeople(), listLeads(),
  ]);
  if (inviteError) fail(inviteError);
  const person = (id: string) => people.find(item => item.id === id);
  // Who asked speaks for the departments they head, else their own.
  const homeUnit = (id: string) => leads.byPerson.get(id)?.departments.join(", ") || person(id)?.department || "";
  return {
    migrated: true,
    meetings: rows.map(row => ({
      id: row.id, title: row.title, agenda: row.agenda, startsAt: row.starts_at, endsAt: row.ends_at, place: row.place, status: row.status, createdAt: row.created_at,
      roomId: row.room_id ?? null, roomBooked: !!row.booking_id,
      requester: { id: row.requested_by, name: person(row.requested_by)?.name ?? "Tanpa nama", unit: homeUnit(row.requested_by) },
      invites: ((invites ?? []) as InviteRow[]).filter(invite => invite.meeting_id === row.id).map(invite => ({
        id: invite.employee_id, name: person(invite.employee_id)?.name ?? "Tanpa nama",
        unit: invite.department || homeUnit(invite.employee_id),
        response: invite.response, note: invite.note, respondedAt: invite.responded_at,
      })).sort((a, b) => a.unit.localeCompare(b.unit, "id")),
    })),
  };
}

/** How many meetings wait for this HOD's answer, for the menu's badge. */
export async function hodWaitingCount(member: Pick<Member, "id">): Promise<number> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_hod_meeting_invites").select("meeting_id,pw_hod_meetings!inner(status,ends_at)")
    .eq("employee_id", member.id).eq("response", "menunggu").eq("pw_hod_meetings.status", "menunggu").gt("pw_hod_meetings.ends_at", new Date().toISOString());
  if (error) return 0;
  return (data ?? []).length;
}

async function requireHod(member: Member) {
  const standing = await hodStanding(member);
  if (!standing.isHod) throw new ServiceError(403, "Meeting HOD hanya untuk HOD.");
  return standing;
}

const when = (startsAt: string, endsAt: string, date: string) => `${dayLabel(date)}, ${clockLabel(startsAt)}–${clockLabel(endsAt)}`;

/** A HOD asks the HODs of the picked departments; each is told and answers on Meeting HOD. */
export async function createHodMeeting(member: Member, input: HodMeetingInput): Promise<string> {
  await requireHod(member);
  const startsAt = wibInstant(input.date, input.start), endsAt = wibInstant(input.date, input.end);
  if (new Date(startsAt) <= new Date()) throw new ServiceError(400, "Waktu meeting sudah lewat. Pilih jam yang akan datang.");
  const departments = await headsByDepartment();
  const invites: { employee_id: string; department: string }[] = [];
  const empty: string[] = [];
  for (const unitId of new Set(input.unitIds)) {
    const department = departments.find(item => item.id === unitId);
    if (!department) throw new ServiceError(400, "Ada departemen yang tidak dikenal. Muat ulang lalu pilih lagi.");
    const heads = department.heads.filter(head => head.id !== member.id);
    if (!department.heads.length) empty.push(department.name);
    // A HOD of several departments picked together is asked once, for the first of them.
    for (const head of heads) if (!invites.some(invite => invite.employee_id === head.id)) invites.push({ employee_id: head.id, department: department.name });
  }
  if (empty.length) throw new ServiceError(400, `${empty.join(", ")} belum punya HOD. Minta Admin WAM mencentang HOD-nya.`);
  if (!invites.length) throw new ServiceError(400, "Pilih departemen lain selain departemenmu sendiri.");

  const client = createPrivilegedClient();
  // An office room is kept by its id too, to book it once every HOD accepts (migration 202611060003).
  const room = input.roomId ? (await listRooms()).find(item => item.id === input.roomId && item.bookable) : undefined;
  if (input.roomId && !room) throw new ServiceError(400, "Ruangan itu tidak bisa dipakai. Pilih ruangan lain.");
  const values = { title: input.title, agenda: input.agenda, starts_at: startsAt, ends_at: endsAt, place: room?.name ?? input.place, requested_by: member.id };
  let { data, error } = await client.from("pw_hod_meetings").insert({ ...values, ...(room ? { room_id: room.id } : {}) }).select("id").single();
  // Before migration 202611060003 the meeting keeps only the room's name (and books nothing).
  if (error && room && /room_id/.test(error.message)) ({ data, error } = await client.from("pw_hod_meetings").insert(values).select("id").single());
  if (error || !data) fail(error ?? { message: "Meeting belum tersimpan." });
  const { error: inviteError } = await client.from("pw_hod_meeting_invites").insert(invites.map(invite => ({ ...invite, meeting_id: data.id })));
  if (inviteError) { await client.from("pw_hod_meetings").delete().eq("id", data.id); fail(inviteError); }
  await notifyPeople(invites.map(invite => invite.employee_id), {
    title: `Undangan Meeting HOD: ${input.title}`,
    body: `${member.name} mengajak kamu meeting HOD pada ${when(input.start, input.end, input.date)}${input.place ? ` di ${input.place}` : ""}. Terima atau tolak di Book → Meeting HOD.`,
    label: HOD_NOTE_LABEL,
  }, member);
  return data.id;
}

async function meetingRow(id: string): Promise<MeetingRow> {
  const { data, error } = await createPrivilegedClient().from("pw_hod_meetings").select("*").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Meeting tidak ditemukan.");
  return data as MeetingRow;
}

/** An invited HOD accepts or declines; the meeting is scheduled once all accept, declined once one declines. */
export async function answerHodMeeting(member: Member, id: string, accept: boolean, note: string): Promise<HodMeetingStatus> {
  await requireHod(member);
  const meeting = await meetingRow(id);
  if (meeting.status !== "menunggu") throw new ServiceError(409, meeting.status === "batal" ? "Meeting ini sudah dibatalkan." : "Meeting ini sudah tidak menunggu jawaban.");
  if (new Date(meeting.ends_at) <= new Date()) throw new ServiceError(409, "Meeting ini sudah lewat.");
  const client = createPrivilegedClient();
  const { data: updated, error } = await client.from("pw_hod_meeting_invites")
    .update({ response: accept ? "terima" : "tolak", note, responded_at: new Date().toISOString() })
    .eq("meeting_id", id).eq("employee_id", member.id).select("employee_id");
  if (error) fail(error);
  if (!updated?.length) throw new ServiceError(403, "Kamu tidak diundang ke meeting ini.");
  const { data: all, error: allError } = await client.from("pw_hod_meeting_invites").select("employee_id,response").eq("meeting_id", id);
  if (allError) fail(allError);
  const status = statusFromAnswers((all ?? []).map(row => row.response as HodResponse));
  if (status !== "menunggu") {
    const { error: statusError } = await client.from("pw_hod_meetings").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "menunggu");
    if (statusError) fail(statusError);
  }
  const span = when(wibTime(meeting.starts_at), wibTime(meeting.ends_at), wibDate(meeting.starts_at));
  if (status === "terjadwal") {
    const invited = (all ?? []).map(row => row.employee_id);
    const booked = await bookMeetingRoom(meeting, invited);
    await notifyPeople([meeting.requested_by, ...invited], { title: `Meeting HOD terjadwal: ${meeting.title}`, body: `Semua HOD menerima. ${span}${meeting.place ? `, ${meeting.place}` : ""}.${booked === "terpakai" ? ` ${meeting.place} ternyata sudah terpakai di jam itu, jadi belum dibooking: pilih ruang lain lewat Book.` : ""}`, label: HOD_NOTE_LABEL }, member);
  } else if (status === "ditolak") {
    await notifyPeople([meeting.requested_by], { title: `Meeting HOD ditolak: ${meeting.title}`, body: `${member.name} menolak${note ? `: "${note}"` : "."} Kamu bisa mengajukan waktu lain.`, label: HOD_NOTE_LABEL }, member);
  }
  return status;
}

/**
 * Books the meeting's office room once it is scheduled: in the name of the HOD who asked, with the
 * invited HODs as participants, so the room is held and the meeting shows in their agenda (a
 * booking becomes a session). The database refuses a room already taken: then the meeting stays
 * scheduled without it, and everyone hears. "dibooking", "terpakai", or "tanpa-ruang".
 */
async function bookMeetingRoom(meeting: MeetingRow, invited: string[]): Promise<"dibooking" | "terpakai" | "tanpa-ruang"> {
  if (!meeting.room_id || meeting.booking_id) return "tanpa-ruang";
  const client = createPrivilegedClient();
  const { data, error } = await client.rpc("pw_save_booking", {
    p_id: null, p_room: meeting.room_id, p_title: `Meeting HOD: ${meeting.title}`.slice(0, 120), p_description: meeting.agenda.slice(0, 500),
    p_starts: meeting.starts_at, p_ends: meeting.ends_at, p_booked_by: meeting.requested_by, p_participants: invited,
    // A meeting between HODs is not one of the asker's own bookings: their daily limit does not stop it.
    p_max_per_day: 50,
  });
  if (error) {
    if (error.code === "23P01" || /ROOM_NOT_BOOKABLE/.test(error.message)) return "terpakai";
    databaseError(error);
  }
  const { error: linkError } = await client.from("pw_hod_meetings").update({ booking_id: data as string }).eq("id", meeting.id);
  if (linkError) databaseError(linkError);
  return "dibooking";
}

/** The HOD who asked cancels the meeting; everyone invited is told. */
export async function cancelHodMeeting(member: Member, id: string): Promise<void> {
  const meeting = await meetingRow(id);
  if (meeting.requested_by !== member.id) throw new ServiceError(403, "Hanya HOD yang mengajukan yang bisa membatalkan.");
  if (meeting.status === "batal") return;
  const client = createPrivilegedClient();
  const { error } = await client.from("pw_hod_meetings").update({ status: "batal", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error);
  // Its room booking goes with it (its session too, by the booking's trigger), so the room is free again.
  if (meeting.booking_id) {
    const { error: bookingError } = await client.from("pw_room_bookings")
      .update({ status: "batal", cancelled_by: member.id, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", meeting.booking_id).eq("status", "aktif");
    if (bookingError) databaseError(bookingError);
  }
  const { data: invites } = await client.from("pw_hod_meeting_invites").select("employee_id").eq("meeting_id", id);
  await notifyPeople((invites ?? []).map(row => row.employee_id), { title: `Meeting HOD dibatalkan: ${meeting.title}`, body: `${member.name} membatalkan meeting ini.`, label: HOD_NOTE_LABEL }, member);
}
