/*
 * Profil teman sekamar (Kamar, L01): what a roommate's sheet shows. Made only from answers marked
 * `rekan` ("Rekan bisa lihat ini") in the questionnaire, which colleagueOf already filters; nothing else
 * ever reaches here. Pure: shared by the server, the screen and the previews.
 */

export type RoommateAnswer = { key: string; prompt: string; lines: string[] };
export type RoommateView = {
  person: { id: string; name: string; department: string; photo: string | null };
  /** The tokoh card in one line each (name, kind, tier); null without a card. */
  card: { name: string; kind: string; tier: string } | null;
  answers: RoommateAnswer[];
  /** False: they have not filled the questionnaire (or it is not there yet): the sheet says so. */
  filled: boolean;
};

/** At most this many answers, in the questionnaire's order. */
export const ROOMMATE_ANSWER_LIMIT = 8;
/** The name and the department are already in the sheet's head (questions 1 and 2 of the form). */
const IN_THE_HEAD = new Set(["1", "2"]);

/** The answers a roommate sheet shows: drop what the head already says, then cap. */
export function roommateAnswers(answers: readonly RoommateAnswer[]): RoommateAnswer[] {
  // Rebuilt field by field: nothing else an answer might carry goes out.
  return answers.filter(answer => !IN_THE_HEAD.has(answer.key) && answer.lines.length > 0).slice(0, ROOMMATE_ANSWER_LIMIT)
    .map(answer => ({ key: answer.key, prompt: answer.prompt, lines: [...answer.lines] }));
}
