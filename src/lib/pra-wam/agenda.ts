import { checkInWindow, windowState } from "./attendance";
import { clockLabel, wibDate, wibTime } from "./appraisal";
import type { Session } from "./sessions";

/*
 * Pure pieces of Agenda and Detail sesi: which day and item are open, and what the check-in block
 * says (Penpot P3, E2, P5, P13). The server side is lib/server/pra-wam/agenda.ts.
 */

/** Where the person stands with a session's check-in; null when there is nothing to show. */
export type CheckInStatus =
  | { kind: "hadir"; at: string }
  | { kind: "belum"; opens: string; closes: string }
  | { kind: "buka"; closes: string }
  | { kind: "tutup" }
  /** Attendance is not set up yet (its migration is missing). */
  | { kind: "tidak-tersedia" };

export function checkInStatus(
  session: Pick<Session, "status" | "isParticipant" | "startsAt" | "endsAt">,
  attendance: { ready: boolean; checkedInAt: string | null },
  now: Date,
): CheckInStatus | null {
  if (!session.isParticipant || session.status !== "terbit" || !session.startsAt || !session.endsAt) return null;
  if (attendance.checkedInAt) return { kind: "hadir", at: attendance.checkedInAt };
  if (!attendance.ready) return { kind: "tidak-tersedia" };
  const window = checkInWindow(session.startsAt, session.endsAt);
  const state = windowState(window, now);
  if (state === "belum") return { kind: "belum", opens: window.opens, closes: window.closes };
  return state === "buka" ? { kind: "buka", closes: window.closes } : { kind: "tutup" };
}

const short = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** The block's words: a short title and a line that says what to do. */
export function checkInText(status: CheckInStatus, now: Date): { title: string; body: string } {
  switch (status.kind) {
    case "hadir": return { title: "Hadir", body: `Absen tercatat ${clockLabel(wibTime(status.at))}.` };
    case "buka": return { title: "Terdaftar · belum absen", body: "Scan QR yang ditempel di ruang memakai ponselmu." };
    case "belum": {
      const day = wibDate(status.opens) === wibDate(now.toISOString()) ? "" : `${short(status.opens)}, `;
      return { title: "Terdaftar · absen belum dibuka", body: `QR sesi ini berlaku ${day}${clockLabel(wibTime(status.opens))}–${clockLabel(wibTime(status.closes))}.` };
    }
    case "tutup": return { title: "Absen sudah ditutup", body: "Kehadiranmu belum tercatat. Hubungi panitia kalau kamu hadir." };
    case "tidak-tersedia": return { title: "Terdaftar", body: "Absen dengan QR belum tersedia untuk sesi ini." };
  }
}

type Dated = { key: string; startsAt: string; endsAt: string };

/**
 * The day Agenda opens on: the one asked for if it has something (or is today), else the first
 * day with something still to come, else today.
 */
export function pickDay(items: Dated[], asked: string | undefined, today: string, now: Date): { days: string[]; day: string } {
  const days = [...new Set([today, ...items.map(item => wibDate(item.startsAt))])].sort();
  const coming = days.find(date => items.some(item => wibDate(item.startsAt) === date && new Date(item.endsAt) > now));
  return { days, day: asked && days.includes(asked) ? asked : coming ?? today };
}

/** The item open in the desktop panel: the one asked for, else the next one, else the first. */
export function pickItem<T extends Dated>(shown: T[], asked: string | undefined, now: Date): T | undefined {
  return shown.find(item => item.key === asked) ?? shown.find(item => new Date(item.endsAt) > now) ?? shown[0];
}
