import "server-only";
import { FACE_MODEL_VERSION, isEmbedding } from "@/lib/hr/face-match";
import { sampleOnlyFor } from "@/lib/main-wam/demo";
import { acceptedScanTime, windowOutcome } from "@/lib/main-wam/modul/absen";
import { pickAttendanceSession } from "@/lib/main-wam/panitia/attendance";
import {
  matchFaces, TABLET_FACE_STATUSES, type GalleryEntry, type TabletAnswer, type TabletData, type TabletFaceAnswer, type TabletPerson, type TabletRequest, type TabletRole,
} from "@/lib/main-wam/panitia/face-tablet";
import { shortDate } from "@/lib/main-wam/panitia/format";
import { checkInWindow, timeRange, wibDate } from "@/lib/main-wam/rundown";
import type { MainWamViewer, MwSession } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { demoAttendanceSessions, demoAttendeeRows } from "../demo-panitia";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamEventPeople, mainWamPeople } from "../people";
import { allSessions, sessionById } from "../read";
import { presentCount } from "../modul/absen";
import { db } from "./common";
import { sessionRows } from "./attendance";
import { waitingUpdate } from "./rundown";

/*
 * Absen mode tablet, the server's side (docs/main-wam/KONTRAK.md §9 #39). The tablet sends the
 * numbers of the faces in view (SFace's 128 numbers; a picture never arrives), and this finds who
 * each one is among the people of the event who have an enrolled face in WG People (pw_face_profiles,
 * the same table WG People clocks in with; the reference numbers are read here and never leave the
 * server), by the stricter one-to-many rule (src/lib/main-wam/panitia/face-tablet.ts). Someone named
 * is recorded as present through the same table as the manual check-in (mw_attendance): the person
 * recorded is who the face says, `recorded_by` is the panitia whose tablet it is, and the row says
 * method "manual" (its check allows only qr or manual; a face needs no new value, and panitia can
 * take a wrong one back with Batalkan hadir in Absen sesi). One row per person per session: a second
 * time answers "sudah" and writes nothing. BOD are named, never recorded (they do not check in).
 * Nothing about a face is logged and no numbers from the tablet are stored.
 */

type ProfileRow = { employee_id: string; embedding: unknown; model_version: string | null; status: string };

