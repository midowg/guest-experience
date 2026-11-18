import { checkInState, checkInWindow, isRunning, sessionEnd, timeRange } from "../rundown";
import type { MwAttendanceMethod, MwSession } from "../types";
import { clock } from "./format";

/*
 * Absen manual (K05) and the attendance BOD sees (B02): who is expected, who is present and how,
 * and the session the screen opens on. The check-in rules (the window 30 minutes around the
 * session) are Pra WAM's (checkInWindow, rundown.ts), the same for QR and manual. Pure.
 */

/** "Scan QR" or "Dicatat panitia", after the time on the Hadir tab (prototype K05__status). */
export const methodLabels: Record<MwAttendanceMethod, string> = { qr: "Scan QR", manual: "Dicatat panitia" };

/** One person on the Absen sesi list. */
export type AttendeeRow = {
  id: string;
  /** Nama panggilan. */
  name: string;
  department: string;
  photo: string | null;
  checkedInAt: string | null;
  method: MwAttendanceMethod | null;
};

/** "Finance" (kelompok are gone from the app). */
export const attendeeLine = (row: Pick<AttendeeRow, "department">) => row.department;
/** "07.52 · Scan QR". */
export const presentLine = (row: AttendeeRow) => (row.checkedInAt && row.method ? `${clock(row.checkedInAt)} · ${methodLabels[row.method]}` : "");

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Rows whose name, department or kelompok contains the words typed (any order, accents ignored). */
export function searchAttendees<T extends Pick<AttendeeRow, "name" | "department">>(rows: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...rows];
  return rows.filter(row => {
    const text = fold(`${row.name} ${row.department}`);
    return words.every(word => text.includes(word));
  });
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "id");
/** Belum hadir and Hadir, each by name. */
export function splitAttendance<T extends AttendeeRow>(rows: readonly T[]): { absent: T[]; present: T[] } {
  return { absent: rows.filter(row => !row.checkedInAt).sort(byName), present: rows.filter(row => !!row.checkedInAt).sort(byName) };
}

/** "Absen dibuka sampai 12.30", "Absen dibuka 07.30" (later today), "Absen ditutup 12.30". */
export function windowCaption(session: Pick<MwSession, "startsAt" | "endsAt">, now: Date): string {
  const window = checkInWindow(session);
  const state = checkInState(session, now);
  if (state === "belum") return `Absen dibuka ${clock(window.opens)}`;
  return state === "buka" ? `Absen dibuka sampai ${clock(window.closes)}` : `Absen ditutup ${clock(window.closes)}`;
}

/** "Pemaparan departemen · 08.00–12.00" (the session picker's value). */
export const sessionChoice = (session: Pick<MwSession, "title" | "startsAt" | "endsAt">) => `${session.title} · ${timeRange(session)}`;

/**
 * The session Absen sesi opens on: the asked one when it takes attendance; else one whose window is
 * open now (running, wajib first); else the next one; else the last one that has passed.
 */
export function pickAttendanceSession<T extends Pick<MwSession, "id" | "startsAt" | "endsAt" | "required">>(sessions: readonly T[], now: Date, asked?: string | null): T | null {
  if (!sessions.length) return null;
  const sorted = [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const found = asked ? sorted.find(session => session.id === asked) : undefined;
  if (found) return found;
  const open = sorted.filter(session => checkInState(session, now) === "buka");
  const rank = (session: T) => (isRunning(session, now) ? 0 : 1) + (session.required ? 0 : 2);
  if (open.length) return [...open].sort((a, b) => rank(a) - rank(b))[0];
  const next = sorted.find(session => Date.parse(session.startsAt) > now.getTime());
  if (next) return next;
  return [...sorted].reverse().find(session => Date.parse(sessionEnd(session)) <= now.getTime()) ?? sorted[0];
}

/**
 * Panitia may take back only what panitia recorded ("Dicatat panitia"): a person's own QR scan
 * stays (audit L8).
 */
export const mayUndo = (row: Pick<AttendeeRow, "checkedInAt" | "method">) => !!row.checkedInAt && row.method === "manual";

/** Panitia may record someone present from the moment the window opens (also after it closes: a correction). */
export const mayRecord = (session: Pick<MwSession, "startsAt" | "endsAt">, now: Date) => checkInState(session, now) !== "belum";
