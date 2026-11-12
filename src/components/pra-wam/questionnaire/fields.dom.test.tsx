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

it("asks what Lainnya is when it is chosen, in a single and a multi question", () => {
  const onChange = vi.fn<(value: AnswerValue, typing?: boolean) => void>();
  const single = question({ kind: "single", options: ["Musik", "Lainnya"] });
  const { rerender } = render(<QuestionField question={single} value="Musik" onChange={onChange} labelledBy="h" departments={[]} people={[]} />);
  expect(screen.queryByLabelText(/tulis sendiri/)).toBeNull();
  rerender(<QuestionField question={single} value="Lainnya: Bad" onChange={onChange} labelledBy="h" departments={[]} people={[]} />);
  expect(screen.getByRole("button", { name: "Lainnya" }).getAttribute("aria-pressed")).toBe("true");
  const field = screen.getByLabelText("Lainnya, tulis sendiri:") as HTMLInputElement;
  expect(field.value).toBe("Bad");
  fireEvent.change(field, { target: { value: "Badminton" } });
  expect(onChange).toHaveBeenLastCalledWith("Lainnya: Badminton", true);
  // Tapping the chosen Lainnya again keeps what was written.
  onChange.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Lainnya" }));
  expect(onChange).not.toHaveBeenCalled();
  cleanup();

  const multi = question({ kind: "multi", options: ["Outdoor", "Lainnya"], maxChoices: null });
  render(<QuestionField question={multi} value={["Outdoor", "Lainnya: Mem"]} onChange={onChange} labelledBy="h" departments={[]} people={[]} />);
  fireEvent.change(screen.getByLabelText("Lainnya, tulis sendiri:"), { target: { value: "Memancing" } });
  expect(onChange).toHaveBeenLastCalledWith(["Outdoor", "Lainnya: Memancing"], true);
  fireEvent.click(screen.getByRole("button", { name: "Lainnya" }));
  expect(onChange).toHaveBeenLastCalledWith(["Outdoor"]);
});
