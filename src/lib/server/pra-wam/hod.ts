import "server-only";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { statusFromAnswers, type HodBookingInfo, type HodDepartment, type HodMeetingStatus, type HodResponse } from "@/lib/pra-wam/hod";
import { leadDepartments, type Leads } from "@/lib/pra-wam/leads";
import { isHod } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { HOD_NOTE_LABEL, notifyPeople } from "./announcements";
import { callNameOf, listPeople, listRooms } from "./appraisal";
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
/**
 * Each department with its heads: the HODs who head it and (9 Nov 2026) its Leads, since a meeting
 * between HODs is a meeting with Leads too. Both come from every job a person holds (Pekerjaan in
 * Data karyawan writes a pw_leads row per HOD and Lead job), not only the Utama one.
 */
async function headsByDepartment(): Promise<HodDepartment[]> {
  const [people, { byPerson }, options] = await Promise.all([listPeople(), listLeads(), leadOptions()]);
  const active = new Map(people.filter(person => person.active).map(person => [person.id, person]));
  return options.departments.map(name => ({
    id: name, name,
    heads: [...byPerson.entries()].flatMap(([id, leads]): HodDepartment["heads"] => {
      const person = active.get(id);
      if (!person) return [];
      if (leads.departments.includes(name)) return [{ id, name: person.name, post: "HOD" as const }];
      return leadDepartments(leads, person.department).includes(name) ? [{ id, name: person.name, post: "Lead" as const }] : [];
    }).sort((a, b) => (a.post === b.post ? 0 : a.post === "HOD" ? -1 : 1) || a.name.localeCompare(b.name, "id")),
  }));
}

/**
 * Whether this person may hold a Meeting HOD, and the departments they stand for: a HOD for the
 * departments they head, a Lead (9 Nov 2026) for the departments of their Lead jobs.
 */
export async function hodStanding(member: Pick<Member, "id">): Promise<{ isHod: boolean; unitIds: string[] }> {
  const leads: Leads = await leadsOf(member.id).catch(() => ({ departments: [] as string[], lead: false }));
  const { departments, lead } = leads;
  // A Lead saved before their Lead jobs stands for their own department.
  const own = lead && !leadDepartments(leads, "").length ? (await listPeople().catch(() => [])).find(person => person.id === member.id)?.department : "";
  const unitIds = [...new Set([...departments, ...leadDepartments(leads, own)])];
  return { isHod: isHod({ isLead: departments.length > 0 || lead }), unitIds };
}

/** The departments to invite, each with its HODs; a department without a HOD shows but cannot be picked. */
export async function hodDepartments(): Promise<HodDepartment[]> {
  return headsByDepartment();
}

type MeetingRow = { id: string; title: string; agenda: string; starts_at: string; ends_at: string; place: string; requested_by: string; status: HodMeetingStatus; created_at: string; room_id?: string | null; booking_id?: string | null };
type InviteRow = { meeting_id: string; employee_id: string; department?: string; response: HodResponse; note: string; responded_at: string | null };

async function requireHod(member: Member) {
  const standing = await hodStanding(member);
  if (!standing.isHod) throw new ServiceError(403, "Meeting HOD hanya untuk HOD dan Lead.");
  return standing;
}

const when = (startsAt: string, endsAt: string, date: string) => `${dayLabel(date)}, ${clockLabel(startsAt)}–${clockLabel(endsAt)}`;

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
    await notifyPeople([meeting.requested_by, ...invited], { title: `Meeting HOD terjadwal: ${meeting.title}`, body: `Semua HOD menerima. ${span}${meeting.place ? `, ${meeting.place}` : ""}.${booked === "terpakai" ? ` ${meeting.place} ternyata sudah terpakai di jam itu, jadi belum dibooking: pilih ruang lain lewat Book.` : ""}`, label: HOD_NOTE_LABEL, topic: "hod", tag: `hod-${meeting.id}` }, member);
  } else if (status === "ditolak") {
    await notifyPeople([meeting.requested_by], { title: `Meeting HOD ditolak: ${meeting.title}`, body: `${await callNameOf(member.id, member.name)} menolak${note ? `: "${note}"` : "."} Kamu bisa mengajukan waktu lain.`, label: HOD_NOTE_LABEL, topic: "hod", tag: `hod-${meeting.id}` }, member);
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
  await notifyPeople((invites ?? []).map(row => row.employee_id), { title: `Meeting HOD dibatalkan: ${meeting.title}`, body: `${await callNameOf(member.id, member.name)} membatalkan meeting ini.`, label: HOD_NOTE_LABEL, topic: "hod", tag: `hod-${meeting.id}` }, member);
}

