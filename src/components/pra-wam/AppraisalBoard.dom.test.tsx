import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, "aria-label": label, className }: { href: string; children: React.ReactNode; "aria-label"?: string; className?: string }) => <a href={href} aria-label={label} className={className}>{children}</a> }));
import { AppraisalBoard } from "./AppraisalBoard";
afterEach(cleanup);
// jsdom has no modal dialogs: enough of one for the Sheet.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
const rooms: Room[] = [{ id: "r1", slug: "r1", name: "Nagapadma", kind: "area", capacity: 6, bookable: true, minPeople: null, planKey: null }];
const b: Booking = { id: "b1", roomId: "r1", title: "Rapat KPI", description: "x", startsAt: wibInstant("2026-11-05", "10:00"), endsAt: wibInstant("2026-11-05", "11:00"), bookedBy: { id: "me", name: "Aku", department: "IT" }, participants: [] };
it("renders, opens detail and new form sheets", () => {
  const replace = vi.spyOn(window.history, "replaceState");
  render(<AppraisalBoard date="2026-11-04" week={["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{}} />);
  fireEvent.click(screen.getAllByRole("button", { name: /Kamis/ })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: /Rapat KPI/ })[0]);
  expect(screen.getByRole("dialog", { name: "Rapat KPI" })).toBeTruthy();
  expect(replace.mock.calls.at(-1)?.[2]).toBe("/wam/book?date=2026-11-05&booking=b1");
  fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
  expect(screen.getByRole("dialog", { name: "Ubah booking" })).toBeTruthy();
  expect((screen.getByLabelText("Nama kegiatan") as HTMLInputElement).value).toBe("Rapat KPI");
  fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^Book Nagapadma, kosong 11.00/ })[0]);
  expect(screen.getByRole("dialog", { name: "Book ruang" })).toBeTruthy();
  expect(replace.mock.calls.at(-1)?.[2]).toBe("/wam/book?date=2026-11-05&new=1&room=r1&start=11%3A00&end=12%3A00");
  expect(document.querySelector("button[type=submit]")?.getAttribute("form")).toBe(document.querySelector("form")?.id);
});
it("opens a sheet from the address", () => {
  render(<AppraisalBoard date="2026-11-05" week={["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{ booking: "zzz" }} />);
  expect(screen.getByText(/tidak ada di jadwal/)).toBeTruthy();
});
it("shows each room's day on the plan, without hours to pick, and books the next free half hour", () => {
  Element.prototype.scrollIntoView = vi.fn();
  const week = ["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
  render(<AppraisalBoard date="2026-11-05" week={week} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{}} />);
  fireEvent.click(screen.getByRole("button", { name: "Denah" }));
  expect(screen.queryByLabelText("Mulai")).toBeNull();
  expect(screen.queryByText("Durasi")).toBeNull();
  expect(screen.getAllByText("Terpakai · 1 booking").length).toBeGreaterThan(1);
  expect(screen.getByText("1 jam")).toBeTruthy();
  expect(screen.getAllByText("Booking kamu").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /^Nagapadma, terpakai · 1 booking\. Lihat detail/ }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Book ruang ini" }));
  expect(screen.getByRole("dialog", { name: "Book ruang" })).toBeTruthy();
});
it("shows the calendar only when the floor plan is switched off", () => {
  render(<AppraisalBoard date="2026-11-05" week={["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{}} floorPlan={false} />);
  expect(screen.queryByRole("button", { name: "Denah" })).toBeNull();
});
