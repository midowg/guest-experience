import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const request = vi.hoisted(() => vi.fn());
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
import { PraWamApiError } from "./api";
import { BookingForm, type BookingDraft } from "./BookingForm";

const NOW = "2026-11-04T03:00:00.000Z"; // Rabu 4 Nov, 10.00 WIB
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); request.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const room = (id: string, name: string, capacity: number | null, minPeople: number | null): Room => ({ id, slug: id, name, kind: "area", capacity, bookable: true, minPeople, planKey: null, facilities: [] });
const kecil = room("kecil", "Arjuna", 4, null), besar = room("besar", "Bima", 12, 4), sibuk = room("sibuk", "Nakula", 6, null);
const held: Booking = { id: "b1", roomId: "sibuk", title: "Rapat", description: "", startsAt: wibInstant("2026-11-05", "13:00"), endsAt: wibInstant("2026-11-05", "14:00"), bookedBy: { id: "other", name: "Sari", department: "HR" }, participants: null };
const draft = (patch: Partial<BookingDraft> = {}): BookingDraft => ({ date: "2026-11-05", start: "13:00", end: "14:00", roomId: "", title: "", description: "", participants: [], ...patch });

function renderForm(props: { initial?: BookingDraft; rooms?: Room[]; editId?: string; onSaved?: () => void; summary?: Record<string, { bookings: number; full: boolean }> } = {}) {
  return render(<BookingForm editId={props.editId} initial={props.initial ?? draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={props.rooms ?? [kecil, besar, sibuk]}
    people={[{ id: "p1", name: "Budi", department: "IT" }, { id: "p2", name: "Citra", department: "IT" }]} viewer={{ id: "me" }}
    groups={[{ id: "it", label: "IT", memberIds: ["p1", "p2"] }]} usedTitles={[]} dayBookings={[held]} dayOf="2026-11-05" onSaved={props.onSaved} showPlan={false} summary={props.summary} />);
}
const lanjut = () => fireEvent.click(screen.getByRole("button", { name: /Lanjut/ }));
const roomCard = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) }) as HTMLButtonElement;

it("walks waktu, kegiatan, partisipan and ruang, offering only rooms that suit, then saves", async () => {
  const onSaved = vi.fn();
  request.mockResolvedValue({ data: {}, message: "Ruang dibooking." });
  renderForm({ onSaved });
  expect(screen.getByText("Langkah 1 dari 4 · Waktu")).toBeTruthy();
  expect((screen.getByLabelText("Durasi") as HTMLSelectElement).value).toBe("60");
  expect(screen.getByText(/13\.00–14\.00 \(1 jam\)/)).toBeTruthy();

  lanjut();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Kegiatan apa?" }));
  lanjut();
  expect(screen.getByText("Isi nama kegiatan.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Nama kegiatan"), { target: { value: "Appraisal 1-on-1" } });
  lanjut();

  expect(screen.getByRole("heading", { name: "Siapa yang ikut?" })).toBeTruthy();
  expect(screen.getByText("Kamu saja = 1 orang")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Budi/ }));
  expect(screen.getByText("Kamu + 1 orang = 2 orang (one-on-one)")).toBeTruthy();
  lanjut();

  expect(screen.getByText("Langkah 4 dari 4 · Tempat")).toBeTruthy();
  expect(roomCard("Arjuna").disabled).toBe(false);
  expect(roomCard("Bima").disabled).toBe(true);
  expect(roomCard("Bima").textContent).toContain("Untuk minimal 4 orang");
  expect(roomCard("Nakula").disabled).toBe(true);
  expect(roomCard("Nakula").textContent).toContain("Terpakai 13.00–14.00");
  lanjut();
  expect(screen.getByText("Pilih ruang.")).toBeTruthy();
  fireEvent.click(roomCard("Arjuna"));
  expect(roomCard("Arjuna").getAttribute("aria-pressed")).toBe("true");
  lanjut();

  expect(screen.getByRole("heading", { name: "Periksa lalu simpan" })).toBeTruthy();
  expect(screen.getByText("2 orang (one-on-one)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Book ruang/ }));
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith({ message: "Ruang dibooking.", date: "2026-11-05" }));
  expect(request.mock.calls[0][1]).toMatchObject({ method: "POST", json: { roomId: "kecil", participants: ["p1"], title: "Appraisal 1-on-1", start: "13:00", end: "14:00" } });
});

