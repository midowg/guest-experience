import { MAIN_WAM_PATH } from "@/lib/routes";
import { t, type Lang } from "../i18n";
import { wibDate } from "../rundown";
import type { MwNotification, NoteKind } from "../types";
import { dateLabel, hhmm } from "./format";

/*
 * Notifikasi (N01, revisi 16 Nov): two groups, Hari ini and Sebelumnya, one line per note (icon,
 * the news itself, time). A tap opens where the note points (a Main WAM screen); a note without a
 * place to go (a panitia's announcement) opens in a sheet with its full text. Opening the screen
 * marks all read. Pure.
 *
 * The line is the news, not its kind (audit T-P01): a note whose title only names its kind
 * ("Jadwal berubah", "Momen", "Absen", "Kamar") shows the first sentence of its text instead
 * ("Pemaparan selesai 12.30", "Kamarmu siap: Kamar 208, lantai 2"), so two schedule notes never
 * read the same. A title that already says something ("Fotomu disembunyikan sementara", a
 * panitia's announcement) stays.
 */

export type NotificationRow = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  /** What the row says: the news (see noteLine). */
  line: string;
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
  silent: "Silent Meeting", voting: "Awarding", survei: "Survei", lain: "Kabar", kuis: "Kuis live",
};

/** Titles that only name what kind of news it is (the senders' own words), lower case. */
const KIND_TITLES = new Set([
  ...Object.values(KIND_WORDS), "jadwal berubah", "tempat berubah", "sesi dibatalkan", "sesi dijadwalkan lagi", "notifikasi", "info",
].map(word => word.toLowerCase()));

/** The first sentence of a text, without its closing full stop ("12.30" is not an end: a sentence ends at . ! ? before a space). */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end < 0 ? flat : flat.slice(0, end + 1);
  return sentence.replace(/\.$/, "").trim();
}

/** The row's words: the title, unless it only names the kind and the text says what happened. */
export function noteLine(note: Pick<MwNotification, "kind" | "title" | "body" | "fromPraWam">): string {
  const title = note.title.trim();
  if (note.kind === "pengumuman" || note.fromPraWam || !note.body.trim()) return title;
  return !title || KIND_TITLES.has(title.toLowerCase()) ? firstSentence(note.body) || title : title;
}

/** Only an address inside Main WAM is followed; anything else opens the sheet. */
export function noteTarget(link: string | null): string | null {
  if (!link || !link.startsWith(`${MAIN_WAM_PATH}`) || link.startsWith("//") || /[\s\\]/.test(link)) return null;
  return link === MAIN_WAM_PATH || link.startsWith(`${MAIN_WAM_PATH}/`) || link.startsWith(`${MAIN_WAM_PATH}?`) || link.startsWith(`${MAIN_WAM_PATH}#`) ? link : null;
}

/** Newest first, split into today and before (WIB). */
export function groupNotifications(items: readonly MwNotification[], now: Date, lang: Lang = "id"): { today: NotificationRow[]; earlier: NotificationRow[] } {
  const today = wibDate(now.toISOString());
  const rows = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(item => {
    const sameDay = wibDate(item.createdAt) === today;
    const time = sameDay ? hhmm(item.createdAt, lang) : dateLabel(wibDate(item.createdAt), lang);
    return {
      row: {
        id: item.id, kind: item.kind, title: item.title, body: item.body, line: noteLine(item), time, unread: !item.readAt, href: noteTarget(item.link),
        meta: `${item.fromPraWam ? t(lang, "peserta.notes.fromPra") : t(lang, `peserta.notes.kind.${item.kind}`)} · ${sameDay ? time : `${time} · ${hhmm(item.createdAt, lang)}`}`,
      } satisfies NotificationRow,
      sameDay,
    };
  });
  return { today: rows.filter(entry => entry.sameDay).map(entry => entry.row), earlier: rows.filter(entry => !entry.sameDay).map(entry => entry.row) };
}

/** The hash that opens a note's sheet on Notifikasi ("#kabar-<id>"), e.g. from Beranda's banner. */
export const noteHash = (id: string) => `kabar-${id}`;
