import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { QQuestion, QSection } from "@/lib/pra-wam/questionnaire";
import { QuestionEditor, newDraft, toDraft, type QuestionPayload } from "./QuestionEditor";

afterEach(cleanup);

const named = "11111111-1111-4111-8111-111111111111";
const anon = "22222222-2222-4222-8222-222222222222";
const sections: QSection[] = [
  { id: named, key: "0", title: "Kenalan dulu", short: "", hello: "", intro: "", tease: "", anonymous: false, sort: 1, hidden: false },
  { id: anon, key: "D", title: "Ruang anonim", short: "", hello: "", intro: "", tease: "", anonymous: true, sort: 2, hidden: false },
];
const base: QQuestion = {
  id: "q3", sectionId: named, key: "3", prompt: "Posisimu sekarang?", kind: "single", required: true, visibility: "hr",
  options: ["Staf", "Supervisor / lead", "Manajer ke atas"], maxChoices: null, matrixRows: [], scale: [], placeholder: "", note: "", react: "", showIf: null, sort: 1, hidden: false,
};
const other: QQuestion = { ...base, id: "q31", key: "31", prompt: "Satu hal yang ingin kamu lakukan berbeda?", kind: "long", required: false, visibility: "pilih", options: [], sort: 2 };

function setup(question: QQuestion | null, onSave = vi.fn(async (payload: QuestionPayload) => { void payload; return null as Record<string, string[]> | null; })) {
  const onDraft = vi.fn();
  render(<QuestionEditor initial={question ? toDraft(question) : newDraft(sections[0])} questionKey={question?.key ?? null} sections={sections}
    questions={[base, other]} departments={["IT", "HR"]} answered={false} onDraft={onDraft} onSave={onSave} onCancel={() => {}} />);
  return { onSave, onDraft };
}

it("shows the fixed key, edits options one per line, and saves them cleaned", async () => {
  const { onSave, onDraft } = setup(base);
  expect(screen.getByText("3").tagName).toBe("CODE");
  const options = screen.getByLabelText("Pilihan") as HTMLTextAreaElement;
  expect(options.value).toBe("Staf\nSupervisor / lead\nManajer ke atas");
  fireEvent.change(options, { target: { value: "Staf\n\n  Lead  \nManajer" } });
  expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ options: "Staf\n\n  Lead  \nManajer" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Simpan pertanyaan" })); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toMatchObject({ kind: "single", options: ["Staf", "Lead", "Manajer"], required: true, visibility: "hr", showIf: null, maxChoices: null });
});

it("shows only the fields a kind needs, and checks them before sending", async () => {
  const { onSave } = setup(null);
  expect(screen.queryByLabelText("Pilihan")).toBeNull();
  expect(screen.getByLabelText("Contoh isian (placeholder)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tipe"), { target: { value: "multi" } });
  expect(screen.getByLabelText("Pilihan")).toBeTruthy();
  expect(screen.getByLabelText("Paling banyak dipilih (boleh kosong)")).toBeTruthy();
  expect(screen.queryByLabelText("Contoh isian (placeholder)")).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tambah pertanyaan" })); });
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText("Tulis pertanyaannya, minimal 2 karakter.")).toBeTruthy();
  expect(screen.getByText("Isi minimal 2 pilihan, satu per baris.")).toBeTruthy();
  expect((screen.getByLabelText("Pertanyaan") as HTMLElement).getAttribute("aria-invalid")).toBe("true");
});

it("builds a show-if rule from another question's options", async () => {
  const { onSave } = setup(other);
  const source = screen.getByLabelText("Tampil bila pertanyaan ini dijawab") as HTMLSelectElement;
  // Only choice questions can be a condition: 3, not 31 itself.
  expect([...source.options].map(option => option.value)).toEqual(["", "3"]);
  fireEvent.change(source, { target: { value: "3" } });
  fireEvent.click(screen.getByLabelText("Kecuali bila jawabannya"));
  fireEvent.click(within(screen.getByRole("group", { name: "Jawaban acuan" })).getByLabelText("Staf"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Simpan pertanyaan" })); });
  expect(onSave.mock.calls[0][0].showIf).toEqual({ question: "3", not: ["Staf"] });
});

it("moves to the anonymous section as anonymous, and shows the server's field errors", async () => {
  const onSave = vi.fn(async () => ({ prompt: ["Pertanyaan paling panjang 300 karakter."] }));
  setup(other, onSave);
  fireEvent.change(screen.getByLabelText("Bagian"), { target: { value: anon } });
  const visibility = screen.getByLabelText("Siapa yang bisa membaca") as HTMLSelectElement;
  expect(visibility.value).toBe("anon");
  expect([...visibility.options].map(option => option.value)).toEqual(["anon"]);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Simpan pertanyaan" })); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sectionId: anon, visibility: "anon" }));
  expect(screen.getByText("Pertanyaan paling panjang 300 karakter.")).toBeTruthy();
  expect(screen.getByText("Periksa isian yang ditandai.")).toBeTruthy();
});
