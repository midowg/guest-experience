import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { DayCalendar, Legend, WeekCalendar } from "./BookCalendar";

afterEach(cleanup);
// jsdom has no CSS: the phone cards and the desktop timeline are both in the document, phone first.
const first = (name: string | RegExp) => screen.getAllByRole("button", { name })[0];

const room = (id: string, name: string): Room => ({ id, slug: id, name, kind: "area", capacity: 6, bookable: true, minPeople: null, planKey: null, facilities: [] });
const rooms = [room("r1", "Nagapadma"), room("r2", "Cendana")];
const person = (id: string, name: string) => ({ id, name, department: "Finance" });
const booking = (id: string, roomId: string, date: string, start: string, end: string, by = person("p2", "Sari"), extra: Partial<Booking> = {}): Booking =>
  ({ id, roomId, title: `Rapat ${id}`, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end), bookedBy: by, participants: null, ...extra });
const now = new Date(wibInstant("2026-11-04", "10:12"));
const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

describe("the day calendar on a phone", () => {
  const list = [booking("a", "r1", "2026-11-04", "11:00", "12:00"), booking("b", "r1", "2026-11-04", "13:00", "14:00", person("me", "Aku")),
    booking("sesi:s", "r2", "2026-11-04", "09:00", "11:00", { id: "", name: "Panitia Pra WAM", department: "" }, { isSession: true })];

  it("lists bookings with who has them, free time to tap, and now once as a line", () => {
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={() => undefined} onBook={() => undefined} />);
    expect(first(/Rapat a.*Sari · Finance/)).toBeTruthy();
    expect(first(/Rapat b.*Booking kamu/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Rapat sesi:s.*Sesi Pra WAM/ }).length).toBeGreaterThan(0);
    // The desktop timeline's line; the phone bars mark now without words.
    expect(screen.getByRole("img", { name: "Sekarang 10.12" })).toBeTruthy();
    expect(first("Book Nagapadma, kosong 10.30–11.00")).toBeTruthy();
  });

  it("keeps a room card short: no rows for time gone by, one status pill", () => {
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={() => undefined} onBook={() => undefined} />);
    expect(screen.queryByText("Sudah lewat")).toBeNull();
    const card = screen.getByRole("region", { name: "Nagapadma, Rabu, 4 Nov" });
    // One tag: the hours still free (15 hours less the two bookings).
    expect(within(card).getByText("Sisa 13 jam")).toBeTruthy();
    // Bookings and free stretches in order: free from 10.30, a, free, b, free to the end of the day.
    const items = within(card).getAllByRole("button").map(button => button.getAttribute("aria-label") ?? button.textContent);
    expect(items).toEqual(["Book Nagapadma, kosong 10.30–11.00", "11.00–12.00Rapat aSari · Finance", "Book Nagapadma, kosong 12.00–13.00", "13.00–14.00Rapat bBooking kamu", "Book Nagapadma, kosong 14.00–22.00"]);
    // The session running now says so.
    expect(within(screen.getByRole("region", { name: "Cendana, Rabu, 4 Nov" })).getByText(/Sesi Pra WAM · berlangsung/)).toBeTruthy();
  });

  it("books a free stretch from its start, for an hour or what is left", () => {
    const onBook = vi.fn();
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={() => undefined} onBook={onBook} />);
    fireEvent.click(first("Book Nagapadma, kosong 10.30–11.00"));
    expect(onBook).toHaveBeenCalledWith({ room: rooms[0], start: "10:30", end: "11:00" });
    fireEvent.click(first("Book Nagapadma, kosong 14.00–22.00"));
    expect(onBook).toHaveBeenLastCalledWith({ room: rooms[0], start: "14:00", end: "15:00" });
  });

  it("opens a booking from its row", () => {
    const onOpen = vi.fn();
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={onOpen} onBook={() => undefined} />);
    fireEvent.click(first(/Rapat a/));
    expect(onOpen).toHaveBeenCalledWith(list[0]);
  });

  it("shows free time without a tap target while booking is closed", () => {
    render(<DayCalendar date="2026-11-05" rooms={rooms} bookings={[]} now={now} viewerId="me" canBook={false} onOpen={() => undefined} onBook={() => undefined} />);
    expect(screen.queryAllByRole("button", { name: /^Book / })).toHaveLength(0);
    expect(screen.getAllByText("Kosong", { selector: "[class*='pill']" })).toHaveLength(2);
  });

  it("says a day gone by once per room, without free time", () => {
    render(<DayCalendar date="2026-11-03" rooms={rooms} bookings={[booking("c", "r1", "2026-11-03", "09:00", "10:00")]} now={now} viewerId="me" canBook={false} onOpen={() => undefined} onBook={() => undefined} />);
    expect(screen.getAllByText("Sudah lewat")).toHaveLength(2);
    expect(screen.queryByText("Tidak ada booking.")).toBeNull();
    expect(screen.queryByText(/^Kosong/)).toBeNull();
  });
});

