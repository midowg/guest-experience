import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Minutes, MinutesView } from "@/lib/pra-wam/minutes";

const request = vi.hoisted(() => vi.fn());
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
import { MinutesPanel } from "./MinutesPanel";

HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const SESSION = "5e550000-0000-4000-8000-000000000001";
const ACTION = "ac000000-0000-4000-8000-000000000001";
const RAJA = "11111111-1111-4111-8111-111111111111";
const telegram = (patch: Partial<MinutesView["telegram"]> = {}): MinutesView["telegram"] =>
  ({ ready: true, reason: null, destinations: ["Werkudara CoE · Center of Excellence"], deliveries: [], ...patch });
const view = (patch: Partial<MinutesView> = {}): MinutesView => ({
  migrated: true, needed: true, status: "belum", minutes: null, canWrite: true, open: true, viewerId: "me", endsAt: "2026-11-10T03:00:00.000Z", drafts: true,
  people: [{ id: RAJA, name: "Raja" }, { id: "me", name: "Saya" }], telegram: telegram(), ...patch,
});
const written = (patch: Partial<Minutes> = {}): Minutes => ({
  summary: "Bahas target Q1", decisions: "Target naik 10%", submittedBy: "Raja", submittedAt: "2026-11-10T04:00:00.000Z", updatedBy: "Raja", updatedAt: "2026-11-10T04:00:00.000Z",
  actions: [{ id: ACTION, task: "Kirim data penjualan", picId: "me", picName: "Saya", dueDate: "2026-11-14", done: false }],
  sentAt: "2026-11-10T04:00:00.000Z", sentBy: "Raja", version: 1, telegramOff: false, ...patch,
});

beforeEach(() => request.mockReset());
afterEach(cleanup);

function fill() {
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  fireEvent.change(screen.getByLabelText("Ringkasan"), { target: { value: "Bahas target Q1" } });
  fireEvent.change(screen.getByLabelText("Keputusan"), { target: { value: "Target naik 10%" } });
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.change(screen.getByLabelText("Tugas 1"), { target: { value: "Kirim data penjualan" } });
  fireEvent.change(screen.getByLabelText("PIC tugas 1"), { target: { value: RAJA } });
  fireEvent.change(screen.getByLabelText("Tenggat tugas 1"), { target: { value: "2026-11-14" } });
}
const body = (send: boolean, telegramOff = false) => ({
  summary: "Bahas target Q1", decisions: "Target naik 10%", send, telegramOff,
  // An empty second row is left out.
  actions: [{ task: "Kirim data penjualan", picId: RAJA, dueDate: "2026-11-14", done: false }],
});

it("keeps a draft to those in the meeting: Simpan draf sends nothing", async () => {
  request.mockResolvedValue({ data: view({ status: "draf", minutes: written({ sentAt: null, sentBy: null, version: 0 }) }), message: "Draf disimpan. Belum dikirim ke siapa pun." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  expect(screen.getByText("MoM belum diisi")).toBeTruthy();
  fill();
  expect(screen.getByText(/Simpan draf hanya terlihat oleh yang ikut meeting/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]).toEqual([`/api/wam/sessions/${SESSION}/minutes`, { method: "PUT", json: body(false) }]);
  expect(await screen.findByText(/Draf: belum dikirim ke siapa pun/)).toBeTruthy();
  expect(screen.getByText("MoM masih draf")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Lanjutkan draf/ })).toBeTruthy();
});

it("names where Kirim MoM goes before it goes, and sends nothing when cancelled", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written(), telegram: telegram({ deliveries: [{ title: "Werkudara CoE · Center of Excellence", status: "terkirim", error: null, version: 1, at: "2026-11-10T04:00:00.000Z" }] }) }), message: "MoM dikirim." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  let dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(dialog.getByText(/ke grup Telegram Werkudara CoE · Center of Excellence/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(request).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Kirim MoM" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual(body(true));
  expect(await screen.findByText("MoM dikirim.")).toBeTruthy();
  expect(screen.getByText(/Telegram: Werkudara CoE · Center of Excellence \(versi 1\)/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Unduh PDF/ }).getAttribute("href")).toBe(`/api/wam/sessions/${SESSION}/minutes/pdf`);
});