/* ── Booking "sebagai HOD" (6 Nov 2026): Book ruang's own form, the room locked at once. ── */

/** The HODs of the departments picked, each with the department they are asked for; the booker left out. */
export async function hodInvitees(member: Member, unitIds: string[]): Promise<{ employee_id: string; department: string }[]> {
  await requireHod(member);
  // Refused before the booking is saved, so a room is never booked without its invitations.
  const { error: ready } = await createPrivilegedClient().from("pw_hod_meetings").select("room_id,booking_id").limit(1);
  if (ready) throw new ServiceError(503, "Booking sebagai HOD menunggu migrasi 202611060003_pra_wam_hod_meeting_room.sql. Sementara itu booking sebagai pribadi.");
  const departments = await headsByDepartment();
  const invites: { employee_id: string; department: string }[] = [];
  const empty: string[] = [];
  for (const unitId of new Set(unitIds)) {
    const department = departments.find(item => item.id === unitId);
    if (!department) throw new ServiceError(400, "Ada departemen yang tidak dikenal. Muat ulang lalu pilih lagi.");
    if (!department.heads.length) empty.push(department.name);
    for (const head of department.heads) if (head.id !== member.id && !invites.some(invite => invite.employee_id === head.id)) invites.push({ employee_id: head.id, department: department.name });
  }
  if (empty.length) throw new ServiceError(422, `${empty.join(", ")} belum punya HOD atau Lead.`, { participants: [`${empty.join(", ")} belum punya HOD atau Lead.`] });
  if (!invites.length) throw new ServiceError(422, "Pilih departemen lain selain departemenmu sendiri.", { participants: ["Pilih departemen lain selain departemenmu sendiri."] });
  return invites;
}

/** The session a booking became (its notes point there, so a tap opens it). */
async function bookingSession(bookingId: string): Promise<string | undefined> {
  const { data } = await createPrivilegedClient().from("pw_sessions").select("id").eq("booking_id", bookingId).maybeSingle();
  return data?.id ?? undefined;
}

type BookedMeeting = { id: string; title: string; description: string; startsAt: string; endsAt: string; roomId: string | null; place?: string | null };
const placeOf = (room: { name: string } | undefined, booking: BookedMeeting) => room?.name ?? booking.place ?? "";

/** After a booking made as HOD is saved: its meeting and the invitations, and a note to each HOD with Terima and Tolak. */
export async function linkHodBooking(member: Member, booking: BookedMeeting, invites: { employee_id: string; department: string }[]): Promise<void> {
  const client = createPrivilegedClient();
  const room = booking.roomId ? (await listRooms()).find(item => item.id === booking.roomId) : undefined;
  const { data, error } = await client.from("pw_hod_meetings").insert({
    title: booking.title, agenda: booking.description, starts_at: booking.startsAt, ends_at: booking.endsAt, place: placeOf(room, booking),
    requested_by: member.id, room_id: room?.id ?? null, booking_id: booking.id,
  }).select("id").single();
  if (error || !data) fail(error ?? { message: "Meeting HOD belum tersimpan." });
  const { error: inviteError } = await client.from("pw_hod_meeting_invites").insert(invites.map(invite => ({ ...invite, meeting_id: data.id })));
  if (inviteError) fail(inviteError);
  const where = placeOf(room, booking);
  await notifyPeople(invites.map(invite => invite.employee_id), {
    title: `Undangan Meeting HOD: ${booking.title}`,
    body: `${await callNameOf(member.id, member.name)} mengajak kamu meeting HOD, ${when(wibTime(booking.startsAt), wibTime(booking.endsAt), wibDate(booking.startsAt))}${where ? ` di ${where}` : ""}. Ruang sudah dibooking. Terima atau tolak di sini.`,
    sessionId: await bookingSession(booking.id), label: HOD_NOTE_LABEL, topic: "hod", tag: `hod-${data.id}`,
  }, member);
}

