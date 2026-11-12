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
  { id: RAJA, name: "Raja", fullName: "Raja Pratama", department: "Center of Excellence", position: "Head of Department", frmPosition: "Head of Department", checkedIn: true, checkInMethod: "offline" },
  { id: "me", name: "Saya", fullName: "Saya Sendiri", department: "Comms", position: "Staff", frmPosition: "Staff", checkedIn: false, checkInMethod: null },
];
const view = (patch: Partial<MinutesView> = {}): MinutesView => ({
  migrated: true, needed: true, status: "belum", minutes: null, canWrite: true, open: true, viewerId: "me", endsAt: "2026-11-10T03:00:00.000Z", drafts: true,
  title: "Review target Q1", startsAt: "2026-11-10T02:00:00.000Z", place: "Ruang Rapat 1",
  people: [{ id: RAJA, name: "Raja" }, { id: "me", name: "Saya" }], telegram: telegram(),
  frm: true, attendees, defaultChairId: RAJA, photos: [], photosReady: true, photoHd: true,
  staff: [{ id: RAJA, name: "Raja", fullName: "Raja Pratama", department: "Center of Excellence" }, { id: "andi", name: "Andi", fullName: "Andi Wijaya", department: "Finance" }],
  ...patch,
});
const written = (patch: Partial<Minutes> = {}): Minutes => ({
  summary: "", decisions: "", number: "MoM/2026/11/0012", docNumber: null,
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
  fireEvent.change(screen.getByLabelText("Topic/Agenda Item 1"), { target: { value: "Target Q1" } });
  fireEvent.change(screen.getByLabelText("Discussion Summary & Key Points, agenda item 1"), { target: { value: "Bahas target Q1" } });
  fireEvent.change(screen.getByLabelText("Decisions/Outcomes, agenda item 1"), { target: { value: "Target naik 10%" } });
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.change(screen.getByLabelText("Action Item/Task 1"), { target: { value: "Kirim data penjualan" } });
  fireEvent.change(screen.getByLabelText("PIC 1"), { target: { value: RAJA } });
  fireEvent.change(screen.getByLabelText("Due Date 1"), { target: { value: "2026-11-14" } });
}
const items = [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }];
// An empty second follow-up is left out.
const actions = [{ task: "Kirim data penjualan", picId: RAJA, dueDate: "2026-11-14", done: false }];
const body = (send: boolean, telegramOff = true) => ({
  items, chairId: RAJA, absentIds: ["me"], guests: "", next: { date: null, time: null, place: "", agenda: "" }, actions, send, telegramOff, docNumber: "",
});

