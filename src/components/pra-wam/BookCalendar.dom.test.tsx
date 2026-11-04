import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { DayCalendar, WeekCalendar } from "./BookCalendar";

afterEach(cleanup);
// jsdom has no CSS: the phone rows and the desktop timeline are both in the document, phone first.
const first = (name: string | RegExp) => screen.getAllByRole("button", { name })[0];

const room = (id: string, name: string): Room => ({ id, slug: id, name, kind: "area", capacity: 6, bookable: true, minPeople: null, planKey: null });
const rooms = [room("r1", "Nagapadma"), room("r2", "Cendana")];
const person = (id: string, name: string) => ({ id, name, department: "Finance" });
const booking = (id: string, roomId: string, date: string, start: string, end: string, by = person("p2", "Sari"), extra: Partial<Booking> = {}): Booking =>
  ({ id, roomId, title: `Rapat ${id}`, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end), bookedBy: by, participants: null, ...extra });
const now = new Date(wibInstant("2026-11-04", "10:12"));

describe("the day calendar on a phone", () => {
  const list = [booking("a", "r1", "2026-11-04", "11:00", "12:00"), booking("b", "r1", "2026-11-04", "13:00", "14:00", person("me", "Aku")),
    booking("sesi:s", "r2", "2026-11-04", "09:00", "11:00", { id: "", name: "Panitia Pra WAM", department: "" }, { isSession: true })];

  it("lists bookings with who has them, free time to tap, and the line for now", () => {
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={() => undefined} onBook={() => undefined} />);
    expect(first(/Rapat a.*Sari · Finance/)).toBeTruthy();
    expect(first(/Rapat b.*Booking kamu/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Rapat sesi:s.*Sesi Pra WAM/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sekarang 10.12")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Sekarang 10.12" })).toBeTruthy();
    expect(first("Book Nagapadma, kosong 10.30–11.00")).toBeTruthy();
    expect(screen.getAllByText("Sudah lewat").length).toBeGreaterThan(0);
  });

  it("books a free stretch from its start, for an hour or what is left", () => {
    const onBook = vi.fn();
    render(<DayCalendar date="2026-11-04" rooms={rooms} bookings={list} now={now} viewerId="me" canBook onOpen={() => undefined} onBook={onBook} />);
    fireEvent.click(first("Book Nagapadma, kosong 10.30–11.00"));
    expect(onBook).toHaveBeenCalledWith({ room: rooms[0], start: "10:30", end: "11:00" });
    fireEvent.click(first("Book Nagapadma, kosong 14.00–18.00"));
    expect(onBook).toHaveBeenLastCalledWith({ room: rooms[0], start: "14:00", end: "15:00" });
  });

  it("shows free time without a tap target while booking is closed", () => {
    render(<DayCalendar date="2026-11-05" rooms={rooms} bookings={[]} now={now} viewerId="me" canBook={false} onOpen={() => undefined} onBook={() => undefined} />);
    expect(screen.queryAllByRole("button", { name: /^Book / })).toHaveLength(0);
  });
});

describe("the week overview", () => {
  it("counts each room's bookings per day and opens a day", () => {
    const onPickDay = vi.fn();
    const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    render(<WeekCalendar week={week} rooms={rooms} bookings={[booking("a", "r1", "2026-11-05", "09:00", "10:30")]} viewerId="me" today="2026-11-04" selected="2026-11-04" onPickDay={onPickDay} />);
    fireEvent.click(screen.getByRole("button", { name: /^Nagapadma, Kamis, 5 Nov: 1 terpakai, 1,5 jam/ }));
    expect(onPickDay).toHaveBeenCalledWith("2026-11-05");
    expect(screen.getByRole("button", { name: /^Cendana, Kamis, 5 Nov: kosong/ })).toBeTruthy();
  });
});
