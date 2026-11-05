import { CHECK_IN_MARGIN_MINUTES, checkInWindow, ownMethodLabels, windowState, type AttendanceMethod } from "./attendance";
import { clockLabel, dayLabel, wibDate, wibTime, type Person, type Room } from "./appraisal";
import type { PraWamDocument } from "./documents";
import type { ScheduleRequest } from "./requests";
import type { Session } from "./sessions";

/*
 * Pure pieces of Agenda and Detail sesi: which day and item are open, and what the check-in block
 * says (Penpot P3, E2, P5, P13). The server side is lib/server/pra-wam/agenda.ts.
 */

/** Where the person stands with a session's check-in; null when there is nothing to show. */
export type CheckInStatus =
  | { kind: "hadir"; at: string; method?: AttendanceMethod | null }
  | { kind: "belum"; opens: string; closes: string }
  | { kind: "buka"; closes: string }
  | { kind: "tutup" }
  /** Attendance is not set up yet (its migration is missing). */
  | { kind: "tidak-tersedia" };

export function checkInStatus(
  session: Pick<Session, "status" | "isParticipant" | "startsAt" | "endsAt">,
  attendance: MyAttendance,
  now: Date,
): CheckInStatus | null {
  if (!session.isParticipant || session.status !== "terbit" || !session.startsAt || !session.endsAt) return null;
  if (attendance.checkedInAt) return { kind: "hadir", at: attendance.checkedInAt, ...(attendance.method ? { method: attendance.method } : {}) };
  if (!attendance.ready) return { kind: "tidak-tersedia" };
  const window = checkInWindow(session.startsAt, session.endsAt);
  const state = windowState(window, now);
  if (state === "belum") return { kind: "belum", opens: window.opens, closes: window.closes };
  return state === "buka" ? { kind: "buka", closes: window.closes } : { kind: "tutup" };
}

const short = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * The block's words: a short title and a line that says what to do. With `self` ("Saya hadir" is
 * there, migration 202611050003) the words point to the button as well as the QR.
 */
export function checkInText(status: CheckInStatus, now: Date, { self = false }: { self?: boolean } = {}): { title: string; body: string } {
  switch (status.kind) {
    case "hadir": return status.method
      ? { title: `Hadir ${clockLabel(wibTime(status.at))} · ${ownMethodLabels[status.method]}`, body: "Kehadiranmu sudah tercatat." }
      : { title: "Hadir", body: `Absen tercatat ${clockLabel(wibTime(status.at))}.` };
    case "buka": return { title: "Terdaftar · belum absen", body: self ? "Ketuk Saya hadir, atau scan QR yang ditempel di ruang." : "Scan QR yang ditempel di ruang memakai ponselmu." };
    case "belum": {
      const day = wibDate(status.opens) === wibDate(now.toISOString()) ? "" : `${short(status.opens)}, `;
      if (self) return { title: "Terdaftar · absen belum dibuka", body: `Absen dibuka ${CHECK_IN_MARGIN_MINUTES} menit sebelum mulai (${day}${clockLabel(wibTime(status.opens))}).` };
      return { title: "Terdaftar · absen belum dibuka", body: `QR sesi ini berlaku ${day}${clockLabel(wibTime(status.opens))}–${clockLabel(wibTime(status.closes))}.` };
    }
    case "tutup": return { title: "Absen sudah ditutup", body: "Kehadiranmu belum tercatat. Hubungi panitia kalau kamu hadir." };
    case "tidak-tersedia": return { title: "Terdaftar", body: "Absen dengan QR belum tersedia untuk sesi ini." };
  }
}

/** "pukul 09.00" today, else "Selasa, 10 Nov pukul 09.00". */
export function atLabel(iso: string, now: string): string {
  const day = wibDate(iso) === wibDate(now) ? "" : `${dayLabel(wibDate(iso))} `;
  return `${day}pukul ${clockLabel(wibTime(iso))}`;
}

/** The line on Beranda's blue card over its check-in button: when it opens, until when, or closed. */
export function heroCheckInNote(status: CheckInStatus, now: string): string {
  switch (status.kind) {
    case "buka": return `Absen dibuka sampai ${clockLabel(wibTime(status.closes))}.`;
    case "belum": return `Absen dibuka ${atLabel(status.opens, now)}, 30 menit sebelum mulai.`;
    case "tutup": return "Absen sudah ditutup. Hubungi panitia kalau kamu hadir.";
    default: return "";
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

/*
 * An agenda item opens over the page (AgendaSheet), never on another page: the address keeps
 * ?item=<key> so a refresh or coming back shows it open again. Older links used ?session=<id>.
 */

/** The attribute on a link that opens an agenda item over the page (its value is the item's key). */
export const AGENDA_ITEM = "data-agenda-item";

/** The key of the item asked for in the address, if any. */
export function askedItem(search: { get(name: string): string | null }): string | null {
  return search.get("item") || search.get("session") || null;
}

/** The address with this item open (or none open): other parts of the query stay. */
export function withItem(href: string, key: string | null): string {
  const url = new URL(href, "http://x");
  url.searchParams.delete("session");
  if (key) url.searchParams.set("item", key); else url.searchParams.delete("item");
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/** What the person may do with a booking on their agenda; the same rules as Book (AppraisalBoard). */
export function bookingRights(
  booking: { mine: boolean; endsAt: string },
  viewer: { cancelsAny: boolean; bookingOpen: boolean },
  now: Date,
): { edit: boolean; cancel: boolean; remove: boolean } {
  const manage = booking.mine || viewer.cancelsAny;
  return { edit: viewer.bookingOpen && booking.mine, cancel: manage && new Date(booking.endsAt) > now, remove: manage };
}

/** A booking on the agenda, with what its detail shows. */
export type AgendaBooking = { room: string; bookedBy: Person; mine: boolean; participants: Person[] | null; description: string };

/**
 * Everything Detail sesi shows, for its own page and for the sheet over Agenda and Beranda
 * (GET /api/wam/sessions/<id>/detail). A participant's session that is not published (yet) or was
 * cancelled is "menunggu": enough to say so.
 */
/**
 * The person's own check-in for a session: whether attendance exists at all (202611040005),
 * whether "Saya hadir" does (202611050003), and when and how they were signed in.
 */
export type MyAttendance = { ready: boolean; checkedInAt: string | null; method?: AttendanceMethod | null; selfReady?: boolean };

export type SessionView =
  | {
    kind: "sesi"; session: Session; documents: PraWamDocument[]; storage: boolean;
    attendance: MyAttendance; requests: ScheduleRequest[]; rooms: Room[];
    viewer: { name: string; manage: boolean; staff: boolean };
  }
  | { kind: "menunggu"; session: Pick<Session, "id" | "title" | "status" | "planFrom" | "planTo" | "startsAt" | "endsAt"> };