it("keeps a draft to those in the meeting: Simpan draf sends nothing", async () => {
  request.mockResolvedValue({ data: view({ status: "draf", minutes: written({ sentAt: null, sentBy: null, version: 0 }) }), message: "Draf disimpan. Belum dikirim ke siapa pun." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  expect(screen.getByText("MoM belum diisi")).toBeTruthy();
  fill();
  expect(screen.getByText("Draf hanya terlihat oleh yang ikut meeting sampai MoM dikirim.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]).toEqual([`/api/wam/sessions/${SESSION}/minutes`, { method: "PUT", json: body(false) }]);
  expect(await screen.findByText(/Masih draf/)).toBeTruthy();
  expect(screen.getByText("MoM masih draf")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Lanjutkan draf/ })).toBeTruthy();
});

it("sends a draft straight from reading it, after naming where it goes", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written() }), message: "MoM dikirim." });
  render(<MinutesPanel sessionId={SESSION} initial={view({ status: "draf", minutes: written({ sentAt: null, sentBy: null, version: 0 }) })} />);
  fireEvent.click(screen.getByRole("button", { name: /^Kirim MoM/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(dialog.getByText(/ke grup Telegram Werkudara CoE · Center of Excellence/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Kirim MoM" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual({
    items, chairId: RAJA, absentIds: ["me"], guests: "", next: { date: null, time: null, place: "", agenda: "" },
    actions: [{ id: ACTION, task: "Kirim data penjualan", picId: "me", dueDate: "2026-11-14", done: false }], send: true, telegramOff: false, docNumber: "",
  });
  expect(await screen.findByText("MoM dikirim.")).toBeTruthy();
  // Sent: no Kirim MoM any more.
  expect(screen.queryByRole("button", { name: /^Kirim MoM/ })).toBeNull();
});

it("fills the FRM form: chair from the booker, who came from check-in, new topics, others who came, and the next meeting", async () => {
  request.mockResolvedValue({ data: view({ status: "draf", minutes: written({ sentAt: null, version: 0 }) }), message: "Draf disimpan." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  // The form's sections, in its words and order.
  expect(screen.getAllByRole("group").map(group => group.querySelector("legend")?.textContent).filter(Boolean)).toEqual([
    "I. MEETING INFORMATION", "II. ATTENDANCE 1 present · 1 absent", "III. AGENDA ITEMS AND DISCUSSION", "V. ACTION ITEMS", "VI. NEXT MEETING isi kalau ada", "VII. ATTENDANCE LIST",
  ]);
  // No IV in the form (13 Nov 2026), and the next meeting is open, not folded away.
  expect(document.querySelector("details")).toBeNull();
  // Nomor surat: typed, with the register a tap away.
  expect(screen.getByRole("link", { name: /Ambil nomor/ }).getAttribute("href")).toMatch(/^https:\/\/werkudara\.sharepoint\.com\//);
  fireEvent.change(screen.getByLabelText("MoM Number"), { target: { value: " 001/MoM/BAS/XI/2026 " } });
  expect(screen.getByText("Review target Q1")).toBeTruthy();
  expect(screen.getByText("10 Nov. 26")).toBeTruthy();
  expect(screen.getByText("09:00 WIB")).toBeTruthy();
  expect(screen.getByText("Ruang Rapat 1")).toBeTruthy();
  expect((screen.getByLabelText("Chairperson") as HTMLSelectElement).value).toBe(RAJA);
  // Raja checked in, Saya did not: Saya starts as absent.
  expect(screen.getByText("1 present · 1 absent")).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: /Raja Pratama/ }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: /Saya Sendiri/ }) as HTMLInputElement).checked).toBe(false);
  // Raja checked in by themselves: present, and not changed from the MoM.
  expect((screen.getByRole("checkbox", { name: /Raja Pratama/ }) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(/Center of Excellence · Head of Department · sudah absen sendiri/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Saya Sendiri/ }));
  expect(screen.getByText("2 present · 0 absent")).toBeTruthy();
  // Others present: a search of Data karyawan, or a guest's name as typed.
  fireEvent.change(screen.getByLabelText("Others present"), { target: { value: "andi fin" } });
  const suggest = within(screen.getByRole("listbox", { name: "Saran dari Data karyawan" }));
  fireEvent.click(suggest.getByRole("option", { name: /Andi Wijaya/ }));
  expect((screen.getByLabelText("Others present") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Others present"), { target: { value: "Pak Andi (klien)" } });
  fireEvent.keyDown(screen.getByLabelText("Others present"), { key: "Enter" });
  expect(within(screen.getByRole("list", { name: "Peserta lain yang hadir" })).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Andi Wijaya", "Pak Andi (klien)"]);
  // Someone in the meeting is not offered.
  fireEvent.change(screen.getByLabelText("Others present"), { target: { value: "raja" } });
  expect(within(screen.getByRole("listbox", { name: "Saran dari Data karyawan" })).queryByText("Raja Pratama")).toBeNull();
  fireEvent.change(screen.getByLabelText("Others present"), { target: { value: "" } });
  // VII follows II: everyone with the form's position, Present or Absent, and the others who came.
  expect(within(screen.getByRole("table")).getAllByRole("row").map(row => row.textContent)).toEqual([
    "#Full NameDeptPositionSign", "1.Raja PratamaCenter of ExcellenceHead of DepartmentPresent", "2.Saya SendiriCommsStaffPresent", "3.Andi Wijaya--Present", "4.Pak Andi (klien)--Present",
  ]);

  fireEvent.change(screen.getByLabelText("Topic/Agenda Item 1"), { target: { value: "Target Q1" } });
  fireEvent.change(screen.getByLabelText("Discussion Summary & Key Points, agenda item 1"), { target: { value: "Bahas target Q1" } });
  expect(screen.queryByRole("button", { name: "Tambah topik baru" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tambah agenda" }));
  fireEvent.change(screen.getByLabelText("Topic/Agenda Item 2"), { target: { value: "Seragam" } });
  fireEvent.change(screen.getByLabelText("Decisions/Outcomes, agenda item 2"), { target: { value: "Pakai batik" } });
  // A third, empty agenda item is left out.
  fireEvent.click(screen.getByRole("button", { name: "Tambah agenda" }));
  expect(screen.getByLabelText("Topic/Agenda Item 3")).toBeTruthy();
  // Each follow-up names its fields where they can be seen, the due date too.
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  expect(screen.getByText("Due Date (tenggat)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hapus tindak lanjut 1" }));

  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-24" } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "10:00" } });
  fireEvent.change(screen.getByLabelText("Location/Platform"), { target: { value: "Ruang Vasuki" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual({
    items: [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "", added: false }, { topic: "Seragam", discussion: "", decision: "Pakai batik", added: false }],
    chairId: RAJA, absentIds: [], guests: "Andi Wijaya, Pak Andi (klien)", next: { date: "2026-11-24", time: "10:00", place: "Ruang Vasuki", agenda: "" },
    actions: [], send: false, telegramOff: true, docNumber: "001/MoM/BAS/XI/2026",
  });
});

it("asks for a topic with its discussion or decision before saving", () => {
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  expect(screen.getByText("Isi minimal satu agenda (III) dengan pembahasan atau keputusannya.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Topic/Agenda Item 1"), { target: { value: "Target Q1" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan draf" }));
  expect(screen.getByText(/Isi pembahasan atau keputusan untuk "Target Q1"/)).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});

it("names where Kirim MoM goes before it goes, and sends nothing when cancelled", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written(), telegram: telegram({ deliveries: [{ title: "Werkudara CoE · Center of Excellence", status: "terkirim", error: null, version: 1, at: "2026-11-10T04:00:00.000Z" }] }) }), message: "MoM dikirim." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  fill();
  // Kirim ke Telegram starts off; ticking it is like agreeing to terms: where it goes and how to join the group.
  const box = screen.getByRole("checkbox", { name: /Kirim ke Telegram/ }) as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  let dialog = within(await screen.findByRole("dialog", { name: "Kirim ke Telegram" }));
  expect(dialog.getByText("Werkudara CoE · Center of Excellence")).toBeTruthy();
  expect(dialog.getByRole("heading", { name: "Cara masuk grup Telegram" })).toBeTruthy();
  expect(dialog.queryByText(/Pasang aplikasi Telegram/)).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "Batalkan" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(box.checked).toBe(false);
  fireEvent.click(box);
  dialog = within(await screen.findByRole("dialog", { name: "Kirim ke Telegram" }));
  await waitFor(() => expect((dialog.getByRole("button", { name: "Kirim ke Telegram" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(dialog.getByRole("button", { name: "Kirim ke Telegram" }));
  await waitFor(() => expect(box.checked).toBe(true));

  // Then Kirim MoM names the groups and asks plainly.
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(dialog.getByText(/ke grup Telegram Werkudara CoE · Center of Excellence/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Kirim MoM" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual(body(true, false));
  expect(await screen.findByText("MoM dikirim.")).toBeTruthy();
  expect(screen.getByText("Terkirim ke Telegram: Werkudara CoE · Center of Excellence")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Unduh PDF/ }).getAttribute("href")).toBe(`/api/wam/sessions/${SESSION}/minutes/pdf`);
});

it("says when a group is missing, a meeting still runs, or the MoM stays out of Telegram", async () => {
  render(<MinutesPanel sessionId={SESSION} initial={view({ endsAt: "2999-01-01T03:00:00.000Z", telegram: telegram({ destinations: [] }) })} />);
  fill();
  // Not ticked: the MoM stays out of Telegram.
  expect((screen.getByRole("checkbox", { name: /Kirim ke Telegram/ }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  const dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(dialog.getByText(/Meeting ini belum selesai/)).toBeTruthy();
  expect(dialog.getByText(/tidak dikirim ke Telegram/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
  // Ticked without a known group: the terms say each participant's department group.
  fireEvent.click(screen.getByRole("checkbox", { name: /Kirim ke Telegram/ }));
  const terms = within(await screen.findByRole("dialog", { name: "Kirim ke Telegram" }));
  expect(terms.getByText("PDF MoM dikirim ke grup Telegram departemen setiap peserta.")).toBeTruthy();
  await waitFor(() => expect((terms.getByRole("button", { name: "Kirim ke Telegram" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(terms.getByRole("button", { name: "Kirim ke Telegram" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
  const plain = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
  expect(plain.getByText(/Peserta lain diberi tahu di WAM\./)).toBeTruthy();
});

it("reads a MoM as the form has it: number, chair, who came, agenda items and new topics, next meeting, photos", () => {
  render(<MinutesPanel sessionId={SESSION} initial={view({
    status: "sudah", canWrite: false, viewerId: "hod", photos: [photo("f1"), photo("f2")],
    minutes: written({
      items: [{ topic: "Target Q1", discussion: "Bahas target Q1", decision: "Target naik 10%", added: false }, { topic: "Seragam", discussion: "", decision: "Pakai batik", added: true }],
      guests: "Pak Andi (klien)", next: { date: "2026-11-24", time: "13:30", place: "Ruang Vasuki", agenda: "Survei venue" },
    }),
  })} />);
  const panel = within(screen.getByRole("region", { name: "Notulen" }));
  expect(panel.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual([
    "I. MEETING INFORMATION", "II. ATTENDANCE 1 present · 1 absent", "III. AGENDA ITEMS AND DISCUSSION", "V. ACTION ITEMS", "VI. NEXT MEETING", "VII. ATTENDANCE LIST",
  ]);
  const part = (title: string) => panel.getAllByRole("heading", { level: 3 }).find(heading => heading.textContent?.startsWith(title))!.parentElement!;
  const facts = (title: string) => Object.fromEntries([...part(title).querySelectorAll("dt")].map(term => [term.textContent, term.nextElementSibling?.textContent]));
  expect(facts("I.")).toEqual({
    "MoM Number": "MoM/2026/11/0012", "Meeting Title": "Review target Q1", Date: "10 Nov. 26", "Time Start": "09:00 WIB", "Time End": "10:00 WIB",
    "Location/Platform": "Ruang Rapat 1", Chairperson: "Raja", "Minute Taker": "Raja",
  });
  expect(facts("II.")).toEqual({ Present: "Raja Pratama, Pak Andi (klien)", Absent: "Saya Sendiri" });
  expect(within(part("III.")).getByText("Target Q1")).toBeTruthy();
  // A topic added outside the agenda is under III too, marked.
  expect(within(part("III.")).getByText("Seragam")).toBeTruthy();
  expect(within(part("III.")).getByText("Topik baru")).toBeTruthy();
  expect(facts("VI.")).toEqual({ Date: "24 Nov. 26", Time: "13:30 WIB", "Location/Platform": "Ruang Vasuki", "Draft Agenda Items": "Survei venue" });
  expect(within(panel.getByRole("table")).getAllByRole("row").map(row => row.textContent)).toEqual([
    "#Full NameDeptPositionSign", "1.Raja PratamaCenter of ExcellenceHead of DepartmentPresent", "2.Saya SendiriCommsStaffAbsent", "3.Pak Andi (klien)--Present",
  ]);
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
  expect(screen.getByText("Belum terkirim ke Werkudara SM · Commercial. Dicoba lagi saat MoM disimpan berikutnya.")).toBeTruthy();
  // The reason is for the admin, not for the notetaker.
  expect(screen.queryByText(/Bot sudah tidak ada/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ubah notulen/ }));
  expect((screen.getByLabelText("Topic/Agenda Item 1") as HTMLInputElement).value).toBe("Pembahasan");
  expect((screen.getByLabelText("Discussion Summary & Key Points, agenda item 1") as HTMLTextAreaElement).value).toBe("Bahas target Q1");
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.getByText("Perubahan menggantikan MoM yang sudah dikirim.")).toBeTruthy();
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
  // Ambil foto opens the camera straight away; Dari galeri picks several.
  expect(container.querySelector('input[type="file"][capture="environment"]')).toBeTruthy();
  expect(screen.getByRole("button", { name: /Ambil foto/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Dari galeri/ })).toBeTruthy();
  fireEvent.change(input, { target: { files: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(screen.getAllByRole("link", { name: /Buka foto/ })).toHaveLength(2));
  expect(upload.put).toHaveBeenCalledTimes(2);
  expect(upload.put.mock.calls[0][0]).toBe(SESSION);
  expect(screen.getByText("2 dari 10")).toBeTruthy();
  expect(screen.getByText("Foto langsung tersimpan dan ikut di PDF MoM.")).toBeTruthy();
  // No sizes, pixels or storage words for the person adding photos.
  expect(screen.queryByText(/MB|px|KB/)).toBeNull();

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
  expect(panel.getByText("PIC Saya · Due 14-Nov-26 · Open")).toBeTruthy();
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
  expect(screen.queryByText(/pembaruan sistem|migrasi/)).toBeNull();
  expect(screen.queryByLabelText("Chairperson")).toBeNull();
  expect(screen.queryByText(/present ·/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Simpan draf" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /Kirim ke Telegram/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Simpan notulen" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][1].json).toEqual({ items, actions, send: false, telegramOff: true, docNumber: "" });
});

it("waits for the meeting to start, and for the migration", () => {
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "belum-waktunya", canWrite: false, open: false })} />);
  expect(screen.getByText("Notulen bisa ditulis setelah meeting dimulai.")).toBeTruthy();
  unmount();
  render(<MinutesPanel sessionId={SESSION} initial={view({ migrated: false, canWrite: false })} />);
  expect(screen.getByText("Notulen belum bisa ditulis.")).toBeTruthy();
});

it("on a phone, is a few steps with Kembali, Simpan draf and Lanjut, and sends from the last", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
    matches: query === "(max-width: 719px)", media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  }) });
  const shown = (element: HTMLElement) => !element.closest("[hidden]");
  try {
    request.mockResolvedValue({ data: view({ status: "sudah", minutes: written() }), message: "MoM dikirim." });
    render(<MinutesPanel sessionId={SESSION} initial={view()} />);
    fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
    const steps = () => within(screen.getByRole("list", { name: "Langkah mengisi MoM" }));
    expect(steps().getAllByRole("button").map(button => button.textContent)).toEqual(["1Info", "2Hadir", "3Bahasan", "4Tindak lanjut", "5Selesai"]);
    // One part at a time: Info first; the attendance table is for a larger screen.
    expect(shown(screen.getByLabelText("Chairperson"))).toBe(true);
    expect(shown(screen.getByLabelText("Topic/Agenda Item 1"))).toBe(false);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Batal" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
    expect(shown(screen.getByRole("checkbox", { name: /Raja Pratama/ }))).toBe(true);
    expect(shown(screen.getByLabelText("Chairperson"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
    fireEvent.change(screen.getByLabelText("Topic/Agenda Item 1"), { target: { value: "Target Q1" } });
    fireEvent.change(screen.getByLabelText("Discussion Summary & Key Points, agenda item 1"), { target: { value: "Bahas target Q1" } });
    // Enter in a field moves on a step; it does not send.
    fireEvent.submit(screen.getByLabelText("Topic/Agenda Item 1").closest("form")!);
    expect(request).not.toHaveBeenCalled();
    expect(shown(screen.getByRole("button", { name: /Tambah tindak lanjut/ }))).toBe(true);
    expect(shown(screen.getByLabelText("Topic/Agenda Item 1"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
    expect(shown(screen.getByLabelText("Topic/Agenda Item 1"))).toBe(true);
    // From step 4, Lanjut opens step 5; it does not send (13 Nov 2026).
    fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
    expect(steps().getByRole("button", { name: /Tindak lanjut/ }).getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(steps().getByRole("button", { name: /Selesai/ }).getAttribute("aria-current")).toBe("step");
    expect(within(screen.getByRole("list", { name: "Isi MoM" })).getAllByRole("listitem").map(item => item.textContent)).toEqual(["1 topik dibahas", "0 tindak lanjut", "1 dari 2 hadir", "0 foto"]);
    expect(screen.getAllByRole("button", { name: "Simpan draf" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Kirim MoM/ }));
    const dialog = within(await screen.findByRole("dialog", { name: "Kirim MoM?" }));
    fireEvent.click(dialog.getByRole("button", { name: "Kirim MoM" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][1].json.send).toBe(true);
  } finally {
    delete (window as { matchMedia?: unknown }).matchMedia;
  }
});
