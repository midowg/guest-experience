import "server-only";
import { sampleOnlyFor } from "@/lib/main-wam/demo";
import { isSampleId } from "@/lib/main-wam/demo-sample";
import { mayRecord, pickAttendanceSession, sessionChoice, windowCaption, type AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import { shortDate } from "@/lib/main-wam/panitia/format";
import { timeRange, wibDate } from "@/lib/main-wam/rundown";
import type { MainWamViewer, MwSession } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { demoAttendanceSessions, demoAttendeeRows } from "../demo-panitia";
import { demoRundown } from "../demo";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAttendees, mainWamPeople } from "../people";
import { allSessions, attendanceOf, sessionById } from "../read";
import { db } from "./common";
import { waitingUpdate } from "./rundown";

/*
 * Absen manual (K05): who is expected at a session that takes attendance (mainWamAttendees: every
 * active WAM account but BOD, the one count of audit R5), who is present and how (Scan QR, Dicatat panitia), and "Catat hadir" with its undo. The
 * same rule as Pra WAM's (src/lib/server/pra-wam/attendance.ts setPresent): one row per person per
 * session, manual names who recorded it, a second "Catat hadir" keeps the first record. Its undo
 * removes only a record panitia made: a QR scan is the person's own and stays (audit L8).
 */

export type AttendanceSessionOption = { id: string; title: string; time: string; day: string; required: boolean };
export type AttendanceData = {
  migrated: boolean;
  sessions: AttendanceSessionOption[];
  session: { id: string; title: string; label: string; caption: string; canRecord: boolean } | null;
  rows: AttendeeRow[];
  now: string;
};

/** The sessions that take attendance: published, marked "pakai absen", in order. */
async function attendanceSessions(sample = false): Promise<{ data: MwSession[]; migrated: boolean }> {
  if (sample) return { data: demoAttendanceSessions(), migrated: true };
  const { data, migrated } = await allSessions();
  return { data: data.filter(session => session.status === "terbit" && session.usesAttendance), migrated };
}

/** Everyone expected at a session, with their check-in (one query for the session's rows). */
export async function sessionRows(sessionId: string): Promise<{ rows: AttendeeRow[]; migrated: boolean }> {
  // Mode demo: a sample session (only the sample's rundown has such ids) lists the sample's people.
  if (isSampleId(sessionId) && await demoRundown()) return { rows: demoAttendeeRows(sessionId), migrated: true };
  const [expected, people, present] = await Promise.all([mainWamAttendees(), mainWamPeople(), attendanceOf({ sessionId })]);
  const byPerson = new Map(present.data.map(row => [row.employeeId, row]));
  // Someone recorded who is not (or no longer) on the list still counts as present.
  const ids = [...new Set([...expected, ...present.data.map(row => row.employeeId)])];
  const rows = ids.flatMap(id => {
    const person = people.get(id);
    if (!person) return [];
    const check = byPerson.get(id);
    return [{ id, name: person.name, department: person.department, photo: person.photo ?? null, checkedInAt: check?.checkedInAt ?? null, method: check?.method ?? null }];
  });
  return { rows, migrated: present.migrated };
}

/** What Absen sesi shows: the session list, the chosen session, and its people. */
export async function attendanceData(asked: string | undefined, now = new Date(), viewer?: Pick<MainWamViewer, "demo">): Promise<AttendanceData> {
  // Mode demo: drawn as panitia without being panitia, the names of real people are not theirs to read: the sample's.
  const sample = !!viewer && sampleOnlyFor(viewer, "kelola");
  const { data: sessions, migrated } = await attendanceSessions(sample);
  const chosen = pickAttendanceSession(sessions, now, asked);
  const options = sessions.map(session => ({ id: session.id, title: session.title, time: timeRange(session), day: shortDate(wibDate(session.startsAt)), required: session.required }));
  if (!chosen) return { migrated, sessions: options, session: null, rows: [], now: now.toISOString() };
  const { rows, migrated: rowsMigrated } = sample ? { rows: demoAttendeeRows(chosen.id), migrated: true } : await sessionRows(chosen.id);
  return {
    migrated: migrated && rowsMigrated, sessions: options, rows, now: now.toISOString(),
    session: { id: chosen.id, title: chosen.title, label: sessionChoice(chosen), caption: windowCaption(chosen, now), canRecord: mayRecord(chosen, now) },
  };
}

/**
 * Catat hadir (present) or its undo (not present), by a panitia. Before the window opens it is
 * refused (a mistake on a session that has not started); after it closes it is a correction. The
 * undo deletes only a manual record; a QR scan is refused with 409 (nothing to log, nothing removed).
 */
export async function setAttendance(context: MainWamContext, sessionId: string, employeeId: string, present: boolean, now = new Date()): Promise<{ rows: AttendeeRow[] }> {
  const session = await sessionById(sessionId);
  if (!session || session.status !== "terbit" || !session.usesAttendance) throw new ServiceError(404, "Sesi ini tidak memakai absen.");
  if (present && !mayRecord(session, now)) throw new ServiceError(409, "Absen sesi ini belum dibuka.");
  const person = (await mainWamPeople()).get(employeeId);
  if (!person) throw new ServiceError(422, "Orang ini tidak dikenal. Muat ulang halaman.");
  const client = db();
  if (present) {
    const { error } = await client.from("mw_attendance")
      .upsert({ session_id: sessionId, employee_id: employeeId, method: "manual", recorded_by: context.viewer.id, checked_in_at: now.toISOString() }, { onConflict: "session_id,employee_id", ignoreDuplicates: true });
    if (error) { if (mwMissing(error)) throw waitingUpdate(); if (error.code === "23503") throw new ServiceError(422, "Orang ini tidak dikenal. Muat ulang halaman."); databaseError(error); }
  } else {
    // In one statement: a QR row is never touched, even when it came in after the screen was drawn.
    const { data: removed, error } = await client.from("mw_attendance").delete().eq("session_id", sessionId).eq("employee_id", employeeId).eq("method", "manual").select("employee_id");
    if (error) { if (mwMissing(error)) throw waitingUpdate(); databaseError(error); }
    if (!removed?.length) {
      const { data: scanned, error: readError } = await client.from("mw_attendance").select("method").eq("session_id", sessionId).eq("employee_id", employeeId).maybeSingle();
      if (readError) databaseError(readError);
      if (scanned?.method === "qr") throw new ServiceError(409, `${person.name} absen lewat scan QR. Absen ini tidak bisa dibatalkan panitia.`);
    }
  }
  return { rows: (await sessionRows(sessionId)).rows };
}
