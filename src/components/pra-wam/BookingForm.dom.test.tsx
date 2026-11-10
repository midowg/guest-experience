import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const request = vi.hoisted(() => vi.fn());
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
import { PraWamApiError } from "./api";
import { activitiesFor, BookingForm, type BookingDraft } from "./BookingForm";

// The walk-through tests click through every step; under a full parallel run they need more than 5 s.
vi.setConfig({ testTimeout: 20_000 });
const NOW = "2026-11-04T03:00:00.000Z"; // Rabu 4 Nov, 10.00 WIB
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(NOW)); request.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const room = (id: string, name: string, capacity: number | null, minPeople: number | null): Room => ({ id, slug: id, name, kind: "area", capacity, bookable: true, minPeople, planKey: null, facilities: [] });
const kecil = room("kecil", "Arjuna", 4, null), besar = room("besar", "Bima", 12, 4), sibuk = room("sibuk", "Nakula", 6, null);
const held: Booking = { id: "b1", roomId: "sibuk", title: "Rapat", description: "", startsAt: wibInstant("2026-11-05", "13:00"), endsAt: wibInstant("2026-11-05", "14:00"), bookedBy: { id: "other", name: "Sari", department: "HR" }, participants: null };
const draft = (patch: Partial<BookingDraft> = {}): BookingDraft => ({ date: "2026-11-05", start: "13:00", end: "14:00", roomId: "", title: "", description: "", participants: [], ...patch });

function renderForm(props: { initial?: BookingDraft; rooms?: Room[]; editId?: string; onSaved?: () => void; summary?: Record<string, { bookings: number; full: boolean }>; hod?: { departments: { id: string; name: string; heads: { id: string; name: string }[] }[]; ownUnits: string[] } } = {}) {
  return render(<BookingForm editId={props.editId} initial={props.initial ?? draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={props.rooms ?? [kecil, besar, sibuk]}
    people={[{ id: "p1", name: "Budi", department: "IT" }, { id: "p2", name: "Citra", department: "IT" }]} viewer={{ id: "me" }}
    groups={[{ id: "it", label: "IT", memberIds: ["p1", "p2"] }]} usedTitles={[]} dayBookings={[held]} dayOf="2026-11-05" onSaved={props.onSaved} showPlan={false} summary={props.summary} hod={props.hod} />);
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

it("shows the whole window on the date strip: a past day is a record after a check, a full day can be picked, with a note", async () => {
  // jsdom has no modal dialogs: enough of one for the confirm.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  request.mockReturnValue(new Promise(() => undefined));
  renderForm({ summary: { "2026-11-06": { bookings: 8, full: true } } });
  const past = () => screen.getByRole("button", { name: /^Selasa, 3 Nov, lewat/ });
  expect(past().getAttribute("aria-disabled")).toBeNull();
  // Asked first; Batal keeps the day.
  fireEvent.click(past());
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Tanggal sudah lewat" })).getByRole("button", { name: "Batal" }));
  expect(screen.getByRole("button", { name: /^Kamis, 5 Nov/ }).getAttribute("aria-pressed")).toBe("true");
  // Yes: a record, every hour of the day open.
  fireEvent.click(past());
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Tanggal sudah lewat" })).getByRole("button", { name: "Ya, catat" }));
  await vi.waitFor(() => expect(past().getAttribute("aria-pressed")).toBe("true"));
  expect(screen.getByText(/dicatat sebagai meeting yang sudah terjadi/)).toBeTruthy();
  expect([...(screen.getByLabelText("Jam mulai") as HTMLSelectElement).options].filter(option => !option.disabled)[0].value).toBe("07:00");
  fireEvent.click(screen.getByRole("button", { name: /^Kamis, 5 Nov/ }));
  expect(screen.queryByText(/dicatat sebagai meeting yang sudah terjadi/)).toBeNull();
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
  fireEvent.click(screen.getByRole("checkbox", { name: /Pilih semua IT \(2\)/ }));
  expect(screen.getByText("Kamu + 2 orang = 3 orang")).toBeTruthy();
  // Everyone in every department, and off again.
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "" } });
  const all = screen.getByRole("checkbox", { name: /Pilih semua karyawan \(3\)/ }) as HTMLInputElement;
  expect(all.indeterminate).toBe(true);
  fireEvent.click(all);
  expect(screen.getByText("Kamu + 3 orang = 4 orang")).toBeTruthy();
  fireEvent.click(all);
  expect(screen.queryByText(/Kamu \+ \d orang/)).toBeNull();
  fireEvent.change(screen.getByLabelText("Departemen"), { target: { value: "it" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Pilih semua IT \(2\)/ }));
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

it("books outside the office: chosen under Tempat, then a weekend opens back under Waktu, and the place is sent with no room", async () => {
  // Moving to the weekend loads that day's schedule (a GET); the save is the POST.
  request.mockImplementation((_url: string, options?: { method?: string }) => Promise.resolve(options?.method ? { data: {}, message: "Booking tersimpan." } : { data: { bookings: [] }, message: "" }));
  const onSaved = vi.fn();
  renderForm({ onSaved });
  // Waktu: the office's days and hours, and no Ruang kantor | Di luar kantor here (9 Nov 2026).
  expect(screen.queryByRole("button", { name: /^Sabtu, 7 Nov/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Di luar kantor" })).toBeNull();
  lanjut();
  fireEvent.change(screen.getByLabelText("Nama kegiatan"), { target: { value: "Review KPI" } });
  lanjut(); lanjut();
  // Tempat: pick Di luar kantor, then go back to Waktu for the Saturday evening.
  fireEvent.click(screen.getByRole("button", { name: "Di luar kantor" }));
  expect(screen.getByRole("heading", { name: "Di mana?" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Arjuna/ })).toBeNull();
  // The link in the Tempat hint (the step list has a "Waktu" button too).
  fireEvent.click(screen.getAllByRole("button", { name: "Waktu" }).at(-1)!);
  fireEvent.click(screen.getByRole("button", { name: /^Sabtu, 7 Nov/ }));
  fireEvent.change(screen.getByLabelText("Jam mulai"), { target: { value: "19:00" } });
  fireEvent.change(screen.getByLabelText("Durasi"), { target: { value: "270" } });
  expect(screen.getAllByText(/19\.00–23\.30/).length).toBeGreaterThan(0);
  lanjut(); lanjut(); lanjut();
  // Back at Tempat: the place is required.
  expect(screen.getByRole("heading", { name: "Di mana?" })).toBeTruthy();
  lanjut();
  expect(screen.getByText("Isi nama tempat.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Nama tempat"), { target: { value: "Kopi Klotok" } });
  lanjut();
  expect(screen.getByText("Kopi Klotok")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Book ruang/ }));
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ method: "POST", json: { roomId: "luar", place: "Kopi Klotok", date: "2026-11-07", start: "19:00", end: "23:30" } });
});

