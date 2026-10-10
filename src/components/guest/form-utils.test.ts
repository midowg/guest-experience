import { describe, expect, it } from "vitest";
import { feedbackErrors, feedbackIsOpen, firstErrors, rsvpIsOpen, submissionIdentity } from "./form-utils";
import type { FeedbackQuestion } from "@/lib/types";

const closes = "2026-10-12T10:00:00Z";
const before = Date.parse("2026-10-12T09:00:00Z");
const after = Date.parse("2026-10-12T11:00:00Z");

describe("submission windows", () => {
  it("honours the RSVP deadline", () => {
    expect(rsvpIsOpen({ rsvp_enabled: true, rsvp_closes_at: closes }, before)).toBe(true);
    expect(rsvpIsOpen({ rsvp_enabled: true, rsvp_closes_at: closes }, after)).toBe(false);
    expect(rsvpIsOpen({ rsvp_enabled: false, rsvp_closes_at: null }, before)).toBe(false);
  });
  it("keeps feedback closed until it opens and has questions", () => {
    const question: FeedbackQuestion = { id: "q1", label: "Nilai", kind: "rating", required: true, options: [], sort_order: 0 };
    expect(feedbackIsOpen({ feedback_enabled: true, feedback_opens_at: closes, feedback_questions: [question] }, before)).toBe(false);
    expect(feedbackIsOpen({ feedback_enabled: true, feedback_opens_at: closes, feedback_questions: [question] }, after)).toBe(true);
    expect(feedbackIsOpen({ feedback_enabled: true, feedback_opens_at: null, feedback_questions: [] }, after)).toBe(false);
  });
});

describe("retry identity", () => {
  let counter = 0;
  const key = () => `key-${++counter}`;
  it("reuses the key for an unchanged payload and renews it when answers change", () => {
    const first = submissionIdentity({ name: "Tamu" }, null, key);
    expect(submissionIdentity({ name: "Tamu" }, first, key).key).toBe(first.key);
    expect(submissionIdentity({ name: "Tamu Lain" }, first, key).key).not.toBe(first.key);
  });
});

describe("feedback answer checks", () => {
  const questions: FeedbackQuestion[] = [
    { id: "q1", label: "Nilai", kind: "rating", required: true, options: [], sort_order: 0 },
    { id: "q2", label: "Pilihan", kind: "choice", required: false, options: ["Ya", "Tidak"], sort_order: 1 },
  ];
  it("flags missing required answers and invalid values", () => {
    expect(feedbackErrors(questions, [{ question_id: "q1", value: "" }])).toHaveProperty("q1");
    expect(feedbackErrors(questions, [{ question_id: "q1", value: "9" }])).toHaveProperty("q1");
    expect(feedbackErrors(questions, [{ question_id: "q1", value: "4" }, { question_id: "q2", value: "Mungkin" }])).toHaveProperty("q2");
  });
  it("accepts valid answers with optional questions left blank", () => {
    expect(feedbackErrors(questions, [{ question_id: "q1", value: "5" }, { question_id: "q2", value: "" }])).toEqual({});
  });
  it("surfaces the first server error per field", () => {
    expect(firstErrors({ name: ["Terlalu pendek", "Lainnya"] })).toEqual({ name: "Terlalu pendek" });
    expect(firstErrors(undefined)).toEqual({});
  });
});
