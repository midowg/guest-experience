import "server-only";
import { clockLabel, dayLabel, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { statusFromAnswers, type HodDepartment, type HodMeeting, type HodMeetingInput, type HodMeetingStatus, type HodResponse } from "@/lib/pra-wam/hod";
import { isHod } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notifyPeople } from "./announcements";
import { listPeople } from "./appraisal";
import type { Member } from "./session";
import { listUnits } from "./units";

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
 * The departments and who heads each (6 Nov 2026): the department column of Data karyawan, so it
 * works without the unit import. A department's HODs are its active people Admin WAM ticked as
 * HOD, and the department leads of the unit import once it has run. A department is known by its
 * name (`id` is the name).
 */
async function headsByDepartment(): Promise<{ departments: HodDepartment[]; headOf: Map<string, string[]> }> {
  const client = createPrivilegedClient();
  const [{ units, memberships }, people, { data: ticked, error }] = await Promise.all([
    listUnits().catch(() => ({ units: [], memberships: [] })), listPeople(),
    client.from("pw_roles").select("employee_id").eq("role", "hod"),
  ]);
  if (error && !missing(error)) databaseError(error);
  const departmentUnits = new Set(units.filter(unit => unit.kind === "departemen").map(unit => unit.id));
  const heads = new Set([
    ...(ticked ?? []).map(row => row.employee_id),
    ...memberships.filter(member => member.isLead && departmentUnits.has(member.unitId)).map(member => member.employeeId),
  ]);
  const active = people.filter(person => person.active && person.department.trim());
  const names = [...new Set(active.map(person => person.department.trim()))].sort((a, b) => a.localeCompare(b, "id"));
  const headOf = new Map<string, string[]>();
  const departments = names.map(name => {
    const list = active.filter(person => person.department.trim() === name && heads.has(person.id)).map(person => ({ id: person.id, name: person.name }));
    for (const head of list) headOf.set(head.id, [...(headOf.get(head.id) ?? []), name]);
    return { id: name, name, heads: list.sort((a, b) => a.name.localeCompare(b.name, "id")) };
  });
  return { departments, headOf };
}

/** Whether this person is a HOD, and of which departments (ticked, or a lead of the unit import). */
export async function hodStanding(member: Pick<Member, "id" | "roles" | "department">): Promise<{ isHod: boolean; unitIds: string[] }> {
  const { memberships } = await listUnits().catch(() => ({ memberships: [] }));
  const isLead = memberships.some(row => row.employeeId === member.id && row.isLead);
  const hod = isHod(member, { isLead });
  return { isHod: hod, unitIds: hod && member.department.trim() ? [member.department.trim()] : [] };
}

/** The departments to invite, each with its HODs; a department without a HOD shows but cannot be picked. */
export async function hodDepartments(): Promise<HodDepartment[]> {
  return (await headsByDepartment()).departments;
}

type MeetingRow = { id: string; title: string; agenda: string; starts_at: string; ends_at: string; place: string; requested_by: string; status: HodMeetingStatus; created_at: string };
type InviteRow = { meeting_id: string; employee_id: string; unit_id: string | null; response: HodResponse; note: string; responded_at: string | null };

