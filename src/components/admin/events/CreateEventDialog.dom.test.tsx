import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { CreateEventDialog } from "@/components/admin/events/CreateEventDialog";

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

it("offers only the allowed templates, each as a miniature card", () => {
  render(<CreateEventDialog events={[]} templates={["kunjungan-klien", "trip-klien"]} onClose={() => {}} />);
  expect(screen.getByRole("heading", { name: "Pilih templat acara" })).toBeTruthy();
  expect(screen.getByText("Langkah 1 dari 2")).toBeTruthy();
  const cards = screen.getAllByRole("button", { name: /:/ });
  expect(cards.map(card => [...card.querySelectorAll("strong")].at(-1)?.textContent)).toEqual(["Welcome", "Trip klien"]);
  expect(screen.queryByText("Gala dinner")).toBeNull();
  expect(screen.queryByRole("button", { name: /draf kosong/ })).toBeNull();
});

it("creates an event from a template with only name, time, and place", async () => {
  render(<CreateEventDialog events={[]} templates={["kunjungan-klien", "trip-klien"]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /^Trip klien:/ }));
  expect(screen.getByRole("heading", { name: "Detail acara" })).toBeTruthy();
  const title = screen.getByRole("textbox", { name: "Nama acara" }) as HTMLInputElement;
  expect(title.value).toBe("");
  // The template's own name is offered as a chip under the field; a tap fills it in.
  const chip = within(screen.getByRole("group", { name: "Pilihan cepat: Nama acara" })).getByRole("button", { name: "Trip Lombok bersama PT Sinar Abadi" });
  fireEvent.click(chip);
  expect(title.value).toBe("Trip Lombok bersama PT Sinar Abadi");
  fireEvent.change(title, { target: { value: "" } });
  expect(screen.queryByRole("radio", { name: /Eksternal|Internal/ })).toBeNull();
  expect(screen.queryByText(/Tema|tema Werkudara/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Buat acara" }));
  expect(screen.getByText("Isi nama acara.")).toBeTruthy();
  fireEvent.change(title, { target: { value: "Trip Lombok Mitra" } });
  fireEvent.change(screen.getByLabelText(/^Mulai/), { target: { value: "2026-12-12T08:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Buat acara" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/admin/acara/5e7a0c1e-0000-4000-8000-000000000099"));
  expect(body).toMatchObject({ setup: { template: "trip-klien", title: "Trip Lombok Mitra", starts_at: "2026-12-12T01:00:00.000Z", audience: "external", language: "id", invitation_mode: "open", venue_name: "PT. Werkudara", greeting: "" } });
  expect((body!.setup as { modules: string[] }).modules).toEqual(["about", "experience", "agenda", "location", "prepare", "rsvp", "contact", "feedback"]);
});

it("can go back to choose another template", () => {
  render(<CreateEventDialog events={[]} templates={["kunjungan-klien", "trip-klien"]} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /^Welcome:/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ganti templat/ }));
  expect(screen.getByRole("heading", { name: "Pilih templat acara" })).toBeTruthy();
});

it("copies an earlier event under a new name and date", async () => {
  const source = createSeedEvent();
  render(<CreateEventDialog events={[source]} templates={[]} onClose={() => {}} />);
  expect(screen.getByText(/Belum ada templat yang tersedia/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Atau salin dari acara sebelumnya"), { target: { value: source.id } });
  expect(screen.getByText(/Salinan “Rapat Panitia Inti dan Koordinator”/)).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Nama acara" }), { target: { value: "Rapat Panitia 2027" } });
  fireEvent.change(screen.getByLabelText(/^Mulai/), { target: { value: "2027-10-12T18:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Buat acara" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalled());
  expect(body).toMatchObject({ duplicateId: source.id, setup: { template: "blank", title: "Rapat Panitia 2027" } });
});

it("lets only the super admin start from a blank draft", () => {
  render(<CreateEventDialog events={[]} canStartBlank onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /Mulai dari draf kosong/ })).toBeTruthy();
});
