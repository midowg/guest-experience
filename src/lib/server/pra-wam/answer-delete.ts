import "server-only";
import type { AnswerDelete, DeleteResult } from "@/lib/pra-wam/answer-delete";
import type { QForm } from "@/lib/pra-wam/questionnaire";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { questionnaireMissing, questionnaireWaiting } from "./questionnaire";

/*
 * Admin WAM → Kuesioner → Rekap: deleting answers (12 Nov 2026, owner's decision). Deleted for good,
 * there is no copy.
 *   * Chosen people: their named answers, their progress (back to "Belum mulai") and their card
 *     (13 Nov 2026: so its figure place and number free up, and filling in again draws anew). Their
 *     anonymous answers stay: they are kept without a name, so nobody can find which are theirs,
 *     and the receipt stays too so the anonymous part is not filled twice.
 *   * Everything ("Hapus semua data", typed HAPUS to confirm): every answer, named and anonymous,
 *     every progress and receipt, every card, and the room pairing (taken off Beranda), so it
 *     starts again.
 * The people go in groups of 100, so a long list never makes a too long request.
 */

const GROUP = 100;
const groups = <T>(list: readonly T[]) => Array.from({ length: Math.ceil(list.length / GROUP) }, (_, index) => list.slice(index * GROUP, (index + 1) * GROUP));
/** Cards (character cards); before their migration there is nothing to delete. */
const cardsGone = (error: { code?: string; message?: string } | null) => !!error && ["42P01", "PGRST205"].includes(error.code ?? "") && /cq_person_cards/.test(error.message ?? "");

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
    let answers = 0, cards = 0;
    for (const group of groups(ids)) {
      const removed = await client.from("cq_answers").delete({ count: "exact" }).eq("form_id", form.id).in("employee_id", group);
      tolerate(removed.error);
      answers += removed.count ?? 0;
      const progress = await client.from("cq_progress").delete().eq("form_id", form.id).in("employee_id", group);
      tolerate(progress.error);
      const card = await client.from("cq_person_cards").delete({ count: "exact" }).eq("form_id", form.id).in("employee_id", group);
      if (!cardsGone(card.error)) tolerate(card.error);
      cards += card.error ? 0 : card.count ?? 0;
    }
    return { people: ids.length, answers, anonymous: 0, roommates: 0, cards };
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
  const cards = await client.from("cq_person_cards").delete({ count: "exact" }).eq("form_id", form.id);
  if (!cardsGone(cards.error)) tolerate(cards.error);
  const unpublish = await client.from("cq_forms").update({ rooms_published_at: null }).eq("id", form.id);
  tolerate(unpublish.error);
  return { people: progress.count ?? 0, answers: answers.count ?? 0, anonymous: anonymous.count ?? 0, roommates: members.error ? 0 : members.count ?? 0, cards: cards.error ? 0 : cards.count ?? 0 };
}
