import { MAIN_WAM_PATH } from "@/lib/routes";
import { wibDate } from "../rundown";
import type { MwNotification, NoteKind } from "../types";
import { dateLabel, hhmm } from "./format";

/*
 * Notifikasi (N01, revisi 16 Nov): two groups, Hari ini and Sebelumnya, one line per note (icon,
 * title, time). A tap opens where the note points (a Main WAM screen); a note without a place to go
 * (a panitia's announcement) opens in a sheet with its full text. Opening the screen marks all read.
 * Pure.
 */

export type NotificationRow = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  /** "10.30" today, "Sen, 4 Jan" before. */
  time: string;
  unread: boolean;
  /** A Main WAM screen to open; null = the sheet. */
  href: string | null;
  /** The sheet's line over the text: "Pengumuman panitia · 10.30". */
  meta: string;
};

const KIND_WORDS: Record<NoteKind, string> = {
  pengumuman: "Pengumuman panitia", jadwal: "Jadwal", absen: "Absen", momen: "Momen", kamar: "Kamar",
  silent: "Silent Meeting", voting: "Awarding", survei: "Survei", lain: "Kabar",
};

/** Only an address inside Main WAM is followed; anything else opens the sheet. */
export function noteTarget(link: string | null): string | null {
  if (!link || !link.startsWith(`${MAIN_WAM_PATH}`) || link.startsWith("//") || /[\s\\]/.test(link)) return null;
  return link === MAIN_WAM_PATH || link.startsWith(`${MAIN_WAM_PATH}/`) || link.startsWith(`${MAIN_WAM_PATH}?`) || link.startsWith(`${MAIN_WAM_PATH}#`) ? link : null;
}

/** Newest first, split into today and before (WIB). */
export function groupNotifications(items: readonly MwNotification[], now: Date): { today: NotificationRow[]; earlier: NotificationRow[] } {
  const today = wibDate(now.toISOString());
  const rows = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(item => {
    const sameDay = wibDate(item.createdAt) === today;
    const time = sameDay ? hhmm(item.createdAt) : dateLabel(wibDate(item.createdAt));
    return {
      row: {
        id: item.id, kind: item.kind, title: item.title, body: item.body, time, unread: !item.readAt, href: noteTarget(item.link),
        meta: `${item.fromPraWam ? "Pra WAM" : KIND_WORDS[item.kind]} · ${sameDay ? time : `${time} · ${hhmm(item.createdAt)}`}`,
      } satisfies NotificationRow,
      sameDay,
    };
  });
  return { today: rows.filter(entry => entry.sameDay).map(entry => entry.row), earlier: rows.filter(entry => !entry.sameDay).map(entry => entry.row) };
}

/** The hash that opens a note's sheet on Notifikasi ("#kabar-<id>"), e.g. from Beranda's banner. */
export const noteHash = (id: string) => `kabar-${id}`;
