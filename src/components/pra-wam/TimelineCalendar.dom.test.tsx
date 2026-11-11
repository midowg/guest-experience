import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
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
const cfc: Room = { id: "11111111-1111-4111-8111-111111111111", slug: "cfc", name: "CFC Ananta Room", kind: "utama", capacity: 4, bookable: true, minPeople: null, planKey: null, facilities: [] };
const booking = (date: string, title: string, start: string, end: string, name: string, others: number): Booking => ({
  id: `${date}${title}`, roomId: cfc.id, title, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end),
  bookedBy: { id: name, name, department: "" }, participants: null, others,
});
const days: Record<string, Booking[]> = {
  "2026-11-09": [booking("2026-11-09", "Meeting ACS", "09:00", "10:30", "Sofyan", 3), booking("2026-11-09", "Meeting RAB WAM 2027", "13:00", "15:00", "Hanung", 4)],
  "2026-11-10": [],
};
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    const date = new URL(url, "http://x").searchParams.get("date") ?? "";
    if (url.startsWith("/api/wam/book-form")) return new Promise(() => {});
    return { data: { rooms: [cfc], bookings: days[date] ?? [] }, message: "" };
  });
});

it("names each forum or event of the month in the legend with its colour, and pages between months", () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" />);
  expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
  const legend = within(screen.getByRole("list", { name: /Kegiatan Pra WAM, November 2026/ }));
  expect(legend.getByText("HOD Meeting")).toBeTruthy();
  expect(legend.queryByText("End Year Dinner")).toBeNull();
  // The bars are colour only: no links to a list that is gone.
  expect(screen.queryByRole("link", { name: "HOD Meeting" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bulan berikutnya" }));
  expect(within(screen.getByRole("list", { name: /Desember 2026/ })).getByText("End Year Dinner")).toBeTruthy();
});

it("shows today's rooms with their bookings, and another day's when it is tapped", async () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" canBook viewerId="me" />);
  expect(screen.getByRole("button", { name: "Senin, 9 November, hari ini" }).getAttribute("aria-pressed")).toBe("true");
  const card = within(await screen.findByRole("article", { name: "CFC Ananta Room" }));
  expect(card.getByText("Meeting ACS")).toBeTruthy();
  expect(card.getByText("Sofyan +3")).toBeTruthy();
  expect(card.getByText("Hanung +4")).toBeTruthy();
  expect(request).toHaveBeenCalledWith("/api/wam/appraisal?date=2026-11-09");
  fireEvent.click(screen.getByRole("button", { name: "Selasa, 10 November" }));
  expect(screen.getByRole("button", { name: "Selasa, 10 November" }).getAttribute("aria-pressed")).toBe("true");
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith("/api/wam/appraisal?date=2026-11-10"));
  const next = within(await screen.findByRole("article", { name: "CFC Ananta Room" }));
  expect(next.queryByText("Meeting ACS")).toBeNull();
});

it("books a room on the day picked over Timeline; with Book closed there is no Book", async () => {
  render(<TimelineCalendar entries={entries} today="2026-11-09" canBook viewerId="me" />);
  fireEvent.click(screen.getByRole("button", { name: "Selasa, 10 November" }));
  fireEvent.click(await screen.findByRole("button", { name: "Book CFC Ananta Room" }));
  expect(screen.getByRole("dialog", { name: "Book ruang" })).toBeTruthy();
  expect(request).toHaveBeenCalledWith(`/api/wam/book-form?date=2026-11-10&room=${cfc.id}`);
  cleanup();
  render(<TimelineCalendar entries={entries} today="2026-11-09" />);
  await screen.findByRole("article", { name: "CFC Ananta Room" });
  expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
});