it("lets a HOD book as HOD: departments instead of people, their HODs invited, the room booked at once", async () => {
  const onSaved = vi.fn();
  request.mockResolvedValue({ data: {}, message: "Ruang dibooking. Undangan terkirim ke 2 HOD." });
  renderForm({ onSaved, hod: { ownUnits: ["Finance"], departments: [
    { id: "Finance", name: "Finance", heads: [{ id: "me", name: "Saya" }] },
    { id: "BAS", name: "Business & Administrative Services", heads: [{ id: "p1", name: "Budi" }] },
    { id: "COE", name: "Center of Excellence", heads: [{ id: "p2", name: "Citra" }] },
    { id: "ACS", name: "Art & Creative Support", heads: [] },
  ] } });
  lanjut();
  fireEvent.change(screen.getByLabelText("Nama kegiatan"), { target: { value: "Kalibrasi nilai" } });
  lanjut();
  // Booking sebagai: Pribadi (people) or HOD (departments).
  const as = within(screen.getByRole("group", { name: "Booking sebagai" }));
  expect(as.getByRole("button", { name: "Pribadi", pressed: true })).toBeTruthy();
  fireEvent.click(as.getByRole("button", { name: "HOD/Lead" }));
  expect(screen.queryByLabelText("Departemen")).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /Finance/ })).toBeNull();
  expect((screen.getByRole("checkbox", { name: /Art & Creative Support/ }) as HTMLInputElement).disabled).toBe(true);
  lanjut();
  expect(screen.getByText("Pilih minimal satu departemen.")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Business & Administrative Services/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Center of Excellence/ }));
  expect(screen.getByText("Kamu + 2 orang = 3 orang")).toBeTruthy();
  lanjut();
  fireEvent.click(roomCard("Nakula").disabled ? roomCard("Arjuna") : roomCard("Nakula"));
  lanjut();
  expect(screen.getByText(/Sebagai HOD\/Lead · Business & Administrative Services, Center of Excellence/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Book ruang/ }));
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/appraisal", expect.objectContaining({ method: "POST",
    json: expect.objectContaining({ hodUnits: ["BAS", "COE"], participants: ["p1", "p2"] }) })));
});

