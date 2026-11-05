import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QuickActions } from "./QuickActions";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const now = "2026-11-10T02:10:00Z"; // Selasa 10 Nov, 09.10 WIB
const base = { checkIn: null, upcoming: null, bookingOpen: false, manages: false, running: [], waiting: 0, place: "bar" as const, now };
const openSheet = () => {
  fireEvent.click(screen.getByRole("button", { name: /^Aksi cepat/ }));
  return within(screen.getByRole("dialog", { name: "Aksi cepat" }));
};

describe("Aksi cepat", () => {
  it("leads with Saya hadir while a check-in is open, opening the choice on Beranda, and marks the +", () => {
    render(<QuickActions {...base} checkIn={{ title: "Review data departemen", closes: "2026-11-10T06:30:00Z" }} bookingOpen />);
    expect(screen.getByRole("button", { name: /Aksi cepat, absen sedang dibuka/ })).toBeTruthy();
    const sheet = openSheet();
    const hadir = sheet.getByRole("link", { name: /Saya hadir/ });
    expect(hadir.getAttribute("href")).toBe("/wam?absen=1");
    expect(hadir.textContent).toContain("Review data departemen · dibuka sampai 13.30");
    expect(sheet.getByRole("link", { name: /Scan QR absen/ }).getAttribute("href")).toBe("/wam/check-in");
    expect(sheet.getByRole("link", { name: /Book ruang/ }).getAttribute("href")).toBe("/wam/book/new");
    expect(sheet.queryByRole("region", { name: "Panitia" })).toBeNull();
  });

  it("keeps Saya hadir in its place when nothing is open, saying which session opens next and when", () => {
    render(<QuickActions {...base} upcoming={{ title: "Diskusi pleno", opens: "2026-11-11T01:30:00Z" }} />);
    const sheet = openSheet();
    expect(sheet.queryByRole("link", { name: /Saya hadir/ })).toBeNull();
    expect(sheet.getByText("Saya hadir").closest("[aria-disabled='true']")?.textContent)
      .toContain("Diskusi pleno: absen dibuka Rabu, 11 Nov pukul 08.30");
    expect(sheet.queryByRole("link", { name: /Book ruang/ })).toBeNull();
  });

  it("says plainly when there is nothing to check in to", () => {
    render(<QuickActions {...base} />);
    expect(openSheet().getByText("Tidak ada sesi yang perlu diabsen.")).toBeTruthy();
  });

  it("gives the panitia Daftar hadir for each session running, the requests waiting, Buat sesi and Kirim pengumuman", () => {
    render(<QuickActions {...base} place="top" manages waiting={2} running={[{ id: "s9", title: "Pembukaan" }]} />);
    const panitia = within(openSheet().getByRole("region", { name: "Panitia" }));
    expect(panitia.getByRole("link", { name: /Daftar hadir.*Pembukaan/ }).getAttribute("href")).toBe("/wam/manage/sessions/s9/attendance");
    expect(panitia.getByRole("link", { name: /Permintaan jadwal/ }).textContent).toContain("2 menunggu keputusan");
    expect(panitia.getByRole("link", { name: /Buat sesi/ }).getAttribute("href")).toBe("/wam/manage/sessions/new");
    expect(panitia.getByRole("link", { name: /Kirim pengumuman/ }).getAttribute("href")).toBe("/wam/manage/announcements");
  });
});
