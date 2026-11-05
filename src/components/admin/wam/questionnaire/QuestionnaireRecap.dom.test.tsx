import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Recap } from "@/lib/server/pra-wam/recap";
import { QuestionnaireRecap } from "./QuestionnaireRecap";

afterEach(cleanup);

const recap: Recap = {
  respondents: 12, department: null, departments: ["Comms", "Finance"], hrOpen: false,
  sections: [
    { key: "A", title: "Tentang kamu", anonymous: false, notSplit: false, items: [
      { key: "11", prompt: "Soal rokok?", kind: "single", visibility: "hr", answered: 10, several: false, body: { type: "bars", rest: 0, bars: [{ label: "Tidak merokok", count: 8 }, { label: "Merokok", count: 2 }] } },
      { key: "16", prompt: "Kondisi kesehatan?", kind: "long", visibility: "hronly", answered: 0, several: false, body: { type: "needs-hr" } },
      { key: "37", prompt: "Lagu?", kind: "text", visibility: "rekan", answered: 10, several: false, body: { type: "quotes", quotes: Array.from({ length: 10 }, (_, index) => ({ text: `Lagu ${index}`, count: index ? 1 : 2 })) } },
    ] },
    { key: "D", title: "Ruang anonim", anonymous: true, notSplit: false, items: [
      { key: "D1", prompt: "Nilai?", kind: "matrix", visibility: "anon", answered: 6, several: false, body: { type: "matrix", scale: ["Belum", "Terasa"], rows: [{ label: "Hospitality", counts: [1, 5] }] } },
      { key: "D4", prompt: "Didengar?", kind: "single", visibility: "anon", answered: 3, several: false, body: { type: "few" } },
    ] },
  ],
};

it("draws bars with counts, a matrix with numbers, quotes, and what stays locked", () => {
  render(<QuestionnaireRecap recap={recap} />);
  expect(screen.getByText("12 orang sudah menjawab. Tanpa nama; kutipan diurutkan acak.")).toBeTruthy();
  const smoke = screen.getByText("Tidak merokok").closest("li")!;
  expect(within(smoke).getByText(/^8/).textContent).toBe("8 · 80%");
  expect(screen.getAllByRole("link", { name: "Buka Data HR" }).length).toBeGreaterThan(0);
  const table = screen.getByRole("table");
  expect(within(table).getByRole("rowheader", { name: "Hospitality" })).toBeTruthy();
  expect(within(table).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["117%", "583%"]);
  expect(screen.getByText("×2")).toBeTruthy();
  expect(screen.getByText("Tampilkan semua (10)")).toBeTruthy();
  expect(screen.getByText(/Baru 3 jawaban. Rekap anonim tampil mulai 5 jawaban/)).toBeTruthy();
  expect(screen.getByRole("combobox").querySelectorAll("option")).toHaveLength(3);
});

it("does not split the anonymous section by department", () => {
  render(<QuestionnaireRecap recap={{ ...recap, department: "Comms", sections: [{ key: "D", title: "Ruang anonim", anonymous: true, notSplit: true, items: [] }] }} />);
  expect(screen.getByText(/Bagian anonim tidak dipilah per departemen/)).toBeTruthy();
  expect(screen.getByText(/di Comms/)).toBeTruthy();
});
