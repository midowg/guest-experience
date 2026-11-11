import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnswerTable as Table } from "@/lib/server/pra-wam/answer-table";
import { AnswerTable } from "./AnswerTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const table: Table = {
  formName: "Cerita Kita", outside: 1,
  sections: [{ id: "s0", title: "Kenalan dulu" }, { id: "sA", title: "Nyaman saat menginap" }],
  columns: [
    { key: "1", number: 1, prompt: "Siapa nama lengkap dan nama panggilanmu?", section: "Kenalan dulu", sectionId: "s0", visibility: "rekan" },
    { key: "16", number: 2, prompt: "Ada kondisi kesehatan atau obat rutin?", section: "Nyaman saat menginap", sectionId: "sA", visibility: "hronly" },
  ],
  rows: [
    { id: "a", name: "Ayu Lestari", department: "Comms", state: "selesai", sectionsDone: 5, sectionsTotal: 5, lastActivity: "2026-11-10T03:00:00Z", cells: { 1: "Ayu Lestari (Ayu)", 16: "Asma, bawa inhaler" } },
    { id: "b", name: "Bima Putra", department: "Finance", state: "belum", sectionsDone: 0, sectionsTotal: 5, lastActivity: null, cells: {} },
  ],
  counts: { selesai: 1, sedang: 0, belum: 1 },
};

it("shows a row per person with every answer, HR and Rahasia included, and filters", () => {
  render(<AnswerTable table={table} reminder={{ open: true, last: null }} />);
  const grid = screen.getByRole("table");
  expect(within(grid).getByText("Asma, bawa inhaler")).toBeTruthy();
  expect(within(grid).getByText("Rahasia")).toBeTruthy();
  expect(within(grid).getAllByRole("row")).toHaveLength(3);
  expect(within(grid).getAllByLabelText("Belum dijawab")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: /Belum mulai/ }));
  expect(within(screen.getByRole("table")).queryByText("Ayu Lestari")).toBeNull();
  expect(screen.getByRole("button", { name: /Ingatkan yang belum mulai \(1\)/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /^Semua/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "Bagian" }), { target: { value: "s0" } });
  expect(within(screen.getByRole("table")).queryByText("Asma, bawa inhaler")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari nama atau departemen" }), { target: { value: "finance" } });
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /Unduh Excel/ }).getAttribute("href")).toBe("/api/admin/wam/questionnaire/table");
  expect(screen.getByText(/1 orang yang sudah menjawab tidak tampil/)).toBeTruthy();
});

it("searches the answers (the words marked) or the questions, and keeps who gave one answer to one question", () => {
  const { container } = render(<AnswerTable table={table} reminder={{ open: true, last: null }} />);
  // In the answers: only Ayu has "inhaler", and the word is marked.
  fireEvent.change(screen.getByRole("combobox", { name: "Cari di" }), { target: { value: "jawaban" } });
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari di jawaban" }), { target: { value: "INHALER" } });
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  expect(container.querySelector("mark")?.textContent).toBe("inhaler");
  // In the questions: only the matching column stays.
  fireEvent.change(screen.getByRole("combobox", { name: "Cari di" }), { target: { value: "pertanyaan" } });
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), { target: { value: "kesehatan" } });
  expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(3);
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
  fireEvent.change(screen.getByRole("searchbox", { name: "Cari pertanyaan" }), { target: { value: "tidak ada" } });
  expect(screen.getByText("Tidak ada pertanyaan yang cocok dengan pencarian ini.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hapus saringan" }));
  // Saring jawaban: one question, then one answer, or none given.
  const answer = screen.getByRole("combobox", { name: "Jawaban untuk disaring" }) as HTMLSelectElement;
  expect(answer.disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "Pertanyaan untuk disaring" }), { target: { value: "16" } });
  expect([...answer.options].map(option => option.textContent)).toEqual(["Semua jawaban", "Asma", "bawa inhaler", "Belum dijawab"]);
  fireEvent.change(answer, { target: { value: "Asma" } });
  expect(within(screen.getByRole("table")).getByText("Ayu Lestari")).toBeTruthy();
  expect(within(screen.getByRole("table")).queryByText("Bima Putra")).toBeNull();
  fireEvent.change(answer, { target: { value: "__belum_dijawab__" } });
  expect(within(screen.getByRole("table")).getByText("Bima Putra")).toBeTruthy();
  expect(within(screen.getByRole("table")).queryByText("Ayu Lestari")).toBeNull();
});