/** Every meeting, with the names of who asked and who was asked; `migrated: false` before the migration. */
export async function listHodMeetings(): Promise<{ meetings: HodMeeting[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_hod_meetings").select("id,title,agenda,starts_at,ends_at,place,requested_by,status,created_at").order("starts_at", { ascending: false }).limit(300);
  if (error) { if (missing(error)) return { meetings: [], migrated: false }; databaseError(error); }
  const rows = (data ?? []) as MeetingRow[];
  if (!rows.length) return { meetings: [], migrated: true };
  const [{ data: invites, error: inviteError }, people, { units, memberships }] = await Promise.all([
    client.from("pw_hod_meeting_invites").select("meeting_id,employee_id,unit_id,response,note,responded_at").in("meeting_id", rows.map(row => row.id)),
    listPeople(), listUnits(),
  ]);
  if (inviteError) fail(inviteError);
  const unitName = new Map(units.map(unit => [unit.id, unit.name]));
  const person = (id: string) => people.find(item => item.id === id);
  const homeUnit = (id: string) => {
    const primary = memberships.find(row => row.employeeId === id && row.isPrimary) ?? memberships.find(row => row.employeeId === id);
    return (primary && unitName.get(primary.unitId)) || person(id)?.department || "";
  };
  return {
    migrated: true,
    meetings: rows.map(row => ({
      id: row.id, title: row.title, agenda: row.agenda, startsAt: row.starts_at, endsAt: row.ends_at, place: row.place, status: row.status, createdAt: row.created_at,
      requester: { id: row.requested_by, name: person(row.requested_by)?.name ?? "Tanpa nama", unit: homeUnit(row.requested_by) },
      invites: ((invites ?? []) as InviteRow[]).filter(invite => invite.meeting_id === row.id).map(invite => ({
        id: invite.employee_id, name: person(invite.employee_id)?.name ?? "Tanpa nama",
        unit: (invite.unit_id && unitName.get(invite.unit_id)) || homeUnit(invite.employee_id),
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
  const { departments } = await headsByDepartment();
  const invites: { employee_id: string; unit_id: null }[] = [];
  const empty: string[] = [];
  for (const unitId of new Set(input.unitIds)) {
    const department = departments.find(item => item.id === unitId);
    if (!department) throw new ServiceError(400, "Ada departemen yang tidak dikenal. Muat ulang lalu pilih lagi.");
    const heads = department.heads.filter(head => head.id !== member.id);
    if (!department.heads.length) empty.push(department.name);
    // The department is the person's own (Data karyawan); the unit column stays for the unit import.
    for (const head of heads) if (!invites.some(invite => invite.employee_id === head.id)) invites.push({ employee_id: head.id, unit_id: null });
  }
  if (empty.length) throw new ServiceError(400, `${empty.join(", ")} belum punya HOD. Minta Admin WAM mencentang HOD-nya.`);
  if (!invites.length) throw new ServiceError(400, "Pilih departemen lain selain departemenmu sendiri.");

  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_hod_meetings").insert({
    title: input.title, agenda: input.agenda, starts_at: startsAt, ends_at: endsAt, place: input.place, requested_by: member.id,
  }).select("id").single();
  if (error || !data) fail(error ?? { message: "Meeting belum tersimpan." });
  const { error: inviteError } = await client.from("pw_hod_meeting_invites").insert(invites.map(invite => ({ ...invite, meeting_id: data.id })));
  if (inviteError) { await client.from("pw_hod_meetings").delete().eq("id", data.id); fail(inviteError); }
  await notifyPeople(invites.map(invite => invite.employee_id), {
    title: `Undangan Meeting HOD: ${input.title}`,
    body: `${member.name} mengajak kamu meeting HOD pada ${when(input.start, input.end, input.date)}${input.place ? ` di ${input.place}` : ""}. Terima atau tolak di Meeting HOD.`,
  }, member);
  return data.id;
}

async function meetingRow(id: string): Promise<MeetingRow> {
  const { data, error } = await createPrivilegedClient().from("pw_hod_meetings").select("id,title,agenda,starts_at,ends_at,place,requested_by,status,created_at").eq("id", id).maybeSingle();
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
    await notifyPeople([meeting.requested_by, ...(all ?? []).map(row => row.employee_id)], { title: `Meeting HOD terjadwal: ${meeting.title}`, body: `Semua HOD menerima. ${span}${meeting.place ? `, ${meeting.place}` : ""}.` }, member);
  } else if (status === "ditolak") {
    await notifyPeople([meeting.requested_by], { title: `Meeting HOD ditolak: ${meeting.title}`, body: `${member.name} menolak${note ? `: "${note}"` : "."} Kamu bisa mengajukan waktu lain.` }, member);
  }
  return status;
}

/** The HOD who asked cancels the meeting; everyone invited is told. */
export async function cancelHodMeeting(member: Member, id: string): Promise<void> {
  const meeting = await meetingRow(id);
  if (meeting.requested_by !== member.id) throw new ServiceError(403, "Hanya HOD yang mengajukan yang bisa membatalkan.");
  if (meeting.status === "batal") return;
  const client = createPrivilegedClient();
  const { error } = await client.from("pw_hod_meetings").update({ status: "batal", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error);
  const { data: invites } = await client.from("pw_hod_meeting_invites").select("employee_id").eq("meeting_id", id);
  await notifyPeople((invites ?? []).map(row => row.employee_id), { title: `Meeting HOD dibatalkan: ${meeting.title}`, body: `${member.name} membatalkan meeting ini.` }, member);
}
