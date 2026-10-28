import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CsrExperience } from "@/components/guest/csr/CsrExperience";
import { donationTotals, publicDonors, startingDonation, type DonationRecord } from "@/lib/donations";
import { createSeedEvent } from "@/lib/seed-event";

// next/font only runs inside Next's compiler.
vi.mock("../place-guide-font", () => ({ garamond: { variable: "" } }));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function event(overrides: Partial<ReturnType<typeof startingDonation>> = {}) {
  const donation = { ...startingDonation(), accounts: [{ id: "a1", bank: "BCA", number: "123 456 7890", holder: "Yayasan Peduli" }], goodsNote: "Antar ke kantor Werkudara.", ...overrides };
  return { ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000c1", slug: "berbagi", event_kind: "csr" as const, status: "published" as const, title: "Friday Sharing", organizer: "Werkudara Peduli", donation };
}
const record = (overrides: Partial<DonationRecord>): DonationRecord => ({
  id: crypto.randomUUID(), event_id: "e", item_key: "dana", item_label: "Dana", category: "fund", amount: 100000, unit: "Rp", donor_name: "Sari", display: "name",
  donor_phone: "081234567890", message: "", proof_key: "", status: "received", received_amount: null, reject_reason: "", verified_at: "2026-10-20T00:00:00Z", notified_at: null, recipient_id: "", created_at: "2026-10-20T00:00:00Z", ...overrides,
});
function show(e = event(), records: DonationRecord[] = [], preview = true) {
  render(<CsrExperience event={e} preview={preview} view={{ totals: donationTotals(e.donation, records), donors: publicDonors(e.donation, records), ready: true }} />);
}
const openForm = () => { fireEvent.click(screen.getByRole("button", { name: /Ikut berbagi/ })); return screen.getByRole("dialog", { name: "Donasi" }); };

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

it("names where the help goes on a page of its own, when the committee lists recipients", () => {
  show(event({ recipients: [{ id: "p1", name: "Panti Asuhan Kasih Ibu", place: "Sleman", description: "60 anak", photo: { url: "", alt: "", srcset: [] } }, { id: "p2", name: "Sekolah Harapan", place: "", description: "", photo: { url: "", alt: "", srcset: [] } }] }));
  fireEvent.click(screen.getByRole("button", { name: /Disalurkan ke 2 penerima/ }));
  const recipients = screen.getByRole("dialog", { name: "Disalurkan ke" });
  expect(within(recipients).getByText("Panti Asuhan Kasih Ibu")).toBeTruthy();
  expect(within(recipients).getByText("60 anak")).toBeTruthy();
  fireEvent.click(within(recipients).getByRole("button", { name: "Kembali" }));
  expect(screen.queryByRole("dialog", { name: "Disalurkan ke" })).toBeNull();
  cleanup();
  show();
  expect(screen.queryByRole("button", { name: /Disalurkan ke/ })).toBeNull();
});

it("lists the latest donors on the page and everyone on a page of their own", () => {
  show(event(), Array.from({ length: 7 }, (_, index) => record({ donor_name: `Donatur ${index + 1}` })));
  expect(within(screen.getByRole("region", { name: "Daftar donatur" })).getAllByRole("listitem")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Lihat semua (7)" }));
  expect(within(screen.getByRole("dialog", { name: "Semua donatur" })).getAllByRole("listitem")).toHaveLength(7);
});

it("hides the donor list and money when the admin switches them off", () => {
  show(event({ show: { ...startingDonation().show, donors: false, fundTotal: false } }), [record({})]);
  expect(screen.queryByRole("region", { name: "Daftar donatur" })).toBeNull();
  expect(screen.queryByText("Rp 100.000")).toBeNull();
});

it("starts with Dana or Barang; goods are rows to fill with suggestions and an add button; the bank account only for money", async () => {
  show();
  const form = openForm();
  expect(within(form).queryByRole("textbox", { name: "Nama barang" })).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: "Barang" }));
  fireEvent.click(within(within(form).getByRole("group", { name: "Saran barang" })).getByRole("button", { name: "Sembako" }));
  expect((within(form).getByRole("textbox", { name: "Nama barang" }) as HTMLInputElement).value).toBe("Sembako");
  expect(within(form).getByText("paket")).toBeTruthy();
  expect(within(form).getByText("Antar ke kantor Werkudara.")).toBeTruthy();
  expect(within(form).queryByText("123 456 7890")).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: "Tambah jumlah Sembako" }));
  fireEvent.click(within(form).getByRole("button", { name: /Tambah barang/ }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama barang 2" }), { target: { value: "Kursi roda" } });
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  expect(within(form).getByText("123 456 7890")).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "100 rb" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari Dewi" } });
  fireEvent.click(within(form).getByRole("radio", { name: /Hamba Allah/ }));
  expect(within(form).queryByRole("textbox", { name: "Nama" })).toBeNull();
  expect(within(form).getByText(/tetap dikonfirmasi panitia/)).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  for (const gift of ["Dana Rp 100.000", "Sembako 2 paket", "Kursi roda 1 pcs"]) expect(screen.getByText(gift)).toBeTruthy();
});

