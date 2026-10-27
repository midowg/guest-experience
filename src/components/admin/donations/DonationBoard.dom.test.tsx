import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DonationBoard } from "@/components/admin/donations/DonationBoard";
import { startingDonation, type DonationRecord } from "@/lib/donations";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const eventId = "10f3a511-2331-4000-8000-0000000000c5";
const row = (n: number, overrides: Partial<DonationRecord>): DonationRecord => ({
  id: `8d000000-0000-4000-8000-00000000000${n}`, event_id: eventId, item_key: "dana", item_label: "Dana", category: "fund", amount: 100_000, unit: "Rp",
  donor_name: `Donatur ${n}`, display: "name", donor_phone: "", message: "", proof_key: "", status: "pending", received_amount: null, reject_reason: "", verified_at: null, notified_at: null,
  created_at: "2026-10-26T03:00:00.000Z", ...overrides,
});
function show(rows: DonationRecord[], delivered: string | null = null) {
  const donation = { ...startingDonation(), delivered: { ...startingDonation().delivered, at: delivered } };
  render(<DonationBoard event={{ id: eventId, title: "Berbagi Bersama Anak Panti", timezone: "Asia/Jakarta", donation }} link="https://journey.werkudara.group/AB23CD" initial={rows} migrated />);
}
const reply = (data: unknown, message = "ok") => new Response(JSON.stringify({ ok: true, data, message }), { status: 200, headers: { "Content-Type": "application/json" } });

it("receives a donation with the amount that actually came in, and counts it", async () => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => reply({ ...row(1, {}), status: "received", received_amount: JSON.parse(init!.body as string).received_amount, verified_at: "2026-10-27T00:00:00Z" }, "Donasi ditandai diterima."));
  vi.stubGlobal("fetch", fetch);
  show([row(1, { donor_name: "Sari" })]);
  const item = screen.getByText("Sari").closest("li")!;
  fireEvent.change(within(item).getByLabelText("Jumlah yang diterima"), { target: { value: "Rp 150.000" } });
  fireEvent.click(within(item).getByRole("button", { name: /Terima/ }));
  await waitFor(() => expect(screen.getByText("Donasi ditandai diterima.")).toBeTruthy());
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`/api/admin/events/${eventId}/donations/8d000000-0000-4000-8000-000000000001`);
  expect(JSON.parse(init.body as string)).toEqual({ action: "receive", received_amount: 150000 });
  expect(within(screen.getByRole("region", { name: "Ringkasan donasi" })).getByText("Rp 150.000")).toBeTruthy();
});

it("asks for a reason before rejecting", async () => {
  const fetch = vi.fn(async () => reply({ ...row(2, {}), status: "rejected", reject_reason: "Tidak ada di mutasi" }, "Donasi ditolak."));
  vi.stubGlobal("fetch", fetch);
  show([row(2, { donor_name: "Budi" })]);
  const item = screen.getByText("Budi").closest("li")!;
  fireEvent.click(within(item).getByRole("button", { name: /Tolak/ }));
  const confirm = within(item).getAllByRole("button", { name: "Tolak" }).at(-1)! as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(within(item).getByLabelText("Alasan ditolak"), { target: { value: "Tidak ada di mutasi" } });
  fireEvent.click(confirm);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ action: "reject", reason: "Tidak ada di mutasi" });
});

it("offers a WhatsApp message to each received donor with a number once the help is handed over, and marks it sent", async () => {
  const fetch = vi.fn(async () => reply({ ...row(3, {}), status: "received", donor_name: "Rina", donor_phone: "081311112222", notified_at: "2026-10-27T00:00:00Z" }, "Kabar penyerahan ditandai terkirim."));
  vi.stubGlobal("fetch", fetch);
  const received = [row(3, { donor_name: "Rina", status: "received", donor_phone: "081311112222", verified_at: "2026-10-25T00:00:00Z" }), row(4, { donor_name: "Tanpa Nomor", status: "received", verified_at: "2026-10-25T00:00:00Z" }), row(5, { donor_name: "Menunggu", donor_phone: "081399998888" })];
  show(received);
  expect(within(screen.getByRole("region", { name: "Kabar penyerahan" })).queryByRole("link", { name: /Kirim WA/ })).toBeNull();
  cleanup();
  show(received, "2026-10-26T03:00:00.000Z");
  const news = screen.getByRole("region", { name: "Kabar penyerahan" });
  const links = within(news).getAllByRole("link", { name: /Kirim WA/ });
  expect(links).toHaveLength(1);
  const url = new URL((links[0] as HTMLAnchorElement).href);
  expect(url.pathname).toBe("/6281311112222");
  expect(url.searchParams.get("text")).toContain("Halo Rina");
  expect(url.searchParams.get("text")).toContain("https://journey.werkudara.group/AB23CD");
  fireEvent.click(links[0]);
  await waitFor(() => expect(within(news).getByText("Terkirim")).toBeTruthy());
  expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ action: "notified" });
});

it("filters by status and says when the migration is missing", () => {
  show([row(1, { donor_name: "Sari" }), row(2, { donor_name: "Rina", status: "received" })]);
  expect(screen.queryByText("Rina")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Diterima/ }));
  expect(screen.getByText("Rina")).toBeTruthy();
  cleanup();
  render(<DonationBoard event={{ id: eventId, title: "x", timezone: "Asia/Jakarta", donation: startingDonation() }} link="" initial={[]} migrated={false} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
});