it("opens a booking being changed at the summary, each step one tap away", () => {
  renderForm({ editId: "b9", initial: draft({ title: "Review KPI", roomId: "kecil", participants: ["p1"] }) });
  expect(screen.getByRole("heading", { name: "Periksa lalu simpan" })).toBeTruthy();
  expect(screen.getByText("Arjuna", { selector: "dd" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ubah waktu" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Kapan?" }));
  lanjut();
  expect(screen.getByRole("heading", { name: "Periksa lalu simpan" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Simpan perubahan/ })).toBeTruthy();
});

it("drops a room from the link that does not suit the headcount", () => {
  renderForm({ initial: draft({ title: "Ngobrol", roomId: "besar" }) });
  lanjut(); lanjut(); lanjut();
  expect(screen.getByText("Bima tidak bisa dipakai: untuk minimal 4 orang. Pilih ruang lain.")).toBeTruthy();
  expect(roomCard("Arjuna").getAttribute("aria-pressed")).toBe("false");
});

it("gives a way out when no room suits", () => {
  renderForm({ initial: draft({ title: "Ngobrol" }), rooms: [besar] });
  lanjut(); lanjut(); lanjut();
  expect(screen.getByText("Belum ada ruang untuk 1 orang.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ubah partisipan" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Siapa yang ikut?" }));
});

it("offers the nearest free hour when every suitable room is taken", () => {
  renderForm({ initial: draft({ title: "Ngobrol" }), rooms: [sibuk] });
  lanjut(); lanjut(); lanjut();
  expect(screen.getByText("Semua ruang untuk 1 orang terpakai pada jam ini.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Nakula 12.00–13.00" }));
  expect(roomCard("Nakula").getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(/12\.00–13\.00 \(1 jam\)/, { selector: "p" })).toBeTruthy();
});

it("opens the room step when the server refuses the room", async () => {
  request.mockRejectedValue(new PraWamApiError("Arjuna tidak cocok untuk 6 orang. Terlalu kecil: muat 4 orang.", 422, { roomId: ["Terlalu kecil: muat 4 orang"] }));
  renderForm({ editId: "b9", initial: draft({ title: "Review KPI", roomId: "kecil" }) });
  fireEvent.click(screen.getByRole("button", { name: /Simpan perubahan/ }));
  await vi.waitFor(() => expect(screen.getByRole("heading", { name: "Di ruang mana?" })).toBeTruthy());
  expect(screen.getByText("Terlalu kecil: muat 4 orang")).toBeTruthy();
});

it("shows the whole window on the date strip: a past day cannot be picked, a full day can, with a note", () => {
  request.mockReturnValue(new Promise(() => undefined));
  renderForm({ summary: { "2026-11-06": { bookings: 8, full: true } } });
  const past = screen.getByRole("button", { name: /^Selasa, 3 Nov, lewat/ });
  expect(past.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(past);
  expect(screen.getByRole("button", { name: /^Kamis, 5 Nov/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /^Rabu, 4 Nov, hari ini/ })).toBeTruthy();
  expect(screen.queryByText("Semua ruang penuh hari ini. Pilih hari lain atau jam lain.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Jumat, 6 Nov, penuh" }));
  expect(screen.getByRole("button", { name: /^Jumat, 6 Nov/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Semua ruang penuh hari ini. Pilih hari lain atau jam lain.")).toBeTruthy();
});

it("counts the chosen day from its bookings when no summary is given", () => {
  const allDay: Booking = { ...held, id: "b2", startsAt: wibInstant("2026-11-05", "07:00"), endsAt: wibInstant("2026-11-05", "22:00") };
  render(<BookingForm initial={draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[sibuk]} people={[]} viewer={{ id: "me" }}
    groups={[]} usedTitles={[]} dayBookings={[allDay]} dayOf="2026-11-05" showPlan={false} />);
  expect(screen.getByRole("button", { name: "Kamis, 5 Nov, penuh" })).toBeTruthy();
  expect(screen.getByText("Semua ruang penuh hari ini. Pilih hari lain atau jam lain.")).toBeTruthy();
});

it("picks people from one list: Departemen as a dropdown, search by name or department, tap to add and again to take off", () => {
  render(<BookingForm initial={draft({ title: "Rapat tim" })} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[kecil, besar]}
    people={[{ id: "p1", name: "Budi", department: "IT" }, { id: "p2", name: "Citra", department: "IT" }, { id: "p3", name: "Ayu", department: "HR" }]} viewer={{ id: "me" }}
    groups={[{ id: "it", label: "IT", memberIds: ["p1", "p2"] }, { id: "hr", label: "HR", memberIds: ["p3"] }]} usedTitles={[]} dayBookings={[]} dayOf="2026-11-05" showPlan={false} />);
  lanjut(); lanjut();
  const list = () => screen.getByRole("list", { name: "Pilih partisipan" });
  const names = () => [...list().querySelectorAll("strong")].map(item => item.textContent);
  // Everyone at first, by name; the department narrows it.
  expect(names()).toEqual(["Ayu", "Budi", "Citra"]);
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "it" } });
  expect(names()).toEqual(["Budi", "Citra"]);
  fireEvent.click(screen.getByRole("button", { name: /Tambah semua IT \(2\)/ }));
  expect(screen.getByText("Kamu + 2 orang = 3 orang")).toBeTruthy();
  // Tapping a picked person takes them off again.
  const budi = screen.getByRole("button", { name: /^Budi/ });
  expect(budi.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(budi);
  expect(screen.getByRole("button", { name: /^Budi/ }).getAttribute("aria-pressed")).toBe("false");
  // The search reads departments too, and Enter adds the one person found.
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Cari nama"), { target: { value: "hr" } });
  expect(names()).toEqual(["Ayu"]);
  fireEvent.keyDown(screen.getByLabelText("Cari nama"), { key: "Enter" });
  expect(screen.getByRole("button", { name: /^Ayu/ }).getAttribute("aria-pressed")).toBe("true");
});

it("books outside the office: a weekend opens, the place is asked under Tempat, and the place is sent with no room", async () => {
  request.mockResolvedValue({ data: {}, message: "Booking tersimpan." });
  const onSaved = vi.fn();
  renderForm({ onSaved });
  // Kapan: the office's hours until Di luar kantor is picked; then a Saturday and the evening are offered.
  expect(screen.queryByRole("button", { name: /^Sabtu, 7 Nov/ })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Di luar kantor" })[0]);
  fireEvent.click(screen.getByRole("button", { name: /^Sabtu, 7 Nov/ }));
  fireEvent.change(screen.getByLabelText("Jam mulai"), { target: { value: "19:00" } });
  fireEvent.change(screen.getByLabelText("Durasi"), { target: { value: "270" } });
  expect(screen.getAllByText(/19\.00–23\.30/).length).toBeGreaterThan(0);
  lanjut();
  fireEvent.change(screen.getByLabelText("Nama kegiatan"), { target: { value: "Makan malam tim" } });
  lanjut(); lanjut();
  // Tempat: no rooms, the place is required.
  expect(screen.getByRole("heading", { name: "Di mana?" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Arjuna/ })).toBeNull();
  lanjut();
  expect(screen.getByText("Isi nama tempat.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Nama tempat"), { target: { value: "Kopi Klotok" } });
  lanjut();
  expect(screen.getByText("Kopi Klotok")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Book ruang/ }));
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ method: "POST", json: { roomId: "luar", place: "Kopi Klotok", date: "2026-11-07", start: "19:00", end: "23:30" } });
});
