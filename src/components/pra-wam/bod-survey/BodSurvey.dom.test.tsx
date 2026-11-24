import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BodSurveyScreen, type BodSurveyClient } from "./BodSurvey";
import { SAMPLE_BOD_SURVEY } from "./sample";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

const client: BodSurveyClient = {
  person: vi.fn(async () => ({ name: "Adit Pratama", department: "Creative", sections: [{ title: "Tentang kamu", answers: [{ prompt: "Hobi", answer: "Lari", level: "rekan" as const }] }] })),
  download: vi.fn(async () => ({ blob: new Blob(["x"]), name: "kuesioner-jawaban-bod.xlsx" })),
};

it("sums up every question without names, and says what BoD cannot read", () => {
  render(<BodSurveyScreen data={SAMPLE_BOD_SURVEY} client={client} />);
  expect(screen.getByText(/dari 57 karyawan selesai/)).toBeTruthy();
  expect(screen.getByText("Olahraga")).toBeTruthy();
  expect(screen.getByText("Hanya HR yang membaca jawaban ini.")).toBeTruthy();
  expect(screen.getByText(/kurang dari 5 jawaban/)).toBeTruthy();
  expect(screen.getByText(/tanpa nama, hanya ringkasan/)).toBeTruthy();
});

it("opens a person's answers in a sheet, loaded when asked", async () => {
  render(<BodSurveyScreen data={SAMPLE_BOD_SURVEY} client={client} initialTab="orang" />);
  fireEvent.click(screen.getAllByRole("button", { name: /Selesai/ }).find(button => button.closest("li"))!);
  await waitFor(() => expect(screen.getByText("Lari")).toBeTruthy());
  expect(client.person).toHaveBeenCalledTimes(1);
});

it("exports the chosen content as an Excel file", async () => {
  URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
  render(<BodSurveyScreen data={SAMPLE_BOD_SURVEY} client={client} initialExport />);
  fireEvent.click(screen.getByRole("radio", { name: /Ringkasan/ }));
  fireEvent.click(screen.getByRole("button", { name: /Unduh Excel/ }));
  await waitFor(() => expect(screen.getByText(/Terunduh: kuesioner-jawaban-bod.xlsx/)).toBeTruthy());
  expect(client.download).toHaveBeenCalledWith("ringkasan");
});
