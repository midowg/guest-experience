import "server-only";
import {
  LEAVE_MIGRATION, leaveDateProblem, monthSpan, overlaps,
  type AdminLeave, type LeaveInput, type LeaveRequest, type LeaveStatus, type LeaveType, type TeamLeave,
} from "@/lib/hr/leave";
import { cellOf, type Cell, type DayTable, type MonthTable } from "@/lib/hr/recap";
import type { ClockInState, DailyKind, DailyStatus, ReasonKind } from "@/lib/hr/attendance";
import { asViewerZone, zoneDate, zoneTime } from "@/lib/pra-wam/zone";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "../pra-wam/appraisal";
import type { Member } from "../pra-wam/session";
import { viewerZone } from "../pra-wam/zone";
import { adminDay, clockInState, clockers, offices, type AdminActorRef } from "./attendance";

/*
 * Cuti, sakit, izin, dinas and the late time (migration 202611280001, decided 21 Nov 2026); the
 * rules are in src/lib/hr/leave.ts and src/lib/hr/recap.ts. Before the migration: no requests (the
 * app says what it waits for), late after 09:00, and the tables still colour the clock-ins.
 */

type DbError = { code?: string; message: string };
/** A table or column that is not there yet (the migration has not run), by its code or its words; never a check that failed. */
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /does not exist|Could not find/i.test(error.message ?? "");
const leaveWaiting = () => new ServiceError(503, `Cuti dan izin menunggu migrasi ${LEAVE_MIGRATION}.`);
function fail(error: DbError): never {
  if (missing(error)) throw leaveWaiting();
  databaseError(error);
}

/** Whether migration 202611280001 ran; asked once a minute. */
let checked: { at: number; ready: boolean } | null = null;
export async function leaveReady(): Promise<boolean> {
  if (checked && Date.now() - checked.at < 60_000) return checked.ready;
  const { error } = await createPrivilegedClient().from("pw_leave_requests").select("id").limit(1);
  checked = { at: Date.now(), ready: !error };
  return !error;
}

// ---------------------------------------------------------------------------------------------
// The late time

