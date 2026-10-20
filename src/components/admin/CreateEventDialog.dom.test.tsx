import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { CreateEventDialog } from "./CreateEventDialog";

vi.setConfig({ testTimeout: 20000 });
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

let body: Record<string, unknown> | null = null;
beforeEach(() => {
  push.mockClear(); body = null;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, data: { ...createSeedEvent(), id: "5e7a0c1e-0000-4000-8000-000000000099" }, message: "Draft acara dibuat." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("walks a template through four steps with empty fields, chips, and a to-do list", async () => {
  render(<CreateEventDialog events={[createSeedEvent()]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Gala dinner/ }));

  const title = screen.getByRole("textbox", { name: "Nama acara" }) as HTMLInputElement;
  expect(title.value).toBe("");
  expect(title.placeholder).toMatch(/^Contoh: /);
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
  expect(screen.getByText("Isi nama acara.")).toBeTruthy();
  fireEvent.change(title, { target: { value: "Malam Apresiasi 2026" } });
  fireEvent.change(screen.getByLabelText(/^Mulai/), { target: { value: "2026-12-12T18:00" } });
  fireEvent.click(screen.getByRole("radio", { name: /Kantor Werkudara/ }));
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));

  const greeting = screen.getByRole("textbox", { name: "Sapaan" }) as HTMLInputElement;
  expect(greeting.value).toBe("");
  const chips = within(screen.getByRole("group", { name: "Pilihan cepat: Sapaan" })).getAllByRole("button");
  expect(chips[0].textContent).toBe("Dengan hormat");
  fireEvent.click(chips[0]);
  expect(greeting.value).toBe("Dengan hormat");
  expect((screen.getByRole("textbox", { name: "Isi undangan" }) as HTMLTextAreaElement).value).toBe("");
  expect(screen.getByText(/Tiket & kursi · Segera/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));

  expect(screen.getByText("Setelah ini, lengkapi")).toBeTruthy();
  expect(screen.getByText("Kartu persiapan: Dress code")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Buat draf acara" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/events/5e7a0c1e-0000-4000-8000-000000000099"));
  expect(body).toMatchObject({ setup: { template: "gala-dinner", title: "Malam Apresiasi 2026", greeting: "Dengan hormat", introduction: "", starts_at: "2026-12-12T11:00:00.000Z", venue_name: "PT. Werkudara" } });
  expect(body).not.toHaveProperty("duplicateId");
});

it("copies an earlier event under a new name and date", async () => {
  const source = createSeedEvent();
  render(<CreateEventDialog events={[source]} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Atau salin dari acara sebelumnya"), { target: { value: source.id } });
  expect(screen.getByText(/Menyalin “Rapat Panitia Inti dan Koordinator”/)).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama acara" }), { target: { value: "Rapat Panitia 2027" } });
  fireEvent.change(screen.getByLabelText(/^Mulai/), { target: { value: "2027-10-12T18:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: "Buat draf acara" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalled());
  expect(body).toMatchObject({ duplicateId: source.id, setup: { template: "blank", title: "Rapat Panitia 2027" } });
});
