import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { timelineMonths, type TimelineItem } from "@/lib/pra-wam/timeline";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
const request = vi.hoisted(() => vi.fn());
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
import { TimelineCalendar } from "./TimelineCalendar";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

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

it("opens the booking page on every day, weekends too; with Book closed the days are plain", () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" canBook />);
  expect(screen.getByRole("link", { name: "Book ruang, Selasa, 10 November" }).getAttribute("href")).toBe("/wam/book/new?date=2026-11-10");
  expect(screen.getByRole("link", { name: "Book ruang, Sabtu, 14 November" }).getAttribute("href")).toBe("/wam/book/new?date=2026-11-14");
  cleanup();
  render(<TimelineCalendar entries={entries} today="2026-11-09" />);
  expect(screen.queryByRole("link", { name: /^Book ruang,/ })).toBeNull();
});

it("opens the booking form over Timeline when a day is tapped, without leaving the page", async () => {
  request.mockReturnValue(new Promise(() => {}));
  render(<TimelineCalendar entries={entries} today="2026-11-09" canBook viewerId="me" />);
  fireEvent.click(screen.getByRole("link", { name: "Book ruang, Sabtu, 14 November" }));
  expect(screen.getByRole("dialog", { name: "Book ruang" })).toBeTruthy();
  expect(screen.getByText("Memuat form booking…")).toBeTruthy();
  expect(request).toHaveBeenCalledWith("/api/wam/book-form?date=2026-11-14");
});
