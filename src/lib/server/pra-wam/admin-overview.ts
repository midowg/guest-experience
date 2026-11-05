import "server-only";
import { wibDate, wibTime, type Room } from "@/lib/pra-wam/appraisal";
import type { RoomUse } from "@/lib/pra-wam/sessions";
import { isR2Configured, presignDownload } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listRooms } from "./appraisal";
import type { ResetRequestRow } from "./reset-requests";
import { roomUses } from "./sessions";
import { listUnits } from "./units";

/*
 * Read-only numbers for Admin WAM (Ringkasan, Akun dan peran) that the app's own helpers do not
 * give in one piece: today's room schedule as timeline rows, how many finished the questionnaire,
 * and each account's photo and job title. Every reader answers null (or empty) instead of failing,
 * so a missing migration or storage only hides its part of the page.
 */

/* ---- Today's schedule -------------------------------------------------------------------------- */

export type ScheduleBlock = { key: string; title: string; sub: string; start: number; end: number; kind: "booking" | "sesi" };
export type ScheduleRow = { key: string; label: string; sub?: string; blocks: ScheduleBlock[] };

/** "10:30" → 10.5. */
export const decimalHours = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;

/**
 * One row per bookable room (and per other room that is in use today), each with today's bookings
 * and Pra WAM sessions as blocks in decimal hours.
 */
export function scheduleRows(rooms: readonly Room[], uses: readonly RoomUse[], date: string): ScheduleRow[] {
  const used = new Set(uses.map(use => use.roomId));
  return rooms.filter(room => room.bookable || used.has(room.id)).map(room => ({
    key: room.id,
    label: room.name,
    sub: room.capacity != null ? `${room.capacity} orang` : undefined,
    blocks: uses.filter(use => use.roomId === room.id).map(use => {
      // A hold from yesterday or into tomorrow is cut at the day's edges.
      const start = wibDate(use.startsAt) < date ? 0 : decimalHours(wibTime(use.startsAt));
      const end = wibDate(use.endsAt) > date ? 24 : decimalHours(wibTime(use.endsAt));
      return {
        key: `${use.source}:${use.sourceId}`, title: use.label, kind: use.source,
        sub: `${wibTime(use.startsAt).replace(":", ".")}–${wibTime(use.endsAt).replace(":", ".")}`,
        start, end,
      };
    }).sort((a, b) => a.start - b.start),
  }));
}

/** The hours the timeline spans: 09–18 (the booking day), widened to whole hours around any block outside it. */
export function scheduleSpan(rows: readonly ScheduleRow[], from = 9, to = 18): { from: number; to: number } {
  const blocks = rows.flatMap(row => row.blocks);
  if (!blocks.length) return { from, to };
  return {
    from: Math.max(0, Math.min(from, Math.floor(Math.min(...blocks.map(block => block.start))))),
    to: Math.min(24, Math.max(to, Math.ceil(Math.max(...blocks.map(block => block.end))))),
  };
}

/** Today's rows, or null when rooms or holds cannot be read (before their migrations). */
export async function todaySchedule(date: string): Promise<ScheduleRow[] | null> {
  try {
    const [rooms, uses] = await Promise.all([listRooms(), roomUses(date)]);
    return scheduleRows(rooms, uses, date);
  } catch {
    return null;
  }
}

/* ---- The date line ---------------------------------------------------------------------------- */

const longDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-11-05" → "Kamis, 5 November 2026". */
export const longDateLabel = (date: string) => longDate.format(new Date(`${date}T12:00:00Z`));

/**
 * The Ringkasan's subtitle: the date, then which day of Pra WAM (or WAM) it is and how far WAM is,
 * e.g. "Kamis, 5 November 2026 · Pra WAM hari ke-9 · WAM 60 hari lagi".
 */
