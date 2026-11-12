import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MinutePhoto, Minutes, MinutesView } from "@/lib/pra-wam/minutes";

const request = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => ({ prepare: vi.fn(), put: vi.fn() }));
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
vi.mock("./minutesPhotoUpload", () => ({ prepareMinutePhoto: upload.prepare, uploadMinutePhoto: upload.put }));
import { MinutesPanel } from "./MinutesPanel";

HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const SESSION = "5e550000-0000-4000-8000-000000000001";
const ACTION = "ac000000-0000-4000-8000-000000000001";
const RAJA = "11111111-1111-4111-8111-111111111111";
const telegram = (patch: Partial<MinutesView["telegram"]> = {}): MinutesView["telegram"] =>
  ({ ready: true, reason: null, destinations: ["Werkudara CoE · Center of Excellence"], deliveries: [], ...patch });
const attendees: MinutesView["attendees"] = [
  { id: RAJA, name: "Raja", fullName: "Raja Pratama", department: "Center of Excellence", position: "Head of Department", checkedIn: true },
  { id: "me", name: "Saya", fullName: "Saya Sendiri", department: "Comms", position: "Staff", checkedIn: false },
];
const view = (patch: Partial<MinutesView> = {}): MinutesView => ({
  migrated: true, needed: true, status: "belum", minutes: null, canWrite: true, open: true, viewerId: "me", endsAt: "2026-11-10T03:00:00.000Z", drafts: true,
  people: [{ id: RAJA, name: "Raja" }, { id: "me", name: "Saya" }], telegram: telegram(),
  frm: true, attendees, defaultChairId: RAJA, photos: [], photosReady: true, ...patch,
});
const written = (patch: Partial<Minutes> = {}): Minutes => ({
  summary: "", decisions: "", number: "MoM/2026/11/0012",
  items: [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }],
  chairId: RAJA, chairName: "Raja", absentIds: ["me"], guests: "", next: null,
  submittedBy: "Raja", submittedAt: "2026-11-10T04:00:00.000Z", updatedBy: "Raja", updatedAt: "2026-11-10T04:00:00.000Z",
  actions: [{ id: ACTION, task: "Kirim data penjualan", picId: "me", picName: "Saya", dueDate: "2026-11-14", done: false }],
  sentAt: "2026-11-10T04:00:00.000Z", sentBy: "Raja", version: 1, telegramOff: false, ...patch,
});
const photo = (id: string): MinutePhoto => ({ id, url: `/api/wam/sessions/${SESSION}/minutes/photos/${id}`, width: 1280, height: 720, uploadedBy: "Raja", canDelete: true });

beforeEach(() => { request.mockReset(); upload.prepare.mockReset(); upload.put.mockReset(); });
afterEach(cleanup);

