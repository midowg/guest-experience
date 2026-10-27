import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors, startingDonation, type DonationRecord } from "@/lib/donations";
import { createSeedEvent } from "@/lib/seed-event";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function event(overrides: Partial<ReturnType<typeof startingDonation>> = {}) {
  const donation = { ...startingDonation(), accounts: [{ id: "a1", bank: "BCA", number: "123 456 7890", holder: "Yayasan Peduli" }], goodsNote: "Antar ke kantor Werkudara.", ...overrides };
  return { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000c1", slug: "berbagi", event_kind: "csr" as const, status: "published" as const, title: "Friday Sharing", organizer: "Werkudara Peduli", donation };
}
const record = (overrides: Partial<DonationRecord>): DonationRecord => ({
  id: crypto.randomUUID(), event_id: "e", item_key: "dana", item_label: "Dana", category: "fund", amount: 100000, unit: "Rp", donor_name: "Sari", display: "name",
  donor_phone: "081234567890", message: "", proof_key: "", status: "received", received_amount: null, reject_reason: "", verified_at: "2026-10-20T00:00:00Z", notified_at: null, created_at: "2026-10-20T00:00:00Z", ...overrides,
});
function show(e = event(), records: DonationRecord[] = [], preview = true) {
  render(<CsrExperience event={e} preview={preview} view={{ totals: donationTotals(e.donation, records), donors: publicDonors(e.donation, records), ready: true }} />);
}
const openForm = () => { fireEvent.click(screen.getByRole("button", { name: /Donasi sekarang/ })); return screen.getByRole("dialog", { name: "Donasi" }); };

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

it("names where the help goes, when the committee lists recipients", () => {
  show(event({ recipients: [{ id: "p1", name: "Panti Asuhan Kasih Ibu", place: "Sleman", description: "60 anak", photo: { url: "", alt: "", srcset: [] } }, { id: "p2", name: "Sekolah Harapan", place: "", description: "", photo: { url: "", alt: "", srcset: [] } }] }));
  const recipients = screen.getByRole("region", { name: "Disalurkan ke" });
  expect(within(recipients).getByText("Panti Asuhan Kasih Ibu")).toBeTruthy();
  expect(within(recipients).getByText("Sekolah Harapan")).toBeTruthy();
  cleanup();
  show();
  expect(screen.queryByRole("region", { name: "Disalurkan ke" })).toBeNull();
});

it("hides the donor list and money when the admin switches them off", () => {
  show(event({ show: { ...startingDonation().show, donors: false, fundTotal: false } }), [record({})]);
  expect(screen.queryByRole("region", { name: "Daftar donatur" })).toBeNull();
  expect(screen.queryByText("Rp 100.000")).toBeNull();
});

it("takes several gifts at once, shows the bank account only for money, and reassures about the name", async () => {
  show();
  const form = openForm();
  fireEvent.click(within(form).getByRole("button", { name: "Sembako" }));
  fireEvent.click(within(form).getByRole("button", { name: "Buku tulis" }));
  expect(within(form).getByText("Antar ke kantor Werkudara.")).toBeTruthy();
  expect(within(form).queryByText("123 456 7890")).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: "Tambah Buku tulis" }));
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  expect(within(form).getByText("123 456 7890")).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "100 rb" }));
  fireEvent.click(within(form).getByRole("button", { name: /Beras 5 kg/ }));
  fireEvent.click(within(form).getByRole("button", { name: /Selimut/ }));
  expect((within(form).getByRole("textbox", { name: /Bantuan lain/ }) as HTMLTextAreaElement).value).toBe("Beras 5 kg, Selimut");
  expect(within(form).getByText(/tetap dikonfirmasi panitia/)).toBeTruthy();
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari Dewi" } });
  fireEvent.click(within(form).getByRole("radio", { name: /Hamba Allah/ }));
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  for (const gift of ["Dana Rp 100.000", "Sembako 1 paket", "Buku tulis 2 pcs", "Beras 5 kg, Selimut"]) expect(screen.getByText(gift)).toBeTruthy();
});

it("sends one donation per gift with the proof on the money, and remembers them on this phone", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: "x" }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  show(event(), [], false);
  const form = openForm();
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nominal dana" }), { target: { value: "Rp 75.000" } });
  fireEvent.click(within(form).getByRole("button", { name: "Sembako" }));
  fireEvent.change(within(form).getByLabelText(/Unggah bukti transfer/), { target: { files: [new File(["x"], "bukti.jpg", { type: "image/jpeg" })] } });
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Rina" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const bodies = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({ url, data: init.body as FormData }));
  expect(bodies.every(body => body.url === "/api/events/berbagi/donation")).toBe(true);
  const payloads = bodies.map(body => JSON.parse(String(body.data.get("payload"))));
  expect(payloads).toEqual([expect.objectContaining({ item_key: "dana", amount: 75000, donor_name: "Rina" }), expect.objectContaining({ item_key: "sembako", amount: 1, unit: "paket" })]);
  expect(payloads[0].idempotency_key).not.toBe(payloads[1].idempotency_key);
  expect((bodies[0].data.get("proof") as File).name).toBe("bukti.jpg");
  expect(bodies[1].data.get("proof")).toBeNull();
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  expect(localStorage.getItem("wk_donasi_10f3a511-2331-40")).toContain("Dana Rp 75.000, Sembako 1 paket");
});

it("asks for a gift, a proof when required, and says when donations are closed", () => {
  show(event({ proofRequired: true }));
  const form = openForm();
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Pilih atau tulis bantuan yang ingin diberikan.")).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.click(within(form).getByRole("button", { name: "50 rb" }));
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Unggah bukti transfer.")).toBeTruthy();
  cleanup();
  show(event({ enabled: false }));
  expect(screen.queryByRole("button", { name: /Donasi sekarang/ })).toBeNull();
  expect(screen.getByText(/sudah ditutup/)).toBeTruthy();
});
