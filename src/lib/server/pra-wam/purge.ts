import "server-only";
import { cache } from "react";
import { PURGE_KEYS, purgeDue } from "@/lib/pra-wam/purge";
import type { QForm } from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { currentForm, formContent, questionnaireMissing } from "./questionnaire";

/*
 * Deleting the stay and health data on the date HR sets (rules in src/lib/pra-wam/purge.ts). The
 * answers and the room pairing are deleted for good; there is no copy. Before the date nothing is
 * touched; from it, every Admin WAM page runs purgeIfDue once, and "Hapus sekarang" runs it too.
 */

const missing = (error: { code?: string; message?: string }) =>
  questionnaireMissing(error) || (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") && /cq_stay|rooms_published_at/.test(error.message ?? ""));

async function purgeQuestionIds(formId: string): Promise<string[]> {
  const { questions } = await formContent(formId);
  return questions.filter(question => (PURGE_KEYS as readonly string[]).includes(question.key)).map(question => question.id);
}

export type PurgeStatus = { date: string | null; due: boolean; answers: number; roommates: number };

/** For Pengaturan: the date, whether it has come, and how much is still there to delete. */
export async function purgeStatus(form: Pick<QForm, "id" | "stayDeleteOn">, now = new Date()): Promise<PurgeStatus> {
  const client = createPrivilegedClient();
  const ids = await purgeQuestionIds(form.id);
  const [answers, members] = await Promise.all([
    ids.length ? client.from("cq_answers").select("question_id", { count: "exact", head: true }).eq("form_id", form.id).in("question_id", ids) : Promise.resolve({ count: 0, error: null }),
    client.from("cq_stay_members").select("employee_id", { count: "exact", head: true }).eq("form_id", form.id),
  ]);
  if (answers.error && !missing(answers.error)) databaseError(answers.error);
  if (members.error && !missing(members.error)) databaseError(members.error);
  return { date: form.stayDeleteOn, due: purgeDue(form, now), answers: answers.count ?? 0, roommates: members.error ? 0 : members.count ?? 0 };
}

/**
 * Deletes the stay and health answers and the room pairing, and takes the pairing off Beranda.
 * Refused before the date. Returns how many rows went.
 */
export async function purgeStayData(form: Pick<QForm, "id" | "stayDeleteOn">, now = new Date()): Promise<{ answers: number; roommates: number }> {
  if (!form.stayDeleteOn) throw new ServiceError(409, "Tanggal hapus data menginap belum diatur di Pengaturan.");
  if (!purgeDue(form, now)) throw new ServiceError(409, "Tanggal hapus data menginap belum tiba.");
  const client = createPrivilegedClient();
  const ids = await purgeQuestionIds(form.id);
  let answers = 0, roommates = 0;
  if (ids.length) {
    const { count, error } = await client.from("cq_answers").delete({ count: "exact" }).eq("form_id", form.id).in("question_id", ids);
    if (error && !missing(error)) databaseError(error);
    answers = count ?? 0;
  }
  const members = await client.from("cq_stay_members").delete({ count: "exact" }).eq("form_id", form.id);
  if (members.error && !missing(members.error)) databaseError(members.error);
  roommates = members.error ? 0 : members.count ?? 0;
  const unpublish = await client.from("cq_forms").update({ rooms_published_at: null }).eq("id", form.id);
  if (unpublish.error && !missing(unpublish.error)) databaseError(unpublish.error);
  return { answers, roommates };
}

/** Once per request, from Admin WAM's frame: deletes when the date has come and something is left. Never throws. */
export const purgeIfDue = cache(async (): Promise<void> => {
  try {
    const form = await currentForm();
    if (!form || !purgeDue(form)) return;
    const left = await purgeStatus(form);
    if (left.answers || left.roommates) await purgeStayData(form);
  } catch { /* the page shows either way; the next visit tries again */ }
});