function fill() {
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  fireEvent.change(screen.getByLabelText("Topik 1"), { target: { value: "Target Q1" } });
  fireEvent.change(screen.getByLabelText("Pembahasan topik 1"), { target: { value: "Bahas target Q1" } });
  fireEvent.change(screen.getByLabelText("Keputusan topik 1"), { target: { value: "Target naik 10%" } });
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.change(screen.getByLabelText("Tugas 1"), { target: { value: "Kirim data penjualan" } });
  fireEvent.change(screen.getByLabelText("PIC tugas 1"), { target: { value: RAJA } });
  fireEvent.change(screen.getByLabelText("Tenggat tugas 1"), { target: { value: "2026-11-14" } });
}
const items = [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }];
// An empty second follow-up is left out.
const actions = [{ task: "Kirim data penjualan", picId: RAJA, dueDate: "2026-11-14", done: false }];
const body = (send: boolean, telegramOff = false) => ({
  items, chairId: RAJA, absentIds: ["me"], guests: "", next: { date: null, time: null, place: "", agenda: "" }, actions, send, telegramOff,
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

it("fills the FRM form: chair from the booker, who came from check-in, new topics, others who came, and the next meeting", async () => {
  request.mockResolvedValue({ data: view({ status: "draf", minutes: written({ sentAt: null, version: 0 }) }), message: "Draf disimpan." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  expect(screen.getByText(/Nomor MoM dibuat otomatis saat pertama disimpan/)).toBeTruthy();
  expect((screen.getByLabelText("Pimpinan rapat") as HTMLSelectElement).value).toBe(RAJA);
  // Raja checked in, Saya did not: Saya starts as absent.
  expect(screen.getByText("1 dari 2 hadir")).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: /Raja Pratama/ }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: /Saya Sendiri/ }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/Center of Excellence · Head of Department · check-in/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Saya Sendiri/ }));
  expect(screen.getByText("2 dari 2 hadir")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Peserta lain yang hadir"), { target: { value: " Pak Andi (klien) " } });

  fireEvent.change(screen.getByLabelText("Topik 1"), { target: { value: "Target Q1" } });
  fireEvent.change(screen.getByLabelText("Pembahasan topik 1"), { target: { value: "Bahas target Q1" } });
  fireEvent.click(screen.getByRole("button", { name: /Tambah topik/ }));
  fireEvent.change(screen.getByLabelText("Topik 2"), { target: { value: "Seragam" } });
  fireEvent.change(screen.getByLabelText("Keputusan topik 2"), { target: { value: "Pakai batik" } });
  fireEvent.click(within(screen.getAllByRole("listitem").find(item => within(item).queryByLabelText("Topik 2"))!).getByRole("checkbox", { name: /Topik baru/ }));
  // A third, empty topic is left out.
  fireEvent.click(screen.getByRole("button", { name: /Tambah topik/ }));

  fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-11-24" } });
  fireEvent.change(screen.getByLabelText("Jam"), { target: { value: "10:00" } });
  fireEvent.change(screen.getByLabelText("Tempat atau platform"), { target: { value: "Ruang Vasuki" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual({
    items: [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "", added: false }, { topic: "Seragam", discussion: "", decision: "Pakai batik", added: true }],
    chairId: RAJA, absentIds: [], guests: "Pak Andi (klien)", next: { date: "2026-11-24", time: "10:00", place: "Ruang Vasuki", agenda: "" },
    actions: [], send: false, telegramOff: false,
  });
});

it("asks for a topic with its discussion or decision before saving", () => {
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  expect(screen.getByText("Isi minimal satu topik dengan pembahasan atau keputusannya.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Topik 1"), { target: { value: "Target Q1" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  expect(screen.getByText(/Isi pembahasan atau keputusan untuk "Target Q1"/)).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
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

it("reads a MoM as the form has it: number, chair, who came, agenda items and new topics, next meeting, photos", () => {
  render(<MinutesPanel sessionId={SESSION} initial={view({
    status: "sudah", canWrite: false, viewerId: "hod", photos: [photo("f1"), photo("f2")],
    minutes: written({
      items: [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }, { topic: "Seragam", discussion: "", decision: "Pakai batik", added: true }],
      guests: "Pak Andi (klien)", next: { date: "2026-11-24", time: "10:00", place: "Ruang Vasuki", agenda: "Survei venue" },
    }),
  })} />);
  const panel = within(screen.getByRole("region", { name: "Notulen" }));
  expect(panel.getByText("MoM/2026/11/0012")).toBeTruthy();
  expect(panel.getByText("Kehadiran · 1 dari 2 hadir")).toBeTruthy();
  expect(panel.getByText("Hadir: Raja Pratama")).toBeTruthy();
  expect(panel.getByText("Tidak hadir: Saya Sendiri")).toBeTruthy();
  expect(panel.getByText("Peserta lain: Pak Andi (klien)")).toBeTruthy();
  expect(panel.getByText("Topik baru")).toBeTruthy();
  expect(panel.getByText(/10.00 WIB · Ruang Vasuki/)).toBeTruthy();
  expect(panel.getByText("Agenda: Survei venue")).toBeTruthy();
  expect(panel.getAllByRole("link", { name: /Buka foto/ }).map(link => link.getAttribute("href"))).toEqual([photo("f1").url, photo("f2").url]);
  // A reader adds and removes nothing.
  expect(panel.queryByRole("button", { name: /foto/i })).toBeNull();
});

it("opens a MoM from before the FRM form as one agenda item, and saves a sent one as a new version keeping each follow-up's id", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written({ version: 2 }) }), message: "Perubahan disimpan sebagai versi 2." });
  render(<MinutesPanel sessionId={SESSION} initial={view({
    status: "sudah", minutes: written({ items: [], summary: "Bahas target Q1", decisions: "Target naik 10%", number: null, chairId: null, chairName: null, absentIds: [] }),
    telegram: telegram({ deliveries: [{ title: "Werkudara SM · Commercial", status: "gagal", error: "Bot sudah tidak ada di grup.", version: 1, at: null }] }),
  })} />);
  expect(screen.getByText(/Werkudara SM · Commercial: Bot sudah tidak ada di grup/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Ubah notulen/ }));
  expect((screen.getByLabelText("Topik 1") as HTMLInputElement).value).toBe("Pembahasan");
  expect((screen.getByLabelText("Pembahasan topik 1") as HTMLTextAreaElement).value).toBe("Bahas target Q1");
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.getByText(/Disimpan sebagai versi 2. Pesan MoM di Telegram ikut diganti tanpa bunyi/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const json = request.mock.calls[0][1].json;
  expect(json.items).toEqual([{ topic: "Pembahasan", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }]);
  expect(json.actions).toEqual([{ id: ACTION, task: "Kirim data penjualan", picId: "me", dueDate: "2026-11-14", done: false }]);
  expect(json.send).toBe(false);
  // Chair from the booker, everyone present: the old MoM kept no attendance.
  expect(json.chairId).toBe(RAJA);
  expect(json.absentIds).toEqual([]);
});

it("adds meeting photos one by one with progress, at most ten, and removes one after asking", async () => {
  upload.prepare.mockImplementation(async (file: File) => ({ blob: file, width: 1280, height: 720 }));
  upload.put.mockResolvedValueOnce([photo("f1")]).mockResolvedValueOnce([photo("f1"), photo("f2")]);
  const { container } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written() })} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input.multiple).toBe(true);
  fireEvent.change(input, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Buka foto/ })).toHaveLength(2));
  expect(upload.put).toHaveBeenCalledTimes(2);
  expect(upload.put.mock.calls[0][0]).toBe(SESSION);
  expect(screen.getByText("2 dari 10")).toBeTruthy();
  expect(screen.getByText(/PDF di Telegram ikut diperbarui saat notulen disimpan berikutnya/)).toBeTruthy();

  request.mockResolvedValue({ data: [photo("f2")], message: "Foto dihapus." });
  fireEvent.click(screen.getByRole("button", { name: "Hapus foto 1" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Hapus foto ini?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Hapus foto" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/wam/sessions/${SESSION}/minutes/photos/f1`, { method: "DELETE" }));
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Buka foto/ })).toHaveLength(1));
});

