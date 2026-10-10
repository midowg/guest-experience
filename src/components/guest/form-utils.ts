import type { ApiResult, EventRecord, FeedbackQuestion } from "@/lib/types";

export type FieldErrors = Record<string, string>;
export type RetryIdentity = { fingerprint: string; key: string };

// In-memory only: failed requests retain their key; changed normalized payloads do not.
export function submissionIdentity(payload: unknown, previous: RetryIdentity | null, createKey: () => string): RetryIdentity {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: createKey() };
}

export function rsvpIsOpen(event: Pick<EventRecord, "rsvp_enabled" | "rsvp_closes_at">, now: number) {
  return event.rsvp_enabled && (!event.rsvp_closes_at || now < Date.parse(event.rsvp_closes_at));
}

export function feedbackIsOpen(event: Pick<EventRecord, "feedback_enabled" | "feedback_opens_at" | "feedback_questions">, now: number) {
  return event.feedback_enabled && event.feedback_questions.length > 0 && (!event.feedback_opens_at || now >= Date.parse(event.feedback_opens_at));
}

export function feedbackErrors(questions: FeedbackQuestion[], answers: { question_id: string; value: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const question of questions) {
    const value = answers.find(answer => answer.question_id === question.id)?.value.trim() ?? "";
    if (!value && question.required) errors[question.id] = "Jawaban diperlukan.";
    else if (value && question.kind === "rating" && !["1", "2", "3", "4", "5"].includes(value)) errors[question.id] = "Pilih nilai antara 1 dan 5.";
    else if (value && question.kind === "choice" && !question.options.includes(value)) errors[question.id] = "Pilih salah satu jawaban yang tersedia.";
    else if (value.length > 3000) errors[question.id] = "Jawaban maksimal 3.000 karakter.";
  }
  return errors;
}

export async function postSubmission(url: string, payload: unknown): Promise<ApiResult<{ id: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("ok" in result) || !("message" in result) || typeof result.message !== "string") {
      throw new Error("Invalid response");
    }
    if (!response.ok || result.ok !== true) {
      return { ok: false, message: result.message || "Jawaban belum tersimpan. Silakan coba lagi.", fieldErrors: "fieldErrors" in result ? result.fieldErrors as Record<string, string[]> : undefined };
    }
    const data = "data" in result ? result.data : null;
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") throw new Error("Missing confirmation");
    return { ok: true, message: result.message, data: { id: data.id } };
  } catch {
    return { ok: false, message: "Belum ada konfirmasi dari server. Periksa koneksi lalu coba kirim kembali; percobaan ulang dengan jawaban yang sama menggunakan kunci pengiriman yang sama." };
  } finally {
    clearTimeout(timer);
  }
}

export function firstErrors(errors?: Record<string, string[]>): FieldErrors {
  return Object.fromEntries(Object.entries(errors ?? {}).map(([key, messages]) => [key, messages[0] ?? "Periksa isian ini."]));
}
