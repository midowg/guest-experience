import type { QContent, QForm } from "./questionnaire";

/*
 * Deleting the stay and health data on the date HR sets (Pengaturan → "Tanggal hapus data
 * menginap"), decided by the owner on 5 Nov 2026: the stay answers (33, 7-13, 38), health (16),
 * allergies and phobias (14b), and the room pairing (who shares which room; the hotel's room list
 * stays). It runs when someone opens Admin WAM on or after that date, or with "Hapus sekarang".
 * From that day those questions are also gone from the form and from everyone's progress, so a
 * finished person never turns unfinished. Pure, so the rules can be tested.
 */

/** The questions whose answers go, by fixed key. */
export const PURGE_KEYS = ["33", "7", "8", "9", "10", "11", "12", "13", "38", "16", "14b"] as const;
const purged = new Set<string>(PURGE_KEYS);

/** Today in Jakarta as YYYY-MM-DD. */
export const wibToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);

/** Whether the deletion date has come (from 00.00 WIB on that day). */
export const purgeDue = (form: Pick<QForm, "stayDeleteOn">, now = new Date()) => !!form.stayDeleteOn && wibToday(now) >= form.stayDeleteOn;

/** The content without the deleted questions once the date has come; unchanged before it. */
export function withoutPurged<C extends Pick<QContent, "questions">>(content: C, form: Pick<QForm, "stayDeleteOn">, now = new Date()): C {
  if (!purgeDue(form, now)) return content;
  return { ...content, questions: content.questions.filter(question => !purged.has(question.key)) };
}