describe("the week grid", () => {
  const props = {
    week, rooms, viewerId: "me", now, today: "2026-11-04", selected: "2026-11-04", canBook: true, roomId: "r1",
    onRoom: () => undefined, onPickDay: () => undefined, onWeek: () => undefined, onOpen: () => undefined, onBook: () => undefined,
  };

  it("shows one room's week, books a free time on its day, and switches room", () => {
    const onBook = vi.fn(), onRoom = vi.fn();
    render(<WeekCalendar {...props} bookings={[booking("a", "r1", "2026-11-05", "09:00", "10:30"), booking("z", "r2", "2026-11-05", "09:00", "10:30")]} onBook={onBook} onRoom={onRoom} />);
    expect(screen.getByRole("button", { name: /^Rapat a, 09.00–10.30, Sari/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rapat z/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Book Nagapadma, Kamis, 5 Nov, kosong 10.30–22.00" }));
    expect(onBook).toHaveBeenCalledWith({ date: "2026-11-05", room: rooms[0], start: "10:30", end: "11:30" });
    // Past days cannot be booked; today only from the next half hour.
    expect(screen.queryByRole("button", { name: /^Book Nagapadma, Senin/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Book Nagapadma, Rabu, 4 Nov, kosong 10.30–22.00" })).toBeTruthy();
    const picker = screen.getByRole("group", { name: "Pilih ruang" });
    expect(within(picker).getByRole("button", { name: "Nagapadma" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(picker).getByRole("button", { name: "Cendana" }));
    expect(onRoom).toHaveBeenCalledWith("r2");
  });

  it("marks today, opens a day from its head, and pages by week", () => {
    const onPickDay = vi.fn(), onWeek = vi.fn();
    render(<WeekCalendar {...props} bookings={[]} onPickDay={onPickDay} onWeek={onWeek} />);
    expect(screen.getByRole("img", { name: "Sekarang 10.12" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buka Kamis, 5 Nov" }));
    expect(onPickDay).toHaveBeenCalledWith("2026-11-05");
    expect(screen.getByRole("button", { name: "Buka Rabu, 4 Nov, hari ini" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Minggu berikutnya" }));
    expect(onWeek).toHaveBeenCalledWith(1);
  });

  it("does not offer days outside the booking period", () => {
    render(<WeekCalendar {...props} week={["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]} today="2026-10-26" selected="2026-10-28" now={new Date(wibInstant("2026-10-26", "08:00"))} bookings={[]} />);
    expect((screen.getByRole("button", { name: "Buka Senin, 26 Okt, hari ini, di luar periode" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^Book Nagapadma, Selasa/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Book Nagapadma, Rabu, 28 Okt, kosong 07.00–22.00" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Minggu sebelumnya" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

it("names every colour in the key in words", () => {
  render(<Legend />);
  const key = screen.getByRole("list", { name: "Keterangan warna" });
  expect(within(key).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Booking kamu", "Terpakai", "Sesi Pra WAM", "Kosong", "Hampir penuh"]);
});

