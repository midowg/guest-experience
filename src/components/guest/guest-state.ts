import type { EventRecord, FeedbackQuestion } from "@/lib/types";

export type SubmissionIdentity = { fingerprint: string; key: string };

/** Kept in component memory only: retry a failed request without creating a duplicate. */
export function submissionIdentity(
  previous: SubmissionIdentity | null,
  payload: unknown,
  createKey: () => string,
): SubmissionIdentity {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: createKey() };
}

export function rsvpIsOpen(event: Pick<EventRecord, "rsvp_enabled" | "rsvp_closes_at">, now: number) {
  return event.rsvp_enabled && (!event.rsvp_closes_at || now < Date.parse(event.rsvp_closes_at));
}

export function feedbackIsOpen(event: Pick<EventRecord, "feedback_enabled" | "feedback_opens_at" | "feedback_questions">, now: number) {
  return event.feedback_enabled && event.feedback_questions.length > 0 && (!event.feedback_opens_at || now >= Date.parse(event.feedback_opens_at));
}

export function feedbackAnswerErrors(questions: FeedbackQuestion[], answers: { question_id: string; value: string }[]) {
  const errors: Record<string, string> = {};
  for (const question of questions) {
    const value = answers.find(answer => answer.question_id === question.id)?.value.trim() ?? "";
    if (question.required && !value) errors[question.id] = "Jawab pertanyaan ini terlebih dahulu.";
    else if (value && question.kind === "rating" && !["1", "2", "3", "4", "5"].includes(value)) errors[question.id] = "Pilih nilai 1 hingga 5.";
    else if (value && question.kind === "choice" && !question.options.includes(value)) errors[question.id] = "Pilih salah satu jawaban yang tersedia.";
    else if (value.length > 3000) errors[question.id] = "Jawaban maksimal 3.000 karakter.";
  }
  return errors;
}
