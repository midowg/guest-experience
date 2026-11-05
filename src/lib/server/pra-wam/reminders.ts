import "server-only";
import { editable } from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "../config";
import { lastAppNote, notifyFromApp } from "./announcements";
import { currentForm, questionnaireWaiting } from "./questionnaire";
import { questionnaireProgress } from "./questionnaire-admin";

/*
 * "Ingatkan yang belum" (Admin WAM → Kuesioner → Progres): a WAM notification to everyone not done
 * yet, or only to those who have not started or are halfway. Only while the questionnaire can be
 * answered, and not twice within an hour, so a double click cannot send it twice.
 */

export const REMINDER_LABEL = "Pengingat kuesioner";
export const REMINDER_GAP_MINUTES = 60;
export type RemindWho = "semua" | "belum" | "sedang";

const dateTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** The note people get; the deadline only when there is one. */
export function reminderNote(form: { name: string; minutes: number; editUntil: string | null }) {
  return {
    title: `Pengingat: ${form.name}`,
    body: `Kamu belum menyelesaikan ${form.name}. Isinya sekitar ${form.minutes} menit dan jawabanmu tersimpan otomatis, jadi bisa dilanjutkan kapan saja dari kartu di Beranda.${form.editUntil ? ` Bisa diisi sampai ${dateTime(form.editUntil)} WIB.` : ""}`,
    label: REMINDER_LABEL,
  };
}

export async function lastReminder() {
  return lastAppNote(REMINDER_LABEL).catch(() => null);
}

/** Sends the reminder; returns how many people got it. */
export async function remindNotDone(who: RemindWho, now = new Date()): Promise<number> {
  const form = await currentForm();
  if (!form) throw questionnaireWaiting();
  if (form.status !== "buka" || !editable(form, now)) throw new ServiceError(409, "Pengingat hanya bisa dikirim selama kuesioner dibuka dan belum lewat tenggat.");
  const last = await lastReminder();
  if (last && now.getTime() - Date.parse(last.at) < REMINDER_GAP_MINUTES * 60_000) {
    throw new ServiceError(409, `Pengingat baru saja dikirim (${dateTime(last.at)} WIB). Tunggu ${REMINDER_GAP_MINUTES} menit sebelum mengirim lagi.`);
  }
  const report = await questionnaireProgress();
  if (!report) throw questionnaireWaiting();
  const ids = report.people.filter(person => person.state !== "selesai" && (who === "semua" || person.state === who)).map(person => person.employeeId);
  if (!ids.length) throw new ServiceError(422, "Tidak ada yang perlu diingatkan: semua di kelompok ini sudah selesai.");
  return notifyFromApp(ids, reminderNote(form));
}
