import "server-only";
import { randomBytes } from "node:crypto";
import { checkInWindow, newQrToken, windowState, type AttendanceRow, type CheckInResult } from "@/lib/pra-wam/attendance";
import { managesSessions, seesAllSessions } from "@/lib/pra-wam/roles";
import type { Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import type { Member } from "./session";
import { getSession } from "./sessions";

/*
 * Attendance (migration 202611040005). Scanning a session's printed QR signs the person in while
 * the window is open; panitia can correct by hand. One row per person per session, so a second
 * scan only answers "sudah tercatat".
 */

const MIGRATION = "202611040005_pra_wam_attendance.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_attendance|qr_token/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Absen menunggu migrasi ${MIGRATION}.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

function requireManager(viewer: Member) {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa mengatur absen.");
}

/** The session's QR token, made the first time panitia opens it. */
export async function qrToken(sessionId: string, viewer: Member, renew = false): Promise<string> {
  requireManager(viewer);
  await getSession(sessionId, viewer);
  const client = createPrivilegedClient();
  if (!renew) {
    const { data, error } = await client.from("pw_sessions").select("qr_token").eq("id", sessionId).single();
    if (error) fail(error);
    if (data.qr_token) return data.qr_token;
  }
  const token = newQrToken(size => randomBytes(size));
  const { error } = await client.from("pw_sessions").update({ qr_token: token, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) fail(error);
  return token;
}

/** A scan: who scanned, which session, and whether the window is open. */
export async function checkIn(token: string, member: Member, now = new Date()): Promise<{ result: CheckInResult; session: Pick<Session, "id" | "title"> | null }> {
  const client = createPrivilegedClient();
  const { data: session, error } = await client.from("pw_sessions").select("id,title,status,starts_at,ends_at").eq("qr_token", token).maybeSingle();
  if (error) fail(error);
  if (!session) return { result: { kind: "tidak-dikenal" }, session: null };
  const named = { id: session.id as string, title: session.title as string };
  if (session.status !== "terbit" || !session.starts_at || !session.ends_at) return { result: { kind: "belum-terbit" }, session: named };
  const { data: participant, error: participantError } = await client.from("pw_session_participants").select("employee_id").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (participantError) fail(participantError);
  if (!participant) return { result: { kind: "bukan-peserta" }, session: named };
  const { data: existing, error: existingError } = await client.from("pw_attendance").select("checked_in_at").eq("session_id", session.id).eq("employee_id", member.id).maybeSingle();
  if (existingError) fail(existingError);
  if (existing) return { result: { kind: "sudah", checkedInAt: existing.checked_in_at }, session: named };
  const window = checkInWindow(session.starts_at, session.ends_at);
  const state = windowState(window, now);
  if (state !== "buka") return { result: { kind: state, window }, session: named };
  const { data: saved, error: saveError } = await client.from("pw_attendance")
    .upsert({ session_id: session.id, employee_id: member.id, method: "qr", checked_in_at: now.toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
    .select("checked_in_at");
  if (saveError) fail(saveError);
  return { result: { kind: saved?.length ? "tercatat" : "sudah", checkedInAt: saved?.[0]?.checked_in_at ?? now.toISOString() }, session: named };
}

/** The person's own check-in for a session, for its page. */
export async function myCheckIn(sessionId: string, member: Member): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("checked_in_at").eq("session_id", sessionId).eq("employee_id", member.id).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  return data?.checked_in_at ?? null;
}

/** Every participant with their check-in (panitia and BOD). */
export async function attendance(sessionId: string, viewer: Member): Promise<AttendanceRow[]> {
  if (!seesAllSessions(viewer)) throw new ServiceError(403, "Hanya panitia dan BOD yang bisa melihat daftar hadir.");
  const session = await getSession(sessionId, viewer);
  const { data, error } = await createPrivilegedClient().from("pw_attendance").select("employee_id,checked_in_at,method").eq("session_id", sessionId);
  if (error) fail(error);
  const people = await listPeople();
  const rows = (session.participants ?? []).map(person => {
    const present = data?.find(row => row.employee_id === person.id);
    return { employeeId: person.id, name: person.name, department: person.department, checkedInAt: present?.checked_in_at ?? null, method: (present?.method as AttendanceRow["method"]) ?? null };
  });
  // Someone marked present by hand who is not (or no longer) on the list still counts.
  for (const row of data ?? []) {
    if (rows.some(item => item.employeeId === row.employee_id)) continue;
    const person = people.find(item => item.id === row.employee_id);
    rows.push({ employeeId: row.employee_id, name: person?.name ?? "Tanpa nama", department: person?.department ?? "", checkedInAt: row.checked_in_at, method: row.method });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Panitia corrects by hand: present (recorded as manual, by whom) or not present. */
export async function setPresent(sessionId: string, employeeId: string, present: boolean, viewer: Member): Promise<AttendanceRow[]> {
  requireManager(viewer);
  await getSession(sessionId, viewer);
  const client = createPrivilegedClient();
  const { error } = present
    ? await client.from("pw_attendance").upsert({ session_id: sessionId, employee_id: employeeId, method: "manual", recorded_by: viewer.id, checked_in_at: new Date().toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
    : await client.from("pw_attendance").delete().eq("session_id", sessionId).eq("employee_id", employeeId);
  if (error) { if (error.code === "23503") throw new ServiceError(422, "Orang ini tidak dikenal. Muat ulang halaman."); fail(error); }
  return attendance(sessionId, viewer);
}
