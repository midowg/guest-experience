import type { PushTopic } from "@/lib/pra-wam/push";
import type { NoteKind } from "./types";

/*
 * Main WAM's notifications go through WAM's one inbox (pw_announcements + pw_notification_receipts,
 * the bell) with their own kind and link (mw_notes), and to phones through the existing Web Push
 * (src/lib/server/pra-wam/push.ts, aturan-wam §7a). Main WAM adds no push topic, so Pra WAM's
 * Pengaturan → Notifikasi stays as it is; each kind rides on a topic with the right behaviour:
 *   pengumuman, jadwal       "pengumuman": always to the phone, also in quiet hours (SPEC §1.5:
 *                            at night only panitia's announcements and schedule changes go out)
 *   absen, silent, voting,   "forum": to the phone, not in quiet hours 21.00–06.00
 *   survei, kamar, foto hidden
 *   momen (likes), lain      null: the bell only (likes are off on the phone by default)
 * Pure.
 */

export function notePushTopic(kind: NoteKind, opts: { photoHidden?: boolean } = {}): PushTopic | null {
  switch (kind) {
    case "pengumuman": case "jadwal": return "pengumuman";
    case "absen": case "silent": case "voting": case "survei": case "kamar": return "forum";
    case "momen": return opts.photoHidden ? "forum" : null;
    case "lain": return null;
  }
}

/** The Lucide icon N01 draws for a kind (SPEC §0.3). */
export const noteIcon: Record<NoteKind, string> = {
  pengumuman: "megaphone", jadwal: "calendar-clock", absen: "circle-check", momen: "heart", kamar: "key-round",
  silent: "lock", voting: "trophy", survei: "clipboard-list", lain: "bell",
};

/** pw_announcements.kind allows only these two; a panitia's announcement is "pengumuman", the app's own notes "sesi". */
export const announcementKind = (kind: NoteKind): "pengumuman" | "sesi" => (kind === "pengumuman" ? "pengumuman" : "sesi");
