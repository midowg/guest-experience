import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnswerValue, QQuestion } from "@/lib/pra-wam/questionnaire";
import { QuestionField } from "./fields";

afterEach(cleanup);

const question = (extra: Partial<QQuestion>): QQuestion => ({
  id: "q", sectionId: "s", key: "D1", prompt: "Seberapa terasa?", kind: "matrix", required: true, visibility: "anon", options: [], maxChoices: null,
  matrixRows: ["Hospitality", "Inclusivity", "Sustainability"], scale: ["Belum terasa", "Sedikit", "Terasa"], placeholder: "", note: "", react: "",
  showIf: null, sort: 0, hidden: false, ...extra,
});

it("keeps every matrix row when several are tapped before the next render", () => {
  const onChange = vi.fn<(value: AnswerValue) => void>();
  // The parent never re-renders with the new value, as when taps land in one tick.
  render(<QuestionField question={question({})} value={undefined} onChange={onChange} labelledBy="h" departments={[]} people={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Hospitality: 3, Terasa" }));
  fireEvent.click(screen.getByRole("button", { name: "Inclusivity: 2, Sedikit" }));
  fireEvent.click(screen.getByRole("button", { name: "Sustainability: 3, Terasa" }));
  expect(onChange).toHaveBeenLastCalledWith({ Hospitality: "Terasa", Inclusivity: "Sedikit", Sustainability: "Terasa" });
});

it("keeps every choice of a multi question tapped quickly", () => {
  const onChange = vi.fn<(value: AnswerValue) => void>();
  render(<QuestionField question={question({ kind: "multi", options: ["Musik", "Game", "Film"], maxChoices: 3 })} value={undefined} onChange={onChange} labelledBy="h" departments={[]} people={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Musik" }));
  fireEvent.click(screen.getByRole("button", { name: "Film" }));
  expect(onChange).toHaveBeenLastCalledWith(["Musik", "Film"]);
});
