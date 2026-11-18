import "server-only";
import { randomBytes } from "node:crypto";
import { mainWamCan } from "@/lib/main-wam/access";
import { demoAttendeeIds, isSampleId, samplePresence } from "@/lib/main-wam/demo-sample";
import { acceptedScanTime, isQrToken, windowOutcome, type CheckInOutcome } from "@/lib/main-wam/modul/absen";
import { SESSION_COLUMNS, sessionFromRow } from "@/lib/main-wam/rows";
import { byStart, checkInState, checkInWindow, sessionEnd, wibTime } from "@/lib/main-wam/rundown";
import type { MainWamViewer, MwSession } from "@/lib/main-wam/types";
import { newQrToken } from "@/lib/pra-wam/attendance";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { sessionQrPdf } from "../../pra-wam/qr-pdf";
import { createPrivilegedClient } from "../../supabase/admin";
import { demoRundown } from "../demo";
import { mwFail, mwMissing } from "../errors";
import { mainWamAttendees } from "../people";
import { allSessions, attendanceOf } from "../read";

/*
 * Absen QR (A01–A04, aturan-wam §7) on Main WAM's own rundown (mw_sessions, mw_attendance), with
 * Pra WAM's pieces reused: the QR token (newQrToken), the printed A5 sheet (sessionQrPdf) and the
 * window (30 minutes either side, fondasi checkInWindow). Nothing here touches pw_sessions.
 * The window holds by the server's clock; a scan queued offline keeps its own time only inside the
 * window and at most 30 minutes old (acceptedScanTime, audit M5). One row per person per session, so
 * a second scan answers "sudah".
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
  const at = acceptedScanTime(options.scannedAt, options.now, session);
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

/**
 * "Hadir 96 dari 120" (BOD in Detail sesi): of the people of the event (mainWamAttendees, audit R5:
 * active WAM accounts, not BOD), how many checked in. Null when it cannot be read.
 */
export async function presentCount(sessionId: string): Promise<{ present: number; expected: number } | null> {
  // Mode demo: a sample session (only the sample's rundown has such ids) counts the sample's people.
  if (isSampleId(sessionId) && await demoRundown()) return { present: samplePresence(sessionId).length, expected: demoAttendeeIds().length };
  const [present, attendees] = await Promise.all([
    db().from("mw_attendance").select("employee_id").eq("session_id", sessionId).limit(5000),
    mainWamAttendees().catch(() => null),
  ]);
  if (present.error || !attendees) return null;
  const everyone = new Set(attendees);
  return { present: ((present.data ?? []) as { employee_id: string }[]).filter(row => everyone.has(row.employee_id)).length, expected: everyone.size };
}

/**
 * A session's QR token (made by Admin WAM when the session is saved with "pakai absen", R15). Reading
 * it writes nothing: without one, panitia are told to save the session again. `renew` replaces it
 * (printed sheets stop working; POST only).
 */
export async function sessionQrToken(sessionId: string, renew = false): Promise<{ token: string; session: MwSession }> {
  const { data, error } = await db().from("mw_sessions").select(`${SESSION_COLUMNS},qr_token`).eq("id", sessionId).maybeSingle();
  if (error) mwFail(error);
  if (!data) throw new ServiceError(404, "Sesi tidak ditemukan.");
  const row = data as Record<string, unknown> & { qr_token: string | null };
  const session = sessionFromRow(row);
  if (!session.usesAttendance) throw new ServiceError(409, "Sesi ini tidak memakai absen. Tandai pakai absen di Admin WAM → Rundown.");
  if (!renew) {
    if (!row.qr_token) throw new ServiceError(409, "QR belum dibuat. Simpan ulang sesi dengan Pakai absen di Admin WAM → Rundown.");
    return { token: row.qr_token, session };
  }
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
