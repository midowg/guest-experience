import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push, replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, "aria-label": label, className }: { href: string; children: React.ReactNode; "aria-label"?: string; className?: string }) => <a href={href} aria-label={label} className={className}>{children}</a> }));
import { AppraisalBoard } from "./AppraisalBoard";
afterEach(cleanup);
// jsdom has no modal dialogs: enough of one for the Sheet.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
const rooms: Room[] = [{ id: "r1", slug: "r1", name: "Nagapadma", kind: "area", capacity: 6, bookable: true, minPeople: null, planKey: null, facilities: [] }];
const b: Booking = { id: "b1", roomId: "r1", title: "Rapat KPI", description: "x", startsAt: wibInstant("2026-11-05", "10:00"), endsAt: wibInstant("2026-11-05", "11:00"), bookedBy: { id: "me", name: "Aku", department: "IT" }, participants: [] };
it("renders Book ruang and Booking saya only; a booking opens its detail, Ubah and Book ruang open the form over the page", () => {
  const replace = vi.spyOn(window.history, "replaceState");
  render(<AppraisalBoard date="2026-11-04" week={["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{}} />);
  // No calendar and no floor plan (9 Nov 2026): the day is picked on Timeline's calendar.
  expect(screen.queryByRole("button", { name: "Denah" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Kalender" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Pilih hari" })).toBeNull();
  expect(screen.getByRole("link", { name: "kalender Timeline" }).getAttribute("href")).toBe("/wam/timeline");
  fireEvent.click(screen.getByRole("button", { name: /Rapat KPI/ }));
  expect(screen.getByRole("dialog", { name: "Rapat KPI" })).toBeTruthy();
  expect(replace.mock.calls.at(-1)?.[2]).toBe("/wam/book?date=2026-11-05&booking=b1");
  // Ubah and Book ruang open the form over the page (from the right on a desktop, the bottom on a phone).
  fireEvent.click(screen.getByRole("button", { name: "Ubah" }));
  expect(screen.getByRole("dialog", { name: "Ubah booking" })).toBeTruthy();
  expect((screen.getByLabelText("Nama kegiatan") as HTMLInputElement).value).toBe("Rapat KPI");
  fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
  fireEvent.click(screen.getAllByRole("button", { name: /Book ruang/ })[0]);
  expect(screen.getByRole("dialog", { name: "Book ruang" })).toBeTruthy();
  expect(push).not.toHaveBeenCalled();
});
it("opens a sheet from the address", () => {
  render(<AppraisalBoard date="2026-11-05" week={["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{ booking: "zzz" }} />);
  expect(screen.getByText(/tidak ada di jadwal/)).toBeTruthy();
});
it("shows each HOD's answer on a booking made as HOD, with Terima and Tolak for an invited HOD", async () => {
  const week = ["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
  const hodInfo = { [b.id]: { meetingId: "m1", status: "menunggu" as const, requesterId: "x", invites: [
    { id: "me", name: "Saya", unit: "Finance", response: "menunggu" as const, note: "", respondedAt: null },
    { id: "y", name: "Yulia", unit: "BAS", response: "terima" as const, note: "", respondedAt: "x" },
  ] } };
  render(<AppraisalBoard date="2026-11-05" week={week} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{ booking: b.id }} hodInfo={hodInfo} />);
  // No Meeting HOD tab: it lives in the booking itself.
  expect(screen.queryByRole("button", { name: /Meeting HOD/ })).toBeNull();
  const sheet = within(screen.getByRole("dialog", { name: "Rapat KPI" }));
  const box = within(sheet.getByRole("region", { name: "Meeting HOD" }));
  expect(box.getByText("1 dari 2 menerima")).toBeTruthy();
  expect(box.getByText("Menerima")).toBeTruthy();
  expect(box.getByRole("button", { name: "Terima" })).toBeTruthy();
  expect(box.getByRole("button", { name: "Tolak" })).toBeTruthy();
});
it("offers one way to take a booking off, Batalkan, after a confirmation naming it", async () => {
  const week = ["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
  render(<AppraisalBoard date="2026-11-05" week={week} dates={["2026-11-04","2026-11-05"]} now={wibInstant("2026-11-04","10:12")}
    rooms={rooms} bookings={[b]} mine={[b]} viewerId="me" canCancelAny={false} open form={{ people: [], groups: [], usedTitles: [] }} arrive={{ booking: "b1" }} />);
  const sheet = within(screen.getByRole("dialog", { name: "Rapat KPI" }));
  expect(sheet.queryByRole("button", { name: "Hapus" })).toBeNull();
  fireEvent.click(sheet.getByRole("button", { name: "Batalkan" }));
  expect(await screen.findByText(/^"Rapat KPI", Kamis, 5 Nov, 10\.00–11\.00, Nagapadma\./)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Batalkan booking" })).toBeTruthy();
});
