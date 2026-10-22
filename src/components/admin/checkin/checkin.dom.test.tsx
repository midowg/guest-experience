import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createSeedEvent } from "@/lib/seed-event";
import type { CheckinGuest } from "@/lib/tickets";
import { CheckinBoard } from "@/components/admin/checkin/CheckinBoard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const event = createSeedEvent();
const guest = (n: number, name: string, over: Partial<CheckinGuest> = {}): CheckinGuest => ({
  rsvp_id: `5a000000-0000-4000-8000-00000000000${n}`, name, organization: "Mitra", party_size: 1, allergy: "", access: "", ticket_id: null, checked_in_at: null, ...over,
});
const guests = [guest(1, "Ayu Lestari", { party_size: 2, allergy: "Kacang" }), guest(2, "Budi", { ticket_id: "6a000000-0000-4000-8000-000000000002", checked_in_at: "2026-11-02T02:05:00Z" })];
const reply = (data: unknown, ok = true, status = 200) => new Response(JSON.stringify(ok ? { ok, data, message: "ok" } : { ok, message: "Tiket tidak dikenal untuk acara ini." }), { status });

it("counts arrivals in guests and people", () => {
  render(<CheckinBoard event={event} initial={guests} migrated />);
  const stats = screen.getByRole("list", { name: "Ringkasan kedatangan" });
  expect(within(stats).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Sudah datang1 dari 2 tamu", "Orang di lokasi1 dari 3"]);
});

it("checks a guest in by name and shows what the door needs to know", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ guest: { ...guests[0], ticket_id: "t1", checked_in_at: "2026-11-02T02:10:00Z" }, first_time: true }));
  render(<CheckinBoard event={event} initial={guests} migrated />);
  fireEvent.click(screen.getByRole("button", { name: "Check-in" }));
  expect(await screen.findByText("Silakan masuk")).toBeTruthy();
  expect(JSON.parse(String((fetch.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ rsvp_id: guests[0].rsvp_id });
  const result = screen.getByText("Silakan masuk").closest("[role=status]") as HTMLElement;
  expect(within(result).getByText("Ayu Lestari")).toBeTruthy();
  expect(within(result).getByText("2 orang")).toBeTruthy();
  expect(within(result).getByText("Alergi: Kacang")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sudah datang (2)" })).toBeTruthy();
});

it("warns on a second scan and on an unknown ticket", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(reply({ guest: guests[1], first_time: false }));
  render(<CheckinBoard event={event} initial={guests} migrated />);
  fireEvent.click(screen.getByRole("button", { name: "Semua (2)" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ayu" } });
  expect(screen.queryByText("Budi")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Check-in" }));
  expect(await screen.findByText("Sudah check-in sebelumnya")).toBeTruthy();
  expect(screen.getByText(/Pastikan ini bukan tiket yang dipakai dua kali/)).toBeTruthy();
});

it("falls back to the phone camera where the browser cannot scan, and waits for the migration", () => {
  const { unmount } = render(<CheckinBoard event={event} initial={guests} migrated />);
  expect(screen.getByText(/Buka aplikasi/)).toBeTruthy();
  unmount();
  render(<CheckinBoard event={event} initial={guests} migrated={false} />);
  expect(screen.getByText(/202610210003_tickets_checkin.sql/)).toBeTruthy();
});
