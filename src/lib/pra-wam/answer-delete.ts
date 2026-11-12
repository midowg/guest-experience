import { z } from "zod";

/** Admin WAM → Kuesioner → Rekap, deleting answers (12 Nov 2026): what the page sends; the rules are in src/lib/server/pra-wam/answer-delete.ts. */

export const DELETE_ALL_WORD = "HAPUS";
export const answerDeleteSchema = z.discriminatedUnion("who", [
  z.object({ who: z.literal("pilih"), employeeIds: z.array(z.uuid()).min(1, "Pilih orangnya dulu.").max(2000) }),
  z.object({ who: z.literal("semua"), confirm: z.literal(DELETE_ALL_WORD, `Ketik ${DELETE_ALL_WORD} untuk menghapus semua data.`) }),
]);
export type AnswerDelete = z.infer<typeof answerDeleteSchema>;
export type DeleteResult = { people: number; answers: number; anonymous: number; roommates: number };

/** What was deleted, in a sentence for the admin. */
export function deletedText(request: Pick<AnswerDelete, "who">, result: DeleteResult): string {
  if (request.who === "pilih") return `Jawaban ${result.people} orang dihapus (${result.answers} jawaban). Statusnya kembali Belum mulai.`;
  return `Semua data kuesioner dihapus: ${result.answers} jawaban bernama, ${result.anonymous} jawaban anonim, dan ${result.roommates} penempatan kamar.`;
}