export function dayLine(today: string, phase: { kind: "pra_wam" | "wam"; name: string; startDate: string; daysToWam: number | null } | null): string {
  const parts = [longDateLabel(today)];
  if (phase && phase.startDate <= today) {
    const day = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${phase.startDate}T00:00:00Z`)) / 86_400_000) + 1;
    parts.push(`${phase.name} hari ke-${day}`);
  }
  if (phase?.daysToWam) parts.push(`WAM ${phase.daysToWam} hari lagi`);
  return parts.join(" · ");
}

/* ---- Questionnaire ----------------------------------------------------------------------------- */

/**
 * How many people finished the questionnaire (completed_at is kept in step with their answers)
 * and how many started it; two counted reads, not the whole progress report. Null before the
 * questionnaire exists.
 */
export async function questionnaireCounts(): Promise<{ done: number; started: number } | null> {
  try {
    const client = createPrivilegedClient();
    const { data: form, error } = await client.from("cq_forms").select("id").order("created_at").limit(1).maybeSingle();
    if (error || !form) return null;
    const id = (form as { id: string }).id;
    const [done, started] = await Promise.all([
      client.from("cq_progress").select("employee_id", { count: "exact", head: true }).eq("form_id", id).not("completed_at", "is", null),
      client.from("cq_progress").select("employee_id", { count: "exact", head: true }).eq("form_id", id),
    ]);
    if (done.error || started.error) return null;
    return { done: done.count ?? 0, started: started.count ?? 0 };
  } catch {
    return null;
  }
}

/* ---- Photos and job titles --------------------------------------------------------------------- */

/** How long a photo address given to the admin page lasts; the page is read again on every visit. */
const PHOTO_SECONDS = 60 * 60;

/**
 * Per employee id: a short-lived address of their profile photo (the app's photo route needs a WAM
 * sign-in, which an admin may not have) and the job title of their main unit. Empty maps when
 * storage, the photo columns or the units are not there yet.
 */
export async function accountExtras(): Promise<{ photos: Record<string, string>; jobs: Record<string, string> }> {
  const photos: Record<string, string> = {};
  const jobs: Record<string, string> = {};
  const [units, keys] = await Promise.all([
    listUnits().catch(() => null),
    isR2Configured()
      ? createPrivilegedClient().from("pw_accounts").select("employee_id,photo_key,active").not("photo_key", "is", null).then(
        // Before the photo migration (or on any error): no photos, initials instead.
        result => result.error ? [] : (result.data ?? []) as { employee_id: string; photo_key: string | null; active: boolean }[],
        () => [])
      : Promise.resolve([]),
  ]);
  for (const member of units?.memberships ?? []) {
    if (!member.jobTitle) continue;
    if (member.isPrimary || !jobs[member.employeeId]) jobs[member.employeeId] = member.jobTitle;
  }
  await Promise.all(keys.filter(row => row.active && row.photo_key).map(async row => {
    try { photos[row.employee_id] = await presignDownload(row.photo_key!, { seconds: PHOTO_SECONDS }); }
    catch { /* no photo: initials instead */ }
  }));
  return { photos, jobs };
}

/* ---- Reset requests ---------------------------------------------------------------------------- */

/** Employee ids with an open "Lupa password" request, for the "Reset diminta" pill; empty before the migration. */
export async function openResetEmployeeIds(): Promise<string[]> {
  try {
    const { data, error } = await createPrivilegedClient().from("pw_reset_requests").select("employee_id").eq("status", "menunggu").not("employee_id", "is", null).limit(500);
    if (error) return [];
    return [...new Set((data ?? []).map(row => row.employee_id as string))];
  } catch {
    return [];
  }
}

/** How far back "Selesai" on Permintaan reset reaches. */
export const RESET_HISTORY_DAYS = 30;

/**
 * The requests handled in the last `days` days, newest first (at most 200), shaped as
 * listResetRequests shapes them; empty before the migration or on an error.
 */
export async function resetHistory(days = RESET_HISTORY_DAYS, now = new Date()): Promise<ResetRequestRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  try {
    const { data, error } = await createPrivilegedClient().from("pw_reset_requests")
      .select("id,employee_id,email,note,status,handled_by,handled_at,created_at,employees(full_name,department)")
      .neq("status", "menunggu").gte("handled_at", since).order("handled_at", { ascending: false }).limit(200);
    if (error) return [];
    type Raw = { id: string; employee_id: string | null; email: string; note: string; status: ResetRequestRow["status"]; handled_by: string | null; handled_at: string | null; created_at: string; employees: { full_name: string; department: string } | null };
    return ((data ?? []) as unknown as Raw[]).map(row => ({
      id: row.id, employeeId: row.employee_id, name: row.employees?.full_name ?? null, department: row.employees?.department ?? null,
      email: row.email, note: row.note, status: row.status, handledBy: row.handled_by, handledAt: row.handled_at, createdAt: row.created_at,
      hasAccount: true,
    }));
  } catch {
    return [];
  }
}