it("books an ITEM between departments: their HODs and Leads invited, the name made from the departments and given back on leaving ITEM", async () => {
  request.mockResolvedValue({ data: {}, message: "Ruang dibooking." });
  renderForm({ hod: { ownUnits: ["HRGA"], departments: [
    { id: "HRGA", name: "Human Resources & General Affair", heads: [{ id: "me", name: "Saya" }] },
    { id: "COE", name: "Business Transformation & AI Enablement (CoE)", heads: [{ id: "p2", name: "Citra" }, { id: "p3", name: "Dewi" }] },
  ] } });
  lanjut();
  fireEvent.change(screen.getByLabelText("Nama kegiatan"), { target: { value: "Kalibrasi nilai" } });
  lanjut();
  const as = within(screen.getByRole("group", { name: "Booking sebagai" }));
  fireEvent.click(as.getByRole("button", { name: "ITEM" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Business Transformation/ }));
  expect(screen.getByText(/Namanya menjadi "ITEM: HRGA x CoE"/)).toBeTruthy();
  expect(screen.getByText("Kamu + 2 orang = 3 orang")).toBeTruthy();
  // Leaving ITEM gives the name back; coming back names it again.
  fireEvent.click(as.getByRole("button", { name: "Pribadi" }));
  fireEvent.click(screen.getByRole("button", { name: /Kembali/ }));
  expect((screen.getByLabelText("Nama kegiatan") as HTMLSelectElement).value).toBe("Kalibrasi nilai");
  lanjut();
  fireEvent.click(within(screen.getByRole("group", { name: "Booking sebagai" })).getByRole("button", { name: "ITEM" }));
  lanjut();
  fireEvent.click(roomCard("Nakula").disabled ? roomCard("Arjuna") : roomCard("Nakula"));
  lanjut();
  expect(screen.getByText(/ITEM · Business Transformation/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Book ruang/ }));
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/appraisal", expect.objectContaining({ method: "POST",
    json: expect.objectContaining({ title: "ITEM: HRGA x CoE", hodUnits: ["COE"], participants: ["p2", "p3"] }) })));
});

it("picks the activity from a dropdown: Timeline's forums (the day's first), then the usual names", () => {
  render(<BookingForm initial={draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[kecil]} people={[]} viewer={{ id: "me" }} groups={[]} usedTitles={[]}
    dayBookings={[]} dayOf="2026-11-05" showPlan={false}
    activities={[{ title: "End Year Dinner", from: "2026-12-29", to: "2026-12-29" }, { title: "HOD Meeting", from: "2026-11-04", to: "2026-11-06" }]} />);
  lanjut();
  const select = screen.getByLabelText("Nama kegiatan") as HTMLSelectElement;
  expect(select.tagName).toBe("SELECT");
  const groups = [...select.querySelectorAll("optgroup")].map(group => [group.label, [...group.querySelectorAll("option")].map(option => option.textContent)]);
  expect(groups[0]).toEqual(["Dari Timeline · Kamis, 5 Nov dulu", ["HOD Meeting", "End Year Dinner"]]);
  expect(groups[1][0]).toBe("Lainnya");
  fireEvent.change(select, { target: { value: "HOD Meeting" } });
  expect(select.value).toBe("HOD Meeting");
});

it("falls back to the next activities when none runs on the day", () => {
  const list = [{ title: "Lewat", from: "2026-11-01", to: "2026-11-02" }, { title: "Nanti", from: "2026-11-20", to: "2026-11-21" }];
  expect(activitiesFor(list, "2026-11-05")).toEqual({ list: [list[1]], onDay: false });
  expect(activitiesFor(list, "2026-11-20")).toEqual({ list: [list[1]], onDay: true });
});

