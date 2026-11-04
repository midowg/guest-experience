import { answered, complete, visibleContent, type AnswerValue, type Answers, type QQuestion, type QSection } from "@/lib/pra-wam/questionnaire";

/*
 * The card stack of the questionnaire as a list: the welcome card, then per section an intro card
 * and one card per question that shows, then the done card. A step has a stable id, so the place
 * someone is at survives branching that adds or removes cards before it.
 */

export type Step =
  | { kind: "welcome"; id: "welcome" }
  | { kind: "intro"; id: string; section: QSection; number: number; cards: number }
  | { kind: "question"; id: string; section: QSection; question: QQuestion; position: number; total: number; lastOfSection: boolean }
  | { kind: "done"; id: "done" };

export type Content = { sections: QSection[]; questions: QQuestion[] };

export function stepsOf(content: Content, answers: Answers, anonymousSent: boolean): Step[] {
  const out: Step[] = [{ kind: "welcome", id: "welcome" }];
  visibleContent(content, answers).forEach(({ section, questions }, index) => {
    // A sent anonymous section is only its intro, saying it is in.
    const cards = section.anonymous && anonymousSent ? [] : questions;
    out.push({ kind: "intro", id: `intro:${section.id}`, section, number: index + 1, cards: cards.length });
    cards.forEach((question, position) => out.push({
      kind: "question", id: `q:${question.key}`, section, question, position: position + 1, total: cards.length, lastOfSection: position === cards.length - 1,
    }));
  });
  out.push({ kind: "done", id: "done" });
  return out;
}

/** Per section, in order: whether it counts as done (the same rule as progressOf). */
export function sectionsDone(content: Content, answers: Answers, anonymousSent: boolean): { section: QSection; done: boolean }[] {
  return visibleContent(content, answers).map(({ section, questions }) => ({
    section,
    done: section.anonymous ? anonymousSent : questions.every(question => !question.required || complete(question, answers[question.key])),
  }));
}

/** Where to pick up: the first required question not answered yet, else the done card. */
export function resumeIndex(steps: Step[], answers: Answers): number {
  const index = steps.findIndex(step => step.kind === "question" && step.question.required && !complete(step.question, answers[step.question.key]));
  return index >= 0 ? index : steps.length - 1;
}

/** Rough seconds per kind of card, as in the mockup. */
const seconds: Record<QQuestion["kind"], number> = { text: 20, long: 40, single: 7, multi: 11, consent: 6, matrix: 30, department: 7, person: 15 };
export function minutesLeft(steps: Step[], from: number): number {
  let total = 0;
  for (let index = Math.max(from, 0); index < steps.length; index++) {
    const step = steps[index];
    if (step.kind === "question") total += seconds[step.question.kind];
  }
  return Math.max(1, Math.round(total / 60));
}

/** The first chosen option, or the text; a person question uses the first person's name. */
export function firstAnswer(value: AnswerValue | undefined, names: Map<string, string> = new Map()): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.length ? names.get(value[0]) ?? value[0] : "";
  return "";
}

/** The little reaction after answering: the question's `react`, with {jawaban} filled in. */
export function reactionFor(question: QQuestion, value: AnswerValue | undefined, names?: Map<string, string>): string | null {
  if (!question.react.trim() || !answered(value)) return null;
  if (!question.react.includes("{jawaban}")) return question.react;
  const first = firstAnswer(value, names);
  if (!first) return null;
  return question.react.replaceAll("{jawaban}", first.length > 40 ? `${first.slice(0, 40).trimEnd()}…` : first);
}

/** Choices that stand alone: picking one clears the others, picking another clears it. */
export const exclusiveChoices = ["Tidak ada", "Tidak ingin menjawab"];
export function toggleChoice(list: string[], option: string, max: number | null): string[] {
  if (list.includes(option)) return list.filter(item => item !== option);
  if (exclusiveChoices.includes(option)) return [option];
  const rest = list.filter(item => !exclusiveChoices.includes(item));
  if (max && rest.length >= max) return rest;
  return [...rest, option];
}
