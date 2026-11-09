import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { timelineMonths, type TimelineItem } from "@/lib/pra-wam/timeline";
import { TimelineCalendar } from "./TimelineCalendar";

afterEach(cleanup);

const plan = (title: string, from: string, to: string): TimelineItem =>
  ({ id: title, title, kind: "forum", published: false, planFrom: from, planTo: to, startsAt: null, endsAt: null, mine: false });
const entries = timelineMonths([plan("HOD Meeting", "2026-11-24", "2026-11-27"), plan("End Year Dinner", "2026-12-29", "2026-12-29")], "2026-11-09").flatMap(month => month.entries);

it("opens on this month, each entry a bar linking to its card, and pages between the months with entries", () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" />);
  expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "HOD Meeting" }).getAttribute("href")).toBe("#t-HOD Meeting");
  expect(screen.queryByRole("link", { name: "End Year Dinner" })).toBeNull();
  expect((screen.getByRole("button", { name: "Bulan sebelumnya" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Bulan berikutnya" }));
  expect(screen.getByRole("heading", { name: "Desember 2026" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "End Year Dinner" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Bulan berikutnya" }) as HTMLButtonElement).disabled).toBe(true);
});

it("opens the booking page on a day a room can be booked on; other days are plain", () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" bookable={["2026-11-09", "2026-11-10"]} />);
  expect(screen.getByRole("link", { name: "Book ruang, Selasa, 10 November" }).getAttribute("href")).toBe("/wam/book/new?date=2026-11-10");
  expect(screen.queryByRole("link", { name: /Book ruang, Rabu, 11 November/ })).toBeNull();
});
