import "server-only";
import { randomBytes } from "node:crypto";
import { mainWamCan } from "@/lib/main-wam/access";
import { acceptedScanTime, isQrToken, windowOutcome, type CheckInOutcome } from "@/lib/main-wam/modul/absen";
import { SESSION_COLUMNS, sessionFromRow } from "@/lib/main-wam/rows";
import { byStart, checkInState, checkInWindow, sessionEnd, wibTime } from "@/lib/main-wam/rundown";
import type { MainWamViewer, MwSession } from "@/lib/main-wam/types";
import { newQrToken } from "@/lib/pra-wam/attendance";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { sessionQrPdf } from "../../pra-wam/qr-pdf";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing } from "../errors";
import { allSessions, attendanceOf } from "../read";

/*
 * Absen QR (A01–A04, aturan-wam §7) on Main WAM's own rundown (mw_sessions, mw_attendance), with
 * Pra WAM's pieces reused: the QR token (newQrToken), the printed A5 sheet (sessionQrPdf) and the
 * window (30 minutes either side, fondasi checkInWindow). Nothing here touches pw_sessions.
 * The window holds by the server's clock; a scan queued offline keeps its own time within limits
 * (acceptedScanTime). One row per person per session, so a second scan answers "sudah".
 */

const db = () => createPrivilegedClient();
const named = (session: MwSession) => ({ id: session.id, title: session.title, place: session.place });

/** The session a QR holds (any status), or null. */
export async function sessionByQr(token: string): Promise<MwSession | null> {
  if (!isQrToken(token)) return null;
  const { data, error } = await db().from("mw_sessions").select(SESSION_COLUMNS).eq("qr_token", token).maybeSingle();
  if (error) { if (mwMissing(error)) return null; databaseError(error); }
  return data ? sessionFromRow(data as Record<string, unknown>) : null;
}

/** When this person checked in to this session, or null. */
export async function myCheckIn(sessionId: string, employeeId: string): Promise<string | null> {
  const { data, error } = await db().from("mw_attendance").select("checked_in_at").eq("session_id", sessionId).eq("employee_id", employeeId).maybeSingle();
  if (error) { if (mwMissing(error)) return null; databaseError(error); }
  return (data as { checked_in_at: string } | null)?.checked_in_at ?? null;
}

/** A scan of a session's QR: records the check-in while the window is open, else says why not. */
export async function checkInWithQr(token: string, viewer: Pick<MainWamViewer, "id" | "roles">, options: { now: Date; scannedAt?: string | null }): Promise<CheckInOutcome> {
  if (!mainWamCan(viewer, "absen")) return { kind: "bod" };
  const session = await sessionByQr(token);
  if (!session) return { kind: "tidak-dikenal" };
  if (session.status !== "terbit" || !session.usesAttendance) return { kind: "tanpa-absen", session: named(session) };
  const existing = await myCheckIn(session.id, viewer.id);
  if (existing) return { kind: "sudah", session: named(session), checkedInAt: existing };
  const at = acceptedScanTime(options.scannedAt, options.now);
  const refused = windowOutcome(session, at);
  if (refused) return refused;
  const { data, error } = await db().from("mw_attendance")
    .upsert({ session_id: session.id, employee_id: viewer.id, method: "qr", checked_in_at: at.toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true })
    .select("checked_in_at");
  if (error) mwFail(error);
  const saved = (data ?? []) as { checked_in_at: string }[];
  if (!saved.length) return { kind: "sudah", session: named(session), checkedInAt: (await myCheckIn(session.id, viewer.id)) ?? at.toISOString() };
  return { kind: "tercatat", session: named(session), checkedInAt: saved[0].checked_in_at };
}

/** "Hadir 96 dari 120" (BOD in Detail sesi): present, and everyone who checks in (active accounts, not BOD). */
export async function presentCount(sessionId: string): Promise<{ present: number; expected: number } | null> {
  const [present, accounts, bod] = await Promise.all([
    db().from("mw_attendance").select("employee_id", { count: "exact", head: true }).eq("session_id", sessionId),
    db().from("pw_accounts").select("employee_id,employees!inner(active)", { count: "exact", head: true }).eq("active", true).eq("employees.active", true),
    db().from("pw_roles").select("employee_id", { count: "exact", head: true }).eq("role", "bod"),
  ]);
  if (present.error || accounts.error) return null;
  return { present: present.count ?? 0, expected: Math.max(0, (accounts.count ?? 0) - (bod.error ? 0 : bod.count ?? 0)) };
}

/** A session's QR token, made the first time panitia asks for it; `renew` replaces it (printed sheets stop working). */
export async function sessionQrToken(sessionId: string, renew = false): Promise<{ token: string; session: MwSession }> {
  const { data, error } = await db().from("mw_sessions").select(`${SESSION_COLUMNS},qr_token`).eq("id", sessionId).maybeSingle();
  if (error) mwFail(error);
  if (!data) throw new ServiceError(404, "Sesi tidak ditemukan.");
  const row = data as Record<string, unknown> & { qr_token: string | null };
  const session = sessionFromRow(row);
  if (!session.usesAttendance) throw new ServiceError(409, "Sesi ini tidak memakai absen. Tandai pakai absen di Admin WAM → Rundown.");
  if (row.qr_token && !renew) return { token: row.qr_token, session };
  const token = newQrToken(size => randomBytes(size));
  const { error: saveError } = await db().from("mw_sessions").update({ qr_token: token, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (saveError) mwFail(saveError);
  return { token, session };
}

/** The A5 sheet to print or show on a screen (Pra WAM's layout), holding the check-in address. */
export function sessionQrSheet(session: MwSession, url: string): Promise<Uint8Array> {
  return sessionQrPdf({ title: session.title, startsAt: session.startsAt, endsAt: sessionEnd(session), planFrom: null, planTo: null, roomName: null, location: session.place }, url);
}

/**
 * A01's card: the session whose absen is open now and that this person has not checked in to yet
 * (a real session before a meal), with when it closes. Null when there is none.
 */
export async function openForMe(employeeId: string, now: Date): Promise<{ session: MwSession; until: string } | null> {
  const [sessions, mine] = await Promise.all([allSessions(), attendanceOf({ employeeId })]);
  const done = new Set(mine.data.map(row => row.sessionId));
  const open = sessions.data.filter(session => session.status === "terbit" && session.usesAttendance && !done.has(session.id) && checkInState(session, now) === "buka").sort(byStart);
  const session = open.find(item => item.kind !== "makan") ?? open[0];
  return session ? { session, until: wibTime(checkInWindow(session).closes).replace(":", ".") } : null;
}