it("takes only the photos that fit in ten, and says how many were left out", async () => {
  const nine = Array.from({ length: 9 }, (_, index) => photo(`f${index}`));
  upload.prepare.mockImplementation(async (file: File) => ({ blob: file, width: 1280, height: 720 }));
  upload.put.mockResolvedValue([...nine, photo("f9")]);
  const { container } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written(), photos: nine })} />);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["a"], "a.jpg"), new File(["b"], "b.jpg"), new File(["c"], "c.jpg")] } });
  expect(await screen.findByText(/Paling banyak 10 foto per meeting; 2 foto tidak ditambahkan/)).toBeTruthy();
  expect(upload.put).toHaveBeenCalledTimes(1);
  // Full: no more adding.
  expect(screen.queryByRole("button", { name: /Tambah foto/ })).toBeNull();
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

it("before the FRM and drafts migrations, saves the agenda items straight away and leaves the new parts out", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written(), drafts: false, frm: false }), message: "Notulen disimpan." });
  render(<MinutesPanel sessionId={SESSION} initial={view({ drafts: false, frm: false, photosReady: false, telegram: telegram({ ready: false, reason: "Pengiriman MoM ke Telegram menunggu pembaruan sistem.", destinations: [] }) })} />);
  fill();
  expect(screen.getByText(/bisa diisi setelah pembaruan sistem selesai/)).toBeTruthy();
  expect(screen.queryByLabelText("Pimpinan rapat")).toBeNull();
  expect(screen.queryByText(/hadir$/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /Jangan kirim ke Telegram/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Simpan notulen" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual({ items, actions, send: false, telegramOff: false });
});

it("waits for the meeting to start, and for the migration", () => {
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "belum-waktunya", canWrite: false, open: false })} />);
  expect(screen.getByText("Notulen bisa ditulis setelah meeting dimulai.")).toBeTruthy();
  unmount();
  render(<MinutesPanel sessionId={SESSION} initial={view({ migrated: false, canWrite: false })} />);
  expect(screen.getByText(/setelah pembaruan sistem selesai/)).toBeTruthy();
});
