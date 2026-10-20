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
  const urls = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0]);
  await waitFor(() => expect(urls()).toContain(`/api/events/${event.slug}/i/${token}/rsvp`));
  expect(urls()).not.toContain(`/api/events/${event.slug}/rsvp`);
});

it("reports a personal link as opened once per browser session, never from the admin preview", async () => {
  window.sessionStorage.clear();
  const event = createSeedEvent();
  event.invitation_mode = "personal";
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ ok: true, message: "Tercatat." }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const opened = () => fetch.mock.calls.filter(call => String(call[0]).endsWith("/opened"));
  const { unmount } = render(<EventExperience event={event} invitation={{ name: "Tamu Acara", token, rsvp: null }} preview />);
  unmount();
  expect(opened()).toHaveLength(0);
  const first = render(<EventExperience event={event} invitation={{ name: "Tamu Acara", token, rsvp: null }} />);
  await waitFor(() => expect(opened()).toHaveLength(1));
  expect(opened()[0][0]).toBe(`/api/events/${event.slug}/i/${token}/opened`);
  first.unmount();
  render(<EventExperience event={event} invitation={{ name: "Tamu Acara", token, rsvp: null }} />);
  expect(opened()).toHaveLength(1);
});
