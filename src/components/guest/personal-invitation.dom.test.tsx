import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import { EventExperience } from "./EventExperience";

const token = "a".repeat(64);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("hides the generic RSVP form while keeping the shared event readable", () => {
  const event = createSeedEvent();
  event.invitation_mode = "personal";
  render(<EventExperience event={event} />);
  expect(screen.getByRole("heading", { name: event.title })).toBeTruthy();
  expect(screen.getByText(/Mintalah tautan pribadi kepada panitia/)).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Konfirmasi kehadiran" })).toBeNull();
});

it("shows the invitee and restores a saved response on a personal link", () => {
  const event = createSeedEvent();
  event.invitation_mode = "personal";
  render(<EventExperience event={event} invitation={{ name: "Tamu Acara", token, rsvp: {
    id: crypto.randomUUID(), event_id: event.id, invitation_id: crypto.randomUUID(),
    name: "Nama Jawaban", organization: "Komunitas", attendance: "no", phone: "08123456789", email: "", has_allergy: false,
    allergy_details: "", created_at: new Date().toISOString(),
  } }} />);
  expect(screen.getByText("Kepada Tamu Acara")).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "Nama lengkap" }) as HTMLInputElement).value).toBe("Nama Jawaban");
  expect((screen.getByRole("textbox", { name: "Instansi / komunitas" }) as HTMLInputElement).value).toBe("Komunitas");
  expect((screen.getByRole("radio", { name: "Belum dapat hadir" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Perbarui konfirmasi" })).toBeTruthy();
});

it("sends the personal token to the personal endpoint, not the generic one", async () => {
  const event = createSeedEvent();
  event.invitation_mode = "personal";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, message: "Tersimpan", data: { id: crypto.randomUUID() } }), { status: 200 })));
  render(<EventExperience event={event} invitation={{ name: "Tamu Acara", token, rsvp: null }} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Instansi / komunitas" }), { target: { value: "Komunitas" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /menyetujui penggunaan data/ }));
  fireEvent.click(screen.getByRole("button", { name: "Kirim konfirmasi" }));
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
  expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`/api/events/${event.slug}/i/${token}/rsvp`);
});