it("says when a group is missing, a meeting still runs, or the MoM stays out of Telegram", async () => {
  render(<MinutesPanel sessionId={SESSION} initial={view({ endsAt: "2999-01-01T03:00:00.000Z", telegram: telegram({ destinations: [] }) })} />);
  fill();
  fireEvent.click(screen.getByRole("checkbox", { name: /Jangan kirim ke Telegram/ }));
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(dialog.getByText(/Meeting ini belum selesai/)).toBeTruthy();
  expect(dialog.getByText(/tidak dikirim ke Telegram/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Jangan kirim ke Telegram/ }));
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  expect(within(await screen.findByRole("dialog", { name: "Kirim MoM?" })).getByText(/Belum ada grup Telegram untuk peserta meeting ini/)).toBeTruthy();
});

it("saves a sent MoM as a new version, keeping each follow-up's id, and shows a failed group", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written({ version: 2 }) }), message: "Perubahan disimpan sebagai versi 2." });
  render(<MinutesPanel sessionId={SESSION} initial={view({
    status: "sudah", minutes: written(),
    telegram: telegram({ deliveries: [{ title: "Werkudara SM · Commercial", status: "gagal", error: "Bot sudah tidak ada di grup.", version: 1, at: null }] }),
  })} />);
  expect(screen.getByText(/Werkudara SM · Commercial: Bot sudah tidak ada di grup/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Ubah notulen/ }));
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.getByText(/Disimpan sebagai versi 2. Pesan MoM di Telegram ikut diganti tanpa bunyi/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json.actions).toEqual([{ id: ACTION, task: "Kirim data penjualan", picId: "me", dueDate: "2026-11-14", done: false }]);
  expect(request.mock.calls[0][1].json.send).toBe(false);
});

it("lets the PIC tick a follow-up done without writing the MoM; others only read", async () => {
  request.mockResolvedValue({ data: { ...written().actions[0], done: true }, message: "Tindak lanjut ditandai selesai." });
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written(), canWrite: false })} />);
  expect(screen.queryByRole("button", { name: /Ubah notulen/ })).toBeNull();
  const box = screen.getByRole("checkbox", { name: /Kirim data penjualan/ });
  fireEvent.click(box);
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/wam/sessions/${SESSION}/minutes/actions/${ACTION}`, { method: "PATCH", json: { done: true } }));
  await waitFor(() => expect((screen.getByRole("checkbox", { name: /Kirim data penjualan/ }) as HTMLInputElement).checked).toBe(true));
  unmount();
  // A reader who is not its PIC sees it, without a checkbox.
  render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written(), canWrite: false, viewerId: "hod" })} />);
  const panel = within(screen.getByRole("region", { name: "Notulen" }));
  expect(panel.queryByRole("checkbox")).toBeNull();
  expect(panel.getByText(/PIC Saya · tenggat/)).toBeTruthy();
});

it("shows a reader only that a draft is being written", () => {
  render(<MinutesPanel sessionId={SESSION} initial={view({ status: "draf", minutes: null, canWrite: false })} />);
  expect(screen.getByText("Notulen sedang ditulis.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Unduh PDF/ })).toBeNull();
});

it("before the drafts migration, saves straight away as before", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written(), drafts: false }), message: "Notulen disimpan." });
  render(<MinutesPanel sessionId={SESSION} initial={view({ drafts: false, telegram: telegram({ ready: false, reason: "Pengiriman MoM ke Telegram menunggu pembaruan sistem.", destinations: [] }) })} />);
  fill();
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /Jangan kirim ke Telegram/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Simpan notulen" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual(body(false));
});

it("waits for the meeting to start, and for the migration", () => {
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "belum-waktunya", canWrite: false, open: false })} />);
  expect(screen.getByText("Notulen bisa ditulis setelah meeting dimulai.")).toBeTruthy();
  unmount();
  render(<MinutesPanel sessionId={SESSION} initial={view({ migrated: false, canWrite: false })} />);
  expect(screen.getByText(/setelah pembaruan sistem selesai/)).toBeTruthy();
});
