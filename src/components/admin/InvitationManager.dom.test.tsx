import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventInvitation } from "@/lib/server/invitations";
import { InvitationManager } from "./InvitationManager";

const event = { ...createSeedEvent(), invitation_mode: "personal" as const };
const now = "2026-10-20T03:00:00.000Z";
const guest = (n: number, over: Partial<EventInvitation> = {}): EventInvitation => ({
  id: `7a1d0000-0000-4000-8000-00000000000${n}`, event_id: event.id, name: `Tamu ${n}`, token: String(n).repeat(64), active: true,
  created_at: now, updated_at: now, phone: null, party_size_max: 1, last_sent_at: null, send_count: 0,
  first_opened_at: null, last_opened_at: null, open_count: 0, rsvp: null, ...over,
});
const yes = { id: "r1", event_id: event.id, name: "Tamu 2", organization: "", attendance: "yes" as const, phone: "", email: "", has_allergy: false, allergy_details: "", created_at: now };
const guests = [
  guest(1, { phone: "6281234567890", party_size_max: 2 }),
  guest(2, { last_sent_at: now, send_count: 1, first_opened_at: now, last_opened_at: now, open_count: 3, rsvp: yes }),
  guest(3, { last_sent_at: now, send_count: 1 }),
];
let calls: { url: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, body });
    const data = url.endsWith("/sent") ? guests.filter(g => body.ids.includes(g.id)).map(g => ({ ...g, last_sent_at: now, send_count: g.send_count + 1 }))
      : body?.rows ? body.rows.map((row: object, i: number) => guest(5 + i, row)) : null;
    return new Response(JSON.stringify({ ok: true, data, message: "OK" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("counts and filters guests by sending, opening, and answer", () => {
  render(<InvitationManager event={event} initial={guests} migrated />);
  const chips = screen.getByRole("navigation", { name: "Saring tamu" });
  expect(within(chips).getByRole("button", { name: /Belum dikirim/ }).textContent).toContain("1");
  fireEvent.click(within(chips).getByRole("button", { name: /Belum menjawab/ }));
  expect(screen.getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent).filter(Boolean)).toEqual(["Tamu 1", "Tamu 3"]);
  fireEvent.click(within(chips).getByRole("button", { name: /^Hadir/ }));
  expect(screen.getByText(/Dibuka 3×/)).toBeTruthy();
});

it("previews a pasted list, flags problems, and imports only the good rows", async () => {
  render(<InvitationManager event={event} initial={guests} migrated />);
  fireEvent.click(screen.getByText(/Impor dari Excel/));
  fireEvent.change(screen.getByLabelText("Tempel daftar tamu"), { target: { value: "Nama\tNomor WA\tPendamping\nIbu Sari\t0812 0000 1111\t1\nPak Budi\t123\t\nDuplikat\t0812 3456 7890\t" } });
  expect(screen.getByRole("status").textContent).toContain("1 siap diimpor · 1 baris perlu diperbaiki · 1 kemungkinan duplikat");
  fireEvent.click(screen.getByRole("button", { name: "Impor 1 tamu" }));
  await vi.waitFor(() => expect(calls.some(call => (call.body as { rows?: unknown })?.rows)).toBe(true));
  expect(calls.at(-1)!.body).toEqual({ rows: [{ name: "Ibu Sari", phone: "6281200001111", party_size_max: 2 }] });
  expect(await screen.findByText("1 tamu diimpor.")).toBeTruthy();
});

it("sends WhatsApp invitations one guest at a time and records each send", async () => {
  render(<InvitationManager event={event} initial={guests} migrated />);
  fireEvent.click(screen.getByRole("button", { name: /Kirim pengingat \(2 belum menjawab\)/ }));
  const queue = screen.getByRole("region", { name: "Kirim WhatsApp berurutan" });
  expect(queue.textContent).toContain("1 dari 2");
  const open = within(queue).getByRole("link", { name: /Buka WhatsApp/ });
  expect(open.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=Halo%20Tamu%201%2C%20sekadar%20mengingatkan/);
  fireEvent.click(open);
  await vi.waitFor(() => expect(calls.find(call => call.url.endsWith("/sent"))?.body).toEqual({ ids: [guests[0].id] }));
  expect(screen.getByRole("region", { name: "Kirim WhatsApp berurutan" }).textContent).toContain("2 dari 2");
});

it("keeps single adds and links working before the migration", () => {
  render(<InvitationManager event={event} initial={guests.map(g => ({ ...g, last_sent_at: null, first_opened_at: null }))} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
  expect(screen.queryByText(/Impor dari Excel/)).toBeNull();
  expect(screen.queryByLabelText("Nomor WA (opsional)")).toBeNull();
  expect(screen.queryByRole("button", { name: /Belum dibuka/ })).toBeNull();
  expect(screen.getByLabelText("Nama sapaan")).toBeTruthy();
});
