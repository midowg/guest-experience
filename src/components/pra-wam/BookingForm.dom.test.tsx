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

const room = (id: string, name: string, capacity: number | null, minPeople: number | null): Room => ({ id, slug: id, name, kind: "area", capacity, bookable: true, minPeople, planKey: null });
const kecil = room("kecil", "Arjuna", 4, null), besar = room("besar", "Bima", 12, 4), sibuk = room("sibuk", "Nakula", 6, null);
const held: Booking = { id: "b1", roomId: "sibuk", title: "Rapat", description: "", startsAt: wibInstant("2026-11-05", "13:00"), endsAt: wibInstant("2026-11-05", "14:00"), bookedBy: { id: "other", name: "Sari", department: "HR" }, participants: null };
const draft = (patch: Partial<BookingDraft> = {}): BookingDraft => ({ date: "2026-11-05", start: "13:00", end: "14:00", roomId: "", title: "", description: "", participants: [], ...patch });

function renderForm(props: { initial?: BookingDraft; rooms?: Room[]; editId?: string; onSaved?: () => void } = {}) {
  return render(<BookingForm editId={props.editId} initial={props.initial ?? draft()} dates={["2026-11-04", "2026-11-05"]} now={NOW} rooms={props.rooms ?? [kecil, besar, sibuk]}
    people={[{ id: "p1", name: "Budi", department: "IT" }, { id: "p2", name: "Citra", department: "IT" }]} viewer={{ id: "me" }}
    groups={[{ id: "it", label: "IT", memberIds: ["p1", "p2"] }]} usedTitles={[]} dayBookings={[held]} dayOf="2026-11-05" onSaved={props.onSaved} showPlan={false} />);
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
  fireEvent.click(screen.getByRole("button", { name: "+ Budi" }));
  expect(screen.getByText("Kamu + 1 orang = 2 orang (one-on-one)")).toBeTruthy();
  lanjut();

  expect(screen.getByText("Langkah 4 dari 4 · Ruang")).toBeTruthy();
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
