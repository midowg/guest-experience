import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ParticipationMeter, SurveyRecap } from "./SurveyRecap";

afterEach(cleanup);

it("shows participation like B4, the questions BOD may read, and nothing of what only HR reads", () => {
  render(<>
    <ParticipationMeter participation={{ done: 40, active: 57 }} />
    <SurveyRecap sections={[
      { key: "E", title: "Kerja bareng", anonymous: false, notSplit: false, items: [
        { key: "E6", prompt: "Jam berapa otakmu paling segar?", kind: "single", visibility: "fasil", answered: 40, several: false, body: { type: "bars", rest: 0, bars: [{ label: "Pagi", count: 22 }, { label: "Siang", count: 11 }] } },
        { key: "E3", prompt: "Satu hal yang ingin kamu minta?", kind: "long", visibility: "fasil", answered: 9, several: false, body: { type: "quotes", quotes: [{ text: "Ada sesi pagi sebelum acara utama.", count: 6 }, { text: "A", count: 1 }, { text: "B", count: 1 }, { text: "C", count: 1 }] } },
      ] },
      { key: "A", title: "Nyaman saat menginap", anonymous: false, notSplit: false, items: [
        { key: "16", prompt: "Ada kondisi kesehatan?", kind: "long", visibility: "hronly", answered: 0, several: false, body: { type: "needs-hr" } },
      ] },
      { key: "D", title: "Ruang anonim", anonymous: true, notSplit: false, items: [
        { key: "D4", prompt: "Didengar?", kind: "single", visibility: "anon", answered: 3, several: false, body: { type: "few" } },
      ] },
    ]} />
  </>);
  expect(screen.getByText("40 dari 57 · 70%")).toBeTruthy();
  expect(screen.getByRole("img", { name: "40 dari 57 karyawan aktif selesai mengisi, 70 persen" })).toBeTruthy();
  expect(screen.getByText("Pagi")).toBeTruthy();
  expect(screen.getByText("“Ada sesi pagi sebelum acara utama.”")).toBeTruthy();
  expect(screen.getByText("Lihat semua (4)")).toBeTruthy();
  expect(screen.queryByText("Ada kondisi kesehatan?")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Nyaman saat menginap" })).toBeNull();
  expect(screen.getByText(/Baru 3 jawaban. Tampil mulai 5 jawaban/)).toBeTruthy();
});