export const DEFAULT_LATE_AFTER = "09:00";
/** A masuk after this ("HH:MM", the office's zone) is Telat; 09:00 before the migration. */
export async function lateAfter(): Promise<string> {
  if (!(await leaveReady())) return DEFAULT_LATE_AFTER;
  const { data, error } = await createPrivilegedClient().from("pw_hr_settings").select("late_after").eq("id", true).maybeSingle();
  if (error) return DEFAULT_LATE_AFTER;
  return ((data as { late_after?: string } | null)?.late_after ?? DEFAULT_LATE_AFTER).slice(0, 5);
}
export async function setLateAfter(time: string, actor: AdminActorRef): Promise<void> {
  if (!(await leaveReady())) throw leaveWaiting();
  const { error } = await createPrivilegedClient().from("pw_hr_settings").upsert({ id: true, late_after: time, updated_label: actor.label, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) fail(error);
}

// ---------------------------------------------------------------------------------------------
// Requests

type LeaveRow = {
  id: string; employee_id: string; type: LeaveType; start_date: string; end_date: string; note: string; status: LeaveStatus;
  decided_label: string | null; decision_note: string | null; created_at: string;
};
const LEAVE_COLUMNS = "id,employee_id,type,start_date,end_date,note,status,decided_label,decision_note,created_at";
const asLeave = (row: LeaveRow): LeaveRequest => ({
  id: row.id, type: row.type, startDate: row.start_date, endDate: row.end_date, note: row.note, status: row.status,
  decidedLabel: row.decided_label, decisionNote: row.decision_note, createdAt: row.created_at,
});
const daysFrom = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The person's own requests: from 120 days back, newest first; none before the migration. */
export async function myLeaves(member: Member, now = new Date()): Promise<LeaveRequest[]> {
  if (!(await leaveReady())) return [];
  const today = zoneDate(now.toISOString(), await viewerZone());
  const { data, error } = await createPrivilegedClient().from("pw_leave_requests").select(LEAVE_COLUMNS)
    .eq("employee_id", member.id).gte("end_date", daysFrom(today, -120)).order("start_date", { ascending: false }).limit(60);
  if (error) fail(error);
  return ((data ?? []) as LeaveRow[]).map(asLeave);
}

/** An employee asks for cuti, sakit, izin or dinas; not over a span they already asked for. */
export async function createLeave(member: Member, input: LeaveInput, now = new Date()): Promise<LeaveRequest> {
  if (!(await leaveReady())) throw leaveWaiting();
  const today = zoneDate(now.toISOString(), await viewerZone());
  const problem = leaveDateProblem(input.startDate, today);
  if (problem) throw new ServiceError(422, problem);
  const client = createPrivilegedClient();
  const { data: open, error: openError } = await client.from("pw_leave_requests").select("start_date,end_date")
    .eq("employee_id", member.id).in("status", ["menunggu", "disetujui"]).lte("start_date", input.endDate).gte("end_date", input.startDate).limit(1);
  if (openError) fail(openError);
  const clash = () => new ServiceError(409, "Tanggal itu sudah ada di pengajuanmu yang lain. Batalkan yang masih menunggu di Pengajuan, atau minta Admin HR membatalkan yang sudah disetujui.");
  if ((open ?? []).some(row => overlaps({ startDate: (row as LeaveRow).start_date, endDate: (row as LeaveRow).end_date }, input))) throw clash();
  const { data, error } = await client.from("pw_leave_requests").insert({
    employee_id: member.id, type: input.type, start_date: input.startDate, end_date: input.endDate, note: input.note,
  }).select(LEAVE_COLUMNS).single();
  if (error) fail(error);
  const made = data as LeaveRow;
  // Two sends at once (two devices, a retry) both pass the check above: the later one steps back.
  const { data: twins } = await client.from("pw_leave_requests").select("id,created_at,start_date,end_date")
    .eq("employee_id", member.id).in("status", ["menunggu", "disetujui"]).lte("start_date", input.endDate).gte("end_date", input.startDate);
  const earlier = ((twins ?? []) as LeaveRow[]).filter(row => row.id !== made.id && overlaps({ startDate: row.start_date, endDate: row.end_date }, input))
    .some(row => row.created_at < made.created_at || (row.created_at === made.created_at && row.id < made.id));
  if (earlier) {
    await client.from("pw_leave_requests").update({ status: "dibatalkan" }).eq("id", made.id);
    throw clash();
  }
  return asLeave(made);
}

/** The employee withdraws a request that still waits. */
export async function cancelLeave(member: Member, id: string): Promise<void> {
  if (!(await leaveReady())) throw leaveWaiting();
  const { data, error } = await createPrivilegedClient().from("pw_leave_requests").update({ status: "dibatalkan" })
    .eq("id", id).eq("employee_id", member.id).eq("status", "menunggu").select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(409, "Pengajuan ini sudah diputuskan atau dibatalkan.");
}

/** WG People's whole state for one person: the absensi (clockInState) and their own requests. */
export async function appState(member: Member, now = new Date()): Promise<ClockInState> {
  const [state, ready] = await Promise.all([clockInState(member, now), leaveReady()]);
  return { ...state, leaves: ready ? await myLeaves(member, now).catch(() => []) : null };
}

/** Waiting and approved requests that touch a span of days, for the tables and the team. */
async function leavesBetween(first: string, last: string): Promise<LeaveRow[]> {
  if (!(await leaveReady())) return [];
  const { data, error } = await createPrivilegedClient().from("pw_leave_requests").select(LEAVE_COLUMNS)
    .in("status", ["menunggu", "disetujui"]).lte("start_date", last).gte("end_date", first).order("start_date").limit(2000);
  if (error) fail(error);
  return (data ?? []) as LeaveRow[];
}

/** WG People → Tim: everyone's waiting and approved days in a month, without the notes. */
export async function teamLeaves(member: Member, month: string): Promise<{ ready: boolean; leaves: TeamLeave[] }> {
  if (!(await leaveReady())) return { ready: false, leaves: [] };
  const { first, last } = monthSpan(month);
  const [people, rows] = await Promise.all([listPeople(), leavesBetween(first, last)]);
  const byId = new Map(people.map(person => [person.id, person]));
  return {
    ready: true,
    leaves: rows.filter(row => byId.get(row.employee_id)?.active ?? false).map(row => ({
      id: row.id, employeeId: row.employee_id, name: byId.get(row.employee_id)?.fullName ?? "(tidak dikenal)", department: byId.get(row.employee_id)?.department ?? "",
      type: row.type, startDate: row.start_date, endDate: row.end_date, status: row.status as "menunggu" | "disetujui", mine: row.employee_id === member.id,
    })),
  };
}

/** How many wait, for Admin HR's menu and Ringkasan; null before the migration. */
export async function leaveCount(): Promise<number | null> {
  if (!(await leaveReady())) return null;
  const { count, error } = await createPrivilegedClient().from("pw_leave_requests").select("id", { count: "exact", head: true }).eq("status", "menunggu");
  return error ? null : count ?? 0;
}

/** Admin HR → Cuti & izin: the waiting ones first (oldest first), then the last decided ones. */
export async function adminLeaves(): Promise<AdminLeave[]> {
  if (!(await leaveReady())) throw leaveWaiting();
  const client = createPrivilegedClient();
  const [people, waitingRows, decidedRows] = await Promise.all([
    listPeople(),
    client.from("pw_leave_requests").select(LEAVE_COLUMNS).eq("status", "menunggu").order("created_at").limit(200),
    client.from("pw_leave_requests").select(LEAVE_COLUMNS).neq("status", "menunggu").order("created_at", { ascending: false }).limit(80),
  ]);
  if (waitingRows.error) fail(waitingRows.error);
  if (decidedRows.error) fail(decidedRows.error);
  const byId = new Map(people.map(person => [person.id, person]));
  return ([...(waitingRows.data ?? []), ...(decidedRows.data ?? [])] as LeaveRow[]).map(row => ({
    ...asLeave(row), employeeId: row.employee_id, name: byId.get(row.employee_id)?.fullName ?? "(tidak dikenal)", department: byId.get(row.employee_id)?.department ?? "",
  }));
}

/** Admin HR decides a request; not their own (only the super admin may). */
export async function decideLeave(id: string, decision: { approve: boolean; note: string }, actor: AdminActorRef, now = new Date(), selfAllowed = false): Promise<LeaveRequest> {
  if (!(await leaveReady())) throw leaveWaiting();
  const client = createPrivilegedClient();
  if (!selfAllowed && actor.employeeId) {
    const { data: found } = await client.from("pw_leave_requests").select("employee_id").eq("id", id).maybeSingle();
    if ((found as { employee_id?: string } | null)?.employee_id === actor.employeeId) throw new ServiceError(403, "Pengajuanmu sendiri diputuskan oleh Admin HR lain atau super admin.");
  }
  const { data, error } = await client.from("pw_leave_requests").update({
    status: decision.approve ? "disetujui" : "ditolak", decided_by: actor.employeeId, decided_label: actor.label, decided_at: now.toISOString(), decision_note: decision.note || null,
  }).eq("id", id).eq("status", "menunggu").select(LEAVE_COLUMNS);
  if (error) fail(error);
  const row = (data ?? [])[0] as LeaveRow | undefined;
  if (!row) throw new ServiceError(409, "Pengajuan ini sudah diputuskan atau dibatalkan.");
  return asLeave(row);
}

/** Admin HR withdraws a waiting or an approved request (plans changed): its days leave the calendar and the tables. */
export async function withdrawLeave(id: string, note: string, actor: AdminActorRef, now = new Date()): Promise<LeaveRequest> {
  if (!(await leaveReady())) throw leaveWaiting();
  const { data, error } = await createPrivilegedClient().from("pw_leave_requests").update({
    status: "dibatalkan", decided_by: actor.employeeId, decided_label: actor.label, decided_at: now.toISOString(), decision_note: note ? `Dibatalkan: ${note}`.slice(0, 300) : "Dibatalkan Admin HR",
  }).eq("id", id).in("status", ["menunggu", "disetujui"]).select(LEAVE_COLUMNS);
  if (error) fail(error);
  const row = (data ?? [])[0] as LeaveRow | undefined;
  if (!row) throw new ServiceError(409, "Pengajuan ini sudah ditolak atau dibatalkan.");
  return asLeave(row);
}

// ---------------------------------------------------------------------------------------------
// Admin HR's tables: a day (Absen harian) and a month (Rekap bulanan), as coloured cells

type LightRow = { employee_id: string; work_date: string; kind: DailyKind; at: string; method: "wajah" | "manual"; status: DailyStatus; office_id: string | null; office_name: string | null; reason_kind: ReasonKind | null };
const LIGHT_COLUMNS = "employee_id,work_date,kind,at,method,status,office_id,office_name,reason_kind";

/** Every clock-in between two dates, a thousand rows at a time (a month is more than one page). */
async function recordsBetween(first: string, last: string): Promise<LightRow[]> {
  const client = createPrivilegedClient();
  const rows: LightRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("pw_daily_attendance").select(LIGHT_COLUMNS).gte("work_date", first).lte("work_date", last)
      .order("work_date").order("employee_id").order("kind").range(from, from + 999);
    if (error) databaseError(error);
    rows.push(...((data ?? []) as LightRow[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** The first day anyone clocked in: days before it are not "Tidak absen". */
async function absensiSince(): Promise<string | null> {
  const { data } = await createPrivilegedClient().from("pw_daily_attendance").select("work_date").order("work_date").limit(1);
  return ((data ?? [])[0] as { work_date?: string } | undefined)?.work_date ?? null;
}

/** The cells of everyone between two dates, from the clock-ins, the requests and the late time; and who appears in them. */
async function cellsBetween(first: string, last: string, dates: string[], today: string) {
  const [records, leaves, late, officeList, since] = await Promise.all([recordsBetween(first, last), leavesBetween(first, last), lateAfter(), offices(true), absensiSince()]);
  const zones = new Map(officeList.map(office => [office.id, office.zone]));
  const local = (row: LightRow) => zoneTime(row.at, row.office_id ? zones.get(row.office_id) ?? "WIB" : "WIB");
  const byKey = new Map<string, LightRow>();
  for (const row of records) byKey.set(`${row.employee_id}|${row.work_date}|${row.kind}`, row);
  const asDay = (row: LightRow | undefined) => row ? { status: row.status, reasonKind: row.reason_kind, officeName: row.office_name, method: row.method, local: local(row) } : null;
  const byPerson = new Map<string, LeaveRow[]>();
  for (const leave of leaves) byPerson.set(leave.employee_id, [...(byPerson.get(leave.employee_id) ?? []), leave]);
  const cellsOf = (employeeId: string): Cell[] => dates.map(date => cellOf({
    date, today, lateAfter: late, since,
    masuk: asDay(byKey.get(`${employeeId}|${date}|masuk`)), pulang: asDay(byKey.get(`${employeeId}|${date}|pulang`)),
    leaves: (byPerson.get(employeeId) ?? []).map(leave => ({ type: leave.type, startDate: leave.start_date, endDate: leave.end_date, status: leave.status as "menunggu" | "disetujui" })),
  }));
  const seen = new Set([...records.map(row => row.employee_id), ...leaves.map(leave => leave.employee_id)]);
  return { cellsOf, lateAfter: late, since, seen };
}

/** Absen harian: the day's masuk and pulang, each person's coloured cell, the late time. */
export async function adminDayTable(date: string, today: string): Promise<DayTable> {
  const [day, cells, ready] = await Promise.all([adminDay(date), cellsBetween(date, date, [date], today), leaveReady()]);
  return { ...day, lateAfter: cells.lateAfter, leaveReady: ready, people: day.people.map(person => ({ ...person, cell: cells.cellsOf(person.employeeId)[0] })) };
}

/** Rekap bulanan: everyone who clocks in × every day of the month. */
export async function adminMonth(month: string, today: string): Promise<MonthTable> {
  const { first, last } = monthSpan(month);
  const dates: string[] = [];
  for (let date = first; date <= last; date = daysFrom(date, 1)) dates.push(date);
  const [people, cells, ready, everyone] = await Promise.all([clockers(), cellsBetween(first, last, dates, today), leaveReady(), listPeople()]);
  // Who clocks in now, and anyone with a clock-in or a request that month (who may have left since).
  const now = new Set(people.map(person => person.id));
  const earlier = everyone.filter(person => !now.has(person.id) && cells.seen.has(person.id)).map(person => ({ id: person.id, fullName: person.fullName, department: person.department }));
  return {
    month, today, lateAfter: cells.lateAfter, leaveReady: ready, since: cells.since, dates,
    people: [...people, ...earlier].map(person => ({ employeeId: person.id, name: person.fullName, department: person.department, cells: cells.cellsOf(person.id) })),
  };
}

/** Today in Jakarta, for pages that need a "today" without a person (Admin HR). */
export const jakartaToday = (now = new Date()) => zoneDate(now.toISOString(), asViewerZone("WIB"));

/** Ringkasan: who has an approved cuti, sakit, izin or dinas today and no masuk (they are not "Belum absen"). */
export async function awayToday(date: string): Promise<Set<string>> {
  if (!(await leaveReady())) return new Set();
  const [leaves, masuk] = await Promise.all([
    leavesBetween(date, date),
    createPrivilegedClient().from("pw_daily_attendance").select("employee_id").eq("work_date", date).eq("kind", "masuk"),
  ]);
  const came = new Set(((masuk.data ?? []) as { employee_id: string }[]).map(row => row.employee_id));
  return new Set(leaves.filter(leave => leave.status === "disetujui" && !came.has(leave.employee_id)).map(leave => leave.employee_id));
}