it("on its own page, once saved shows what was booked with a way back to Timeline, not Agenda", async () => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  request.mockResolvedValue({ data: {}, message: "Booking diubah." });
  renderForm({ editId: "b9", initial: draft({ title: "Rapat tim", roomId: "kecil" }) });
  fireEvent.click(screen.getByRole("button", { name: /Simpan perubahan/ }));
  await vi.waitFor(() => expect(screen.getByRole("heading", { name: "Booking diubah" })).toBeTruthy());
  expect(screen.getByText("Rapat tim")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Kembali ke Timeline/ }).getAttribute("href")).toBe("/wam/timeline");
  expect(screen.getByRole("link", { name: /Book lagi/ }).getAttribute("href")).toBe("/wam/book/new");
});

it("from Agenda picks the day on Timeline's month (bars, no dots), a weekend booking Di luar kantor, a day before the period not pickable", () => {
  request.mockResolvedValue({ data: { bookings: [] }, message: "" });
  render(<BookingForm initial={draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[kecil]} people={[]} viewer={{ id: "me" }} groups={[]} usedTitles={[]}
    dayBookings={[]} dayOf="2026-11-05" showPlan={false} datePicker="month"
    timeline={[{ id: "hod", title: "HOD Meeting", kind: "forum", published: false, planFrom: "2026-11-04", planTo: "2026-11-06", startsAt: null, endsAt: null, mine: false,
      from: "2026-11-04", to: "2026-11-06", state: "berlangsung", when: "4–6 Nov", hours: null, color: 0 }]} />);
  const month = within(screen.getByRole("group", { name: "Tanggal" }));
  expect(month.getByText("HOD Meeting")).toBeTruthy();
  expect(month.queryByRole("link", { name: "HOD Meeting" })).toBeNull();
  expect((month.getByRole("button", { name: /^Selasa, 27 Oktober/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((month.getByRole("button", { name: /^Selasa, 3 November/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(month.getByRole("button", { name: /^Kamis, 5 November/ }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(month.getByRole("button", { name: /^Sabtu, 7 November/ }));
  expect(screen.getByText(/Di luar kantor: boleh akhir pekan/)).toBeTruthy();
});

it("offers sessions already over under Sudah lewat, asking before one is picked", async () => {
  // jsdom has no modal dialogs: enough of one for the confirm.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  render(<BookingForm initial={draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[kecil]} people={[]} viewer={{ id: "me" }} groups={[]} usedTitles={[]}
    dayBookings={[]} dayOf="2026-11-05" showPlan={false}
    activities={[{ title: "Rekonsiliasi ACC", from: "2026-11-02", to: "2026-11-03", past: true }, { title: "HOD Meeting", from: "2026-11-24", to: "2026-11-27" }]} />);
  lanjut();
  const select = screen.getByLabelText("Nama kegiatan") as HTMLSelectElement;
  expect([...select.querySelectorAll("optgroup")].map(group => group.label)).toEqual(["Dari Timeline", "Sudah lewat", "Lainnya"]);
  fireEvent.change(select, { target: { value: "Rekonsiliasi ACC" } });
  const ask = await screen.findByRole("dialog", { name: "Sesi sudah lewat" });
  fireEvent.click(within(ask).getByRole("button", { name: "Batal" }));
  await vi.waitFor(() => expect(select.value).toBe(""));
  fireEvent.change(select, { target: { value: "Rekonsiliasi ACC" } });
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Sesi sudah lewat" })).getByRole("button", { name: "Tetap pilih" }));
  await vi.waitFor(() => expect(select.value).toBe("Rekonsiliasi ACC"));
});

it("greys out a room kept for another department, with its reason", () => {
  const sales = { ...besar, id: "sales", name: "Ruang 4", departments: ["Sales & Marketing"] };
  render(<BookingForm initial={draft({ title: "Review KPI" })} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={[kecil, sales]} people={[]} viewer={{ id: "me" }} groups={[]} usedTitles={[]}
    dayBookings={[]} dayOf="2026-11-05" showPlan={false} viewerDepartments={["Accounting"]} />);
  lanjut(); lanjut(); lanjut();
  const room = screen.getByRole("button", { name: /^Ruang 4/ }) as HTMLButtonElement;
  expect(room.getAttribute("aria-disabled") === "true" || room.disabled).toBe(true);
  expect(screen.getByText(/Khusus Sales & Marketing/)).toBeTruthy();
});
