import type { PushTopic } from "@/lib/pra-wam/push";
import type { NoteKind, NoteTone } from "./types";

/*
 * Main WAM's notifications go through WAM's one inbox (pw_announcements + pw_notification_receipts,
 * the bell) with their own kind and link (mw_notes), and to phones through the existing Web Push
 * (src/lib/server/pra-wam/push.ts, aturan-wam §7a). Main WAM adds no push topic, so Pra WAM's
 * Pengaturan → Notifikasi stays as it is; each kind rides on a topic with the right behaviour:
 *   pengumuman, jadwal,      "pengumuman": always to the phone, also in quiet hours (SPEC §1.5:
 *   kuis                     at night only panitia's announcements and schedule changes go out;
 *                            Kuis live's "Kuis dimulai" is a call to join the game now)
 *   absen, silent, voting,   "forum": to the phone, not in quiet hours 21.00–06.00
 *   survei, kamar, foto hidden
 *   momen (likes), lain      null: the bell only (likes are off on the phone by default)
 * Pure.
 */

export function notePushTopic(kind: NoteKind, opts: { photoHidden?: boolean } = {}): PushTopic | null {
  switch (kind) {
    // Kuis live: "Kuis dimulai" when the MC opens the lobby, a call to join now (also in quiet hours).
    case "pengumuman": case "jadwal": case "kuis": return "pengumuman";
    case "absen": case "silent": case "voting": case "survei": case "kamar": return "forum";
    case "momen": return opts.photoHidden ? "forum" : null;
    case "lain": return null;
  }
}

/** The Lucide icon N01 draws for a kind (SPEC §0.3). */
export const noteIcon: Record<NoteKind, string> = {
  pengumuman: "megaphone", jadwal: "calendar-clock", absen: "circle-check", momen: "heart", kamar: "key-round",
  silent: "lock", voting: "trophy", survei: "clipboard-list", lain: "bell", kuis: "gamepad-2",
};

/** Words in a title that say something changed: a time, a place, a cancellation. */
const CHANGE = /\b(berubah|diubah|perubahan|pindah|dipindah|dipindahkan|mundur|dimundurkan|dimajukan|batal|dibatalkan|ditunda)\b/i;

/**
 * A note's tone (Beranda's banner, N01's icon): the one panitia chose (mw_notes.tone), else a
 * warning for a schedule change (kind jadwal, or an announcement whose title says something
 * changed: "Jam kumpul berubah", P02__status), else info.
 */
export function noteTone(note: { kind: NoteKind; title: string; tone?: string | null }): NoteTone {
  if (note.tone === "info" || note.tone === "warning") return note.tone;
  if (note.kind === "jadwal") return "warning";
  if (note.kind === "pengumuman" && CHANGE.test(note.title)) return "warning";
  return "info";
}

/** pw_announcements.kind allows only these two; a panitia's announcement is "pengumuman", the app's own notes "sesi". */
export const announcementKind = (kind: NoteKind): "pengumuman" | "sesi" => (kind === "pengumuman" ? "pengumuman" : "sesi");