it("sends one donation per gift, the transfer proof with the money and each goods photo with its goods, and remembers them", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: "x" }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  show(event(), [], false);
  const form = openForm();
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nominal dana" }), { target: { value: "Rp 75.000" } });
  fireEvent.click(within(form).getByRole("button", { name: "Barang" }));
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama barang" }), { target: { value: "sembako" } });
  fireEvent.change(within(form).getByLabelText(/Unggah bukti transfer/), { target: { files: [new File(["x"], "bukti.jpg", { type: "image/jpeg" })] } });
  fireEvent.change(within(form).getByLabelText(/Foto barang/), { target: { files: [new File(["y"], "barang.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(within(form).getByText(/barang\.jpg/)).toBeTruthy());
  await waitFor(() => expect(within(form).getByText(/bukti\.jpg/)).toBeTruthy());
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Rina" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const bodies = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({ url, data: init.body as FormData }));
  expect(bodies.every(body => body.url === "/api/events/berbagi/donation")).toBe(true);
  const payloads = bodies.map(body => JSON.parse(String(body.data.get("payload"))));
  expect(payloads).toEqual([expect.objectContaining({ item_key: "dana", amount: 75000, donor_name: "Rina" }), expect.objectContaining({ item_key: "sembako", item_label: "Sembako", amount: 1, unit: "paket" })]);
  expect(payloads[0].idempotency_key).not.toBe(payloads[1].idempotency_key);
  expect((bodies[0].data.get("proof") as File).name).toBe("bukti.jpg");
  expect((bodies[1].data.get("proof") as File).name).toBe("barang.jpg");
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
  expect(localStorage.getItem("wk_donasi_10f3a511-2331-40")).toContain("Dana Rp 75.000, Sembako 1 paket");
});

it("asks for a gift, a proof or goods photo when required, and says when donations are closed", () => {
  show(event({ proofRequired: true, goodsPhotoRequired: true }));
  const form = openForm();
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama" }), { target: { value: "Sari" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Pilih bantuan yang ingin diberikan: dana atau barang.")).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "Barang" }));
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Tulis barang yang ingin diberikan.")).toBeTruthy();
  fireEvent.change(within(form).getByRole("textbox", { name: "Nama barang" }), { target: { value: "Selimut" } });
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Unggah foto barang ini.")).toBeTruthy();
  fireEvent.click(within(form).getByRole("button", { name: "Barang" }));
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.click(within(form).getByRole("button", { name: "50 rb" }));
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  expect(within(form).getByText("Unggah bukti transfer.")).toBeTruthy();
  cleanup();
  show(event({ enabled: false }));
  expect(screen.queryByRole("button", { name: /Ikut berbagi/ })).toBeNull();
  expect(screen.getByText(/sudah ditutup/)).toBeTruthy();
});

it("asks no name from a donor who would rather not be named, and sends none", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: "x" }, message: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  show(event(), [], false);
  const form = openForm();
  fireEvent.click(within(form).getByRole("button", { name: "Dana" }));
  fireEvent.click(within(form).getByRole("button", { name: "100 rb" }));
  fireEvent.click(within(form).getByRole("radio", { name: /Jangan sebutkan/ }));
  expect(within(form).queryByRole("textbox", { name: "Nama" })).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: /Kirim donasi/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const [, init] = (fetch.mock.calls as unknown as [string, RequestInit][])[0];
  expect(JSON.parse(String((init.body as FormData).get("payload")))).toMatchObject({ donor_name: "", display: "hidden" });
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Terima kasih" })).toBeTruthy());
});