/** A booking made as HOD moved or changed room: everyone answers again. */
export async function relinkHodBooking(member: Member, booking: BookedMeeting): Promise<void> {
  const client = createPrivilegedClient();
  const { data: meeting } = await client.from("pw_hod_meetings").select("*").eq("booking_id", booking.id).neq("status", "batal").maybeSingle();
  if (!meeting) return;
  const moved = new Date(meeting.starts_at).getTime() !== new Date(booking.startsAt).getTime()
    || new Date(meeting.ends_at).getTime() !== new Date(booking.endsAt).getTime() || (meeting.room_id ?? null) !== (booking.roomId ?? null);
  const room = booking.roomId ? (await listRooms()).find(item => item.id === booking.roomId) : undefined;
  const { error } = await client.from("pw_hod_meetings").update({
    title: booking.title, agenda: booking.description, starts_at: booking.startsAt, ends_at: booking.endsAt, place: placeOf(room, booking),
    room_id: room?.id ?? null, ...(moved ? { status: "menunggu" } : {}), updated_at: new Date().toISOString(),
  }).eq("id", meeting.id);
  if (error) fail(error);
  if (!moved) return;
  const { data: invites, error: resetError } = await client.from("pw_hod_meeting_invites").update({ response: "menunggu", note: "", responded_at: null }).eq("meeting_id", meeting.id).select("employee_id");
  if (resetError) fail(resetError);
  const where = placeOf(room, booking);
  await notifyPeople((invites ?? []).map(row => row.employee_id), {
    title: `Meeting HOD diubah: ${booking.title}`,
    body: `${await callNameOf(member.id, member.name)} memindah meeting ini ke ${when(wibTime(booking.startsAt), wibTime(booking.endsAt), wibDate(booking.startsAt))}${where ? ` di ${where}` : ""}. Jawab lagi: terima atau tolak.`,
    sessionId: await bookingSession(booking.id), label: HOD_NOTE_LABEL, topic: "hod", tag: `hod-${meeting.id}`,
  }, member);
}

/** A booking made as HOD was cancelled: its meeting too (the booking's cancel note tells the HODs). */
export async function cancelHodBooking(member: Member, bookingId: string): Promise<void> {
  const client = createPrivilegedClient();
  const { data: meeting, error } = await client.from("pw_hod_meetings").select("id,title").eq("booking_id", bookingId).neq("status", "batal").maybeSingle();
  if (error && !missing(error)) databaseError(error);
  if (!meeting) return;
  await client.from("pw_hod_meetings").update({ status: "batal", updated_at: new Date().toISOString() }).eq("id", meeting.id);
  // The HODs already heard: the booking's own cancel note goes to its participants.
}

/** Whether this booking was made as HOD (its changes then tell the HODs once, from here). */
export async function isHodBooking(bookingId: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().from("pw_hod_meetings").select("id").eq("booking_id", bookingId).neq("status", "batal").maybeSingle();
  return !error && !!data;
}

/** Per booking made as HOD: its meeting, status and each HOD's answer (Book's detail sheet). */
export async function hodByBookings(bookingIds: string[]): Promise<Record<string, HodBookingInfo>> {
  if (!bookingIds.length) return {};
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_hod_meetings").select("id,status,booking_id,requested_by").in("booking_id", bookingIds).neq("status", "batal");
  if (error || !data?.length) return {};
  const [{ data: invites }, people] = await Promise.all([
    client.from("pw_hod_meeting_invites").select("*").in("meeting_id", data.map(row => row.id)),
    listPeople(),
  ]);
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "Tanpa nama";
  return Object.fromEntries(data.map(row => [row.booking_id as string, {
    meetingId: row.id as string, status: row.status as HodMeetingStatus, requesterId: row.requested_by as string,
    invites: ((invites ?? []) as InviteRow[]).filter(invite => invite.meeting_id === row.id).map(invite => ({
      id: invite.employee_id, name: name(invite.employee_id), unit: invite.department ?? "", response: invite.response, note: invite.note, respondedAt: invite.responded_at,
    })),
  }]));
}

/** Per session (a booking made as HOD becomes one): this HOD's invitation, for Terima and Tolak on the note. */
export async function hodInvitesBySession(memberId: string): Promise<Record<string, { meetingId: string; response: HodResponse; status: HodMeetingStatus }>> {
  const client = createPrivilegedClient();
  const { data: mine, error } = await client.from("pw_hod_meeting_invites").select("meeting_id,response").eq("employee_id", memberId);
  if (error || !mine?.length) return {};
  const { data: meetings } = await client.from("pw_hod_meetings").select("id,status,booking_id").in("id", mine.map(row => row.meeting_id)).not("booking_id", "is", null);
  if (!meetings?.length) return {};
  const { data: sessions } = await client.from("pw_sessions").select("id,booking_id").in("booking_id", meetings.map(row => row.booking_id));
  const result: Record<string, { meetingId: string; response: HodResponse; status: HodMeetingStatus }> = {};
  for (const session of sessions ?? []) {
    const meeting = meetings.find(row => row.booking_id === session.booking_id);
    const invite = mine.find(row => row.meeting_id === meeting?.id);
    if (meeting && invite) result[session.id] = { meetingId: meeting.id, response: invite.response as HodResponse, status: meeting.status as HodMeetingStatus };
  }
  return result;
}