/** The enrolled faces that can be compared: status in use, the model of this app, the numbers well formed. Paged: the table is small, the whole of it is read once. */
async function profiles(columns: string): Promise<ProfileRow[]> {
  const out: ProfileRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("pw_face_profiles").select(columns).in("status", [...TABLET_FACE_STATUSES]).order("employee_id").range(from, from + 999);
    if (error) {
      // WG People's tables are not there yet: nobody has a face to compare with.
      if (["42P01", "PGRST205"].includes(error.code ?? "")) return [];
      databaseError(error);
    }
    out.push(...((data ?? []) as unknown as ProfileRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out.filter(row => row.model_version === FACE_MODEL_VERSION);
}

/** The reference numbers of the people of the event. They stay in this function's callers and never go out. */
async function galleryOf(people: ReadonlySet<string>): Promise<GalleryEntry[]> {
  const rows = await profiles("employee_id,embedding,model_version,status");
  return rows.filter(row => people.has(row.employee_id) && isEmbedding(row.embedding)).map(row => ({ employeeId: row.employee_id, embedding: row.embedding as number[] }));
}

/** How many of these people have a face that can be found (no numbers read). */
async function enrolledAmong(people: Iterable<string>): Promise<number> {
  const wanted = new Set(people);
  return (await profiles("employee_id,model_version,status")).filter(row => wanted.has(row.employee_id)).length;
}

/** The page: sessions that take attendance with their windows, the first one's people, and how many faces can be found. */
export async function tabletData(asked: string | undefined, now: Date, viewer: Pick<MainWamViewer, "demo">): Promise<TabletData> {
  const sample = sampleOnlyFor(viewer, "kelola");
  const { data, migrated } = sample ? { data: demoAttendanceSessions(now), migrated: true } : await allSessions();
  const sessions = data.filter(session => session.status === "terbit" && session.usesAttendance).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const options = sessions.map(session => ({
    id: session.id, title: session.title, time: timeRange(session), day: shortDate(wibDate(session.startsAt)), required: session.required, ...checkInWindow(session),
  }));
  // The one open now (running first), else the next, else the last: the same choice as Absen sesi.
  const chosen = pickAttendanceSession(sessions, now, asked);
  if (!chosen) return { migrated, sessions: options, sessionId: null, rows: [], enrolled: 0, now: now.toISOString() };
  if (sample) {
    const rows = demoAttendeeRows(chosen.id);
    return { migrated, sessions: options, sessionId: chosen.id, rows, enrolled: Math.floor(rows.length * 0.8), now: now.toISOString() };
  }
  const [{ rows, migrated: rowsMigrated }, enrolled] = await Promise.all([sessionRows(chosen.id), enrolledAmong((await mainWamEventPeople()).accounts)]);
  return { migrated: migrated && rowsMigrated, sessions: options, sessionId: chosen.id, rows, enrolled, now: now.toISOString() };
}

/** Who already checked in to this session among these people, with when. */
async function presentAmong(sessionId: string, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("mw_attendance").select("employee_id,checked_in_at").eq("session_id", sessionId).in("employee_id", [...ids]);
  if (error) { if (mwMissing(error)) throw waitingUpdate(); databaseError(error); }
  return new Map(((data ?? []) as { employee_id: string; checked_in_at: string }[]).map(row => [row.employee_id, row.checked_in_at]));
}

/** The session as the tablet may use it: published and taking attendance (404 otherwise: a tool for a session that has none does not exist). */
async function attendanceSession(sessionId: string): Promise<MwSession> {
  const session = await sessionById(sessionId);
  if (!session || session.status !== "terbit" || !session.usesAttendance) throw new ServiceError(404, "Sesi ini tidak memakai absen.");
  return session;
}

/**
 * The faces of one request: who each is, and the check-in of everyone named (outside the window
 * nothing is looked up and nothing is written). A face with `seenAt` was queued offline: it counts
 * at that time only inside the window and when it is at most 30 minutes old (acceptedScanTime, the
 * rule of a queued QR scan), else at the server's time.
 */
export async function identifyFaces(context: MainWamContext, input: TabletRequest, now = new Date()): Promise<TabletAnswer> {
  const session = await attendanceSession(input.sessionId);
  const window = checkInWindow(session);
  const times = input.faces.map(face => acceptedScanTime(face.seenAt, now, session));
  const refused = times.map(at => windowOutcome(session, at));

  const answers: (TabletFaceAnswer | null)[] = refused.map(outcome => outcome && (outcome.kind === "belum" || outcome.kind === "tutup")
    ? { kind: "di-luar-jam", window: outcome.kind, opens: window.opens, closes: window.closes } : null);
  const open = answers.flatMap((answer, index) => (answer ? [] : [index]));

  if (open.length) {
    const event = await mainWamEventPeople();
    const everyone = new Set(event.accounts);
    const gallery = await galleryOf(everyone);
    if (!gallery.length) {
      for (const index of open) answers[index] = { kind: "belum-terdaftar" };
    } else {
      const verdicts = matchFaces(open.map(index => input.faces[index].embedding), gallery);
      const named = verdicts.flatMap(verdict => (verdict.kind === "dikenali" ? [verdict.employeeId] : []));
      const [people, before] = await Promise.all([mainWamPeople(), presentAmong(session.id, named)]);
      const roleOf = (id: string): TabletRole => (event.bod.has(id) ? "bod" : event.panitia.has(id) ? "panitia" : "peserta");
      const personOf = (id: string): TabletPerson => {
        const found = people.get(id);
        return { employeeId: id, name: found?.name ?? "Tanpa nama", department: found?.department ?? "", photo: found?.photo ?? null, role: roleOf(id) };
      };

      // One row per person named, written once: anyone already in, and BOD, are left alone.
      const fresh = new Map<string, string>();
      open.forEach((index, i) => {
        const verdict = verdicts[i];
        if (verdict.kind === "dikenali" && roleOf(verdict.employeeId) !== "bod" && !before.has(verdict.employeeId) && !fresh.has(verdict.employeeId)) fresh.set(verdict.employeeId, times[index].toISOString());
      });
      const inserted = new Set<string>();
      if (fresh.size) {
        const { data, error } = await db().from("mw_attendance")
          .upsert([...fresh].map(([employeeId, at]) => ({ session_id: session.id, employee_id: employeeId, method: "manual", recorded_by: context.viewer.id, checked_in_at: at })), { onConflict: "session_id,employee_id", ignoreDuplicates: true })
          .select("employee_id");
        if (error) { if (mwMissing(error)) throw waitingUpdate(); if (error.code === "23503") throw new ServiceError(422, "Orang ini tidak dikenal. Muat ulang halaman."); databaseError(error); }
        for (const row of (data ?? []) as { employee_id: string }[]) inserted.add(row.employee_id);
      }
      // Written by someone else between the read and the write: it is "sudah" too.
      const raced = [...fresh.keys()].filter(id => !inserted.has(id));
      const later = raced.length ? await presentAmong(session.id, raced) : new Map<string, string>();

      open.forEach((index, i) => {
        const verdict = verdicts[i];
        if (verdict.kind !== "dikenali") { answers[index] = { kind: verdict.kind }; return; }
        const person = personOf(verdict.employeeId);
        if (person.role === "bod") { answers[index] = { kind: "dikenali", person, already: false, recorded: false, checkedInAt: null }; return; }
        const recorded = inserted.has(verdict.employeeId);
        const was = before.get(verdict.employeeId) ?? later.get(verdict.employeeId) ?? null;
        answers[index] = { kind: "dikenali", person, already: !recorded, recorded, checkedInAt: recorded ? (fresh.get(verdict.employeeId) ?? null) : was };
      });
    }
  }

  const counts = await presentCount(session.id);
  return { faces: answers.map(answer => answer ?? { kind: "tidak-dikenali" }), present: counts?.present ?? 0, total: counts?.expected ?? 0 };
}
