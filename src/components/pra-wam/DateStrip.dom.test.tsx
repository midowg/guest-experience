import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateStrip } from "./DateStrip";

afterEach(cleanup);

const days = ["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
const summary = { "2026-10-30": { bookings: 4, full: true }, "2026-11-03": { bookings: 0, full: false }, "2026-11-04": { bookings: 2, full: false }, "2026-11-05": { bookings: 7, full: true } };
const day = (name: RegExp) => screen.getByRole("button", { name });

it("says each day's state in words: past, today, picked, full and how many are taken", () => {
  const onPick = vi.fn();
  render(<DateStrip days={days} selected="2026-11-04" today="2026-11-03" summary={summary} onPick={onPick} />);

  const past = day(/^Jumat, 30 Okt/);
  expect(past.getAttribute("aria-disabled")).toBe("true");
  expect(past.getAttribute("aria-label")).toBe("Jumat, 30 Okt, lewat");
  // A past full day is only "Lewat".
  expect(past.textContent).toContain("Lewat");
  expect(past.textContent).not.toContain("Penuh");
  fireEvent.click(past);
  expect(onPick).not.toHaveBeenCalled();

  const today = day(/^Selasa, 3 Nov/);
  expect(today.getAttribute("aria-current")).toBe("date");
  expect(today.getAttribute("aria-pressed")).toBe("false");
  expect(today.textContent).toContain("Hari ini");
  expect(today.getAttribute("aria-label")).toBe("Selasa, 3 Nov, hari ini, kosong");

  const picked = day(/^Rabu, 4 Nov/);
  expect(picked.getAttribute("aria-pressed")).toBe("true");
  expect(picked.textContent).toContain("2 terpakai");

  const full = day(/^Kamis, 5 Nov/);
  expect(full.getAttribute("aria-label")).toBe("Kamis, 5 Nov, penuh");
  expect(full.hasAttribute("aria-disabled")).toBe(false);
  fireEvent.click(full);
  expect(onPick).toHaveBeenCalledWith("2026-11-05");
});

it("names each month where it begins and has no count for an unknown day", () => {
  render(<DateStrip days={days} selected="2026-11-04" today="2026-11-03" onPick={() => undefined} />);
  expect(screen.getByText("Okt")).toBeTruthy();
  expect(screen.getByText("Nov")).toBeTruthy();
  expect(day(/^Rabu, 4 Nov/).getAttribute("aria-label")).toBe("Rabu, 4 Nov");
});

it("is one tab stop, on the picked day, and the arrow keys move between days", () => {
  render(<DateStrip days={days} selected="2026-11-04" today="2026-11-03" summary={summary} onPick={() => undefined} />);
  const focusable = screen.getAllByRole("button").filter(button => button.dataset.date && button.tabIndex === 0);
  expect(focusable.map(button => button.dataset.date)).toEqual(["2026-11-04"]);
  const picked = day(/^Rabu, 4 Nov/);
  picked.focus();
  fireEvent.keyDown(picked, { key: "ArrowRight" });
  expect(document.activeElement).toBe(day(/^Kamis, 5 Nov/));
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(document.activeElement).toBe(day(/^Jumat, 30 Okt/));
});
