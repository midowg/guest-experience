import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonthCalendar, monthWeeks } from "./MonthCalendar";

afterEach(cleanup);

const from = "2026-10-28", to = "2026-11-20";
const summary = {
  "2026-11-04": { bookings: 0, full: false, crowded: false },
  "2026-11-05": { bookings: 3, full: false, crowded: true },
  "2026-11-06": { bookings: 2, full: false, crowded: false },
  "2026-11-03": { bookings: 0, full: false, crowded: false },
};
const day = (name: RegExp) => screen.getByRole("button", { name });

describe("monthWeeks", () => {
  it("keeps only the weeks of the month that touch the window", () => {
    const november = monthWeeks("2026-11", from, to);
    expect(november.map(week => week[0])).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
    const october = monthWeeks("2026-10", from, to);
    expect(october).toEqual([["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]]);
  });
});

describe("the month calendar", () => {
  it("heads with the picked date and fills it; today has a ring and its state in words", () => {
    render(<MonthCalendar from={from} to={to} selected="2026-11-05" today="2026-11-04" summary={summary} mine={["2026-11-05"]} onPick={() => undefined} />);
    expect(screen.getByRole("heading", { name: "5 Nov Kamis" })).toBeTruthy();
    const picked = day(/^Kamis, 5 Nov/);
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.getAttribute("aria-label")).toBe("Kamis, 5 Nov, ada booking kamu, ada ruang hampir penuh");
    const today = day(/^Rabu, 4 Nov/);
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(today.getAttribute("aria-label")).toBe("Rabu, 4 Nov, hari ini, semua ruang kosong");
    // A day with some bookings and room to spare carries no dot.
    expect(day(/^Jumat, 6 Nov/).getAttribute("aria-label")).toBe("Jumat, 6 Nov");
  });

  it("does not pick past days or days outside the window, but a weekend can be picked", () => {
    const onPick = vi.fn();
    render(<MonthCalendar from={from} to={to} selected="2026-11-05" today="2026-11-04" summary={summary} onPick={onPick} />);
    const past = day(/^Selasa, 3 Nov/);
    expect(past.getAttribute("aria-label")).toBe("Selasa, 3 Nov, lewat");
    expect(past.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(past);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(day(/^Sabtu, 7 Nov, akhir pekan/));
    expect(onPick).toHaveBeenCalledWith("2026-11-07");
    onPick.mockClear();
    // 21 Nov ends the last week shown; 22 Nov on is not shown at all.
    expect(day(/^Sabtu, 21 Nov/).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(day(/^Sabtu, 21 Nov/));
    expect(screen.queryByRole("button", { name: /^Minggu, 22 Nov/ })).toBeNull();
    fireEvent.click(day(/^Jumat, 20 Nov/));
    expect(onPick).toHaveBeenCalledWith("2026-11-20");
  });

  it("pages by month inside the window", () => {
    render(<MonthCalendar from={from} to={to} selected="2026-11-05" today="2026-10-29" onPick={() => undefined} />);
    const prev = screen.getByRole("button", { name: "Bulan sebelumnya" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Bulan berikutnya" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(prev);
    expect(screen.getByRole("heading", { name: "Oktober 2026" })).toBeTruthy();
    expect(day(/^Selasa, 27 Okt/).getAttribute("aria-label")).toBe("Selasa, 27 Okt, di luar periode");
    expect(day(/^Rabu, 28 Okt/).getAttribute("aria-label")).toBe("Rabu, 28 Okt, lewat");
    expect(day(/^Kamis, 29 Okt/).getAttribute("aria-current")).toBe("date");
    expect(prev.disabled).toBe(true);
  });

  it("is one tab stop, on the picked day; the arrow keys move a day or a week", () => {
    render(<MonthCalendar from={from} to={to} selected="2026-11-05" today="2026-11-04" onPick={() => undefined} />);
    const focusable = screen.getAllByRole("button").filter(button => button.dataset.date && button.tabIndex === 0);
    expect(focusable.map(button => button.dataset.date)).toEqual(["2026-11-05"]);
    const picked = day(/^Kamis, 5 Nov/);
    picked.focus();
    fireEvent.keyDown(picked, { key: "ArrowDown" });
    expect(document.activeElement).toBe(day(/^Kamis, 12 Nov/));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(day(/^Rabu, 11 Nov/));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(day(/^Minggu, 8 Nov/));
  });
});
