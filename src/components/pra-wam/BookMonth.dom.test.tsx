// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { monthGrid, MonthView } from "./BookMonth";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const rooms: Room[] = [
  { id: "r1", slug: "r1", name: "Nagapadma", kind: "utama", capacity: 10, bookable: true, minPeople: null, planKey: null, facilities: [] },
  { id: "r2", slug: "r2", name: "Communal Space", kind: "area", capacity: 10, bookable: true, minPeople: null, planKey: null, facilities: [] },
];
const booking = (id: string, roomId: string, date: string, start: string, end: string, title: string, by = "lain"): Booking => ({
  id, roomId, title, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end),
  bookedBy: { id: by, name: by === "me" ? "Aku" : "Sari", department: "" }, participants: null,
});
const bookings = [
  booking("a", "r1", "2026-11-10", "09:00", "10:00", "Review KPI", "me"),
  booking("b", "r2", "2026-11-10", "10:00", "11:00", "Sinkronisasi"),
  booking("c", "r1", "2026-11-10", "13:00", "14:00", "Appraisal Sales"),
  booking("d", "r2", "2026-11-10", "15:00", "16:00", "Appraisal Finance"),
];

describe("Book, month view", () => {
  it("lays out whole weeks, Sunday first", () => {
    const weeks = monthGrid("2026-11");
    expect(weeks[0][0]).toBe("2026-11-01"); // 1 Nov 2026 is a Sunday
    expect(weeks.at(-1)![6]).toBe("2026-12-05");
    expect(weeks).toHaveLength(5);
    expect(monthGrid("2026-10")[0][0]).toBe("2026-09-27");
  });

  it("fetches the month, lists three bookings a day with their room, and filters by room", async () => {
    const fetched = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { rooms, bookings } })));
    vi.stubGlobal("fetch", fetched);
    const onPickDay = vi.fn(), onOpen = vi.fn();
    render(<MonthView month="2026-11" rooms={rooms} viewerId="me" today="2026-11-08" selected="2026-11-10" summary={{}} version={0}
      onMonth={vi.fn()} onPickDay={onPickDay} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByText("4 booking")).toBeTruthy());
    expect(String(fetched.mock.calls[0]).includes("from=2026-11-01&to=2026-12-05")).toBe(true);
    expect(screen.getByText("Review KPI")).toBeTruthy();
    expect(screen.queryByText("Appraisal Finance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+1 lagi" }));
    expect(onPickDay).toHaveBeenCalledWith("2026-11-10");
    fireEvent.click(screen.getByRole("button", { name: /Review KPI/ }));
    expect(onOpen).toHaveBeenCalledWith(bookings[0]);
    fireEvent.click(screen.getByRole("button", { name: "Communal Space" }));
    expect(screen.getByText("2 booking")).toBeTruthy();
    expect(screen.getByText("Appraisal Finance")).toBeTruthy();
    expect(screen.queryByText("Review KPI")).toBeNull();
  });
});
