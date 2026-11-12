import "server-only";
import type { AnswerDelete, DeleteResult } from "@/lib/pra-wam/answer-delete";
import type { QForm } from "@/lib/pra-wam/questionnaire";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * Admin WAM → Kuesioner → Rekap: deleting answers (12 Nov 2026, owner's decision). Deleted for good,
 * there is no copy.
 *   * Chosen people: their named answers, and their progress (back to "Belum mulai"). Their
 *     anonymous answers stay: they are kept without a name, so nobody can find which are theirs,
 *     and the receipt stays too so the anonymous part is not filled twice.
 *   * Everything ("Hapus semua data", typed HAPUS to confirm): every answer, named and anonymous,
 *     every progress and receipt, and the room pairing (taken off Beranda), so it starts again.
 */

const tolerate = (error: { code?: string; message?: string } | null) => {
  if (!error) return;
  if (questionnaireMissing(error)) throw questionnaireWaiting();
  // The room pairing comes with a later migration: without it there is nothing to delete.
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") && /cq_stay|rooms_published_at/.test(error.message ?? "")) return;
  databaseError(error as { message: string });
};

export async function deleteAnswers(form: Pick<QForm, "id">, request: AnswerDelete): Promise<DeleteResult> {
  const client = createPrivilegedClient();
  if (request.who === "pilih") {
    const ids = [...new Set(request.employeeIds)];
    const answers = await client.from("cq_answers").delete({ count: "exact" }).eq("form_id", form.id).in("employee_id", ids);
    tolerate(answers.error);
    const progress = await client.from("cq_progress").delete({ count: "exact" }).eq("form_id", form.id).in("employee_id", ids);
    tolerate(progress.error);
    return { people: ids.length, answers: answers.count ?? 0, anonymous: 0, roommates: 0 };
  }
  const answers = await client.from("cq_answers").delete({ count: "exact" }).eq("form_id", form.id);
  tolerate(answers.error);
  const anonymous = await client.from("cq_anon_answers").delete({ count: "exact" }).eq("form_id", form.id);
  tolerate(anonymous.error);
  const receipts = await client.from("cq_anon_receipts").delete().eq("form_id", form.id);
  tolerate(receipts.error);
  const progress = await client.from("cq_progress").delete({ count: "exact" }).eq("form_id", form.id);
  tolerate(progress.error);
  const members = await client.from("cq_stay_members").delete({ count: "exact" }).eq("form_id", form.id);
  tolerate(members.error);
  const unpublish = await client.from("cq_forms").update({ rooms_published_at: null }).eq("id", form.id);
  tolerate(unpublish.error);
  return { people: progress.count ?? 0, answers: answers.count ?? 0, anonymous: anonymous.count ?? 0, roommates: members.error ? 0 : members.count ?? 0 };
}
