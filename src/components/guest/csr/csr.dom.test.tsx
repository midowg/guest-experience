import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors, startingDonation, type DonationRecord } from "@/lib/donations";
import { createSeedEvent } from "@/lib/seed-event";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function event(overrides: Partial<ReturnType<typeof startingDonation>> = {}) {
  const donation = { ...startingDonation(), accounts: [{ id: "a1", bank: "BCA", number: "123 456 7890", holder: "Yayasan Peduli" }], goodsNote: "Antar ke kantor Werkudara.", ...overrides };
  return { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000c1", slug: "berbagi", event_kind: "csr" as const, status: "published" as const, title: "Berbagi Bersama Anak Panti", organizer: "Werkudara Peduli", donation };
}
const record = (overrides: Partial<DonationRecord>): DonationRecord => ({
  id: crypto.randomUUID(), event_id: "e", item_key: "dana", item_label: "Dana", category: "fund", amount: 100000, unit: "Rp", donor_name: "Sari", display: "name",
  donor_phone: "081234567890", message: "", proof_key: "", status: "received", received_amount: null, reject_reason: "", verified_at: "2026-10-20T00:00:00Z", notified_at: null, created_at: "2026-10-20T00:00:00Z", ...overrides,
});
function show(e = event(), records: DonationRecord[] = [], preview = true) {
  render(<CsrExperience event={e} preview={preview} view={{ totals: donationTotals(e.donation, records), donors: publicDonors(e.donation, records), ready: true }} />);
}

it("shows what was collected and who gave, as each donor chose", () => {
  show(event(), [record({ donor_name: "Sari Dewi" }), record({ donor_name: "Budi", display: "hamba_allah", item_key: "sembako", item_label: "Sembako", category: "goods", amount: 5, unit: "paket" }), record({ donor_name: "Rahasia", display: "hidden" }), record({ status: "pending", amount: 9_000_000 })]);
  const collected = screen.getByRole("region", { name: "Terkumpul" });
  expect(within(collected).getByText("Rp 200.000")).toBeTruthy();
  expect(within(collected).getByText("3 orang baik", { exact: false })).toBeTruthy();
  expect(within(collected).getByText(/1 donasi menunggu konfirmasi/)).toBeTruthy();
  const list = screen.getByRole("region", { name: "Daftar donatur" });
  expect(within(list).getByText("Sari Dewi")).toBeTruthy();
  expect(within(list).getByText("Hamba Allah")).toBeTruthy();
  expect(within(list).queryByText("Rahasia")).toBeNull();
  expect(within(list).queryByText("Budi")).toBeNull();
});

it("hides the donor list and money when the admin switches them off", () => {
  const e = event({ show: { ...startingDonation().show, donors: false, fundTotal: false } });
  show(e, [record({})]);
  expect(screen.queryByRole("region", { name: "Daftar donatur" })).toBeNull();
  expect(screen.queryByText("Rp 100.000")).toBeNull();
});

it("fills the gift from a chip, shows the bank account only for money, and thanks the donor", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /Donasi sekarang/ }));
  const form = screen.getByRole("dialog", { name: "Donasi" });
  fireEvent.click(within(form).getByRole("button", { name: "Sembako" }));
  expect((within(form).getByRole("textbox", { name: "Atau tulis sendiri" }) as HTMLInputElement).value).toBe("Sembako");
  expect(within(form).getByText("paket")).toBeTruthy();
  expect(within(form).getByText("Antar ke kantor Werkudara.")).toBeTruthy();
  expect(within(form).queryByText("123 456 7890")).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  expect(within(form).getByText("123 456 7890")).toBeTruthy();
  expect(within(form).getAllByRole("radio")).toHaveLength(3);
  fireEvent.click(within(form).getByRole("button", { name: "100 rb" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari Dewi" } });
  fireEvent.click(within(form).getByRole("radio", { name: /Hamba Allah/ }));
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  expect(screen.getByText("Dana Rp 100.000")).toBeTruthy();
});

it("sends the donation with its proof as a form, and remembers it on this phone", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: "x" }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  show(event(), [], false);
  fireEvent.click(screen.getByRole("button", { name: /Donasi sekarang/ }));
  const form = screen.getByRole("dialog", { name: "Donasi" });
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nominal" }), { target: { value: "Rp 75.000" } });
  fireEvent.change(within(form).getByLabelText(/Unggah bukti transfer/), { target: { files: [new File(["x"], "bukti.jpg", { type: "image/jpeg" })] } });
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Rina" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/events/berbagi/donation");
  const body = init.body as FormData;
  expect(JSON.parse(String(body.get("payload")))).toMatchObject({ item_key: "dana", category: "fund", amount: 75000, donor_name: "Rina", display: "name" });
  expect((body.get("proof") as File).name).toBe("bukti.jpg");
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  expect(localStorage.getItem("wk_donasi_10f3a511-2331-40")).toContain("Dana Rp 75.000");
});

it("asks for a proof when the admin requires one, and says when donations are closed", () => {
  show(event({ proofRequired: true }));
  fireEvent.click(screen.getByRole("button", { name: /Donasi sekarang/ }));
  const form = screen.getByRole("dialog", { name: "Donasi" });
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.click(within(form).getByRole("button", { name: "50 rb" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Unggah bukti transfer.")).toBeTruthy();
  cleanup();
  show(event({ enabled: false }));
  expect(screen.queryByRole("button", { name: /Donasi sekarang/ })).toBeNull();
  expect(screen.getByText(/sudah ditutup/)).toBeTruthy();
});
