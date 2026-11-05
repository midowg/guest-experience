import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QuickActions } from "./QuickActions";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

const openSheet = () => {
  fireEvent.click(screen.getByRole("button", { name: "Aksi cepat" }));
  return within(screen.getByRole("dialog", { name: "Aksi cepat" }));
};

describe("Aksi cepat", () => {
  it("opens the session whose check-in is open with Saya hadir, and Scan QR and Book ruang", () => {
    render(<QuickActions place="bar" checkIn={{ title: "Review data departemen", href: "/wam?item=s1" }} bookingOpen manages={false} />);
    const sheet = openSheet();
    expect(sheet.getByRole("link", { name: /Saya hadir.*Review data departemen/ }).getAttribute("href")).toBe("/wam?item=s1");
    expect(sheet.getByRole("link", { name: /Scan QR absen/ }).getAttribute("href")).toBe("/wam/check-in");
    expect(sheet.getByRole("link", { name: /Book ruang/ }).getAttribute("href")).toBe("/wam/book/new");
    expect(sheet.queryByRole("link", { name: /Buat sesi/ })).toBeNull();
  });

  it("keeps Saya hadir in its place, saying why, when no check-in is open", () => {
    render(<QuickActions place="bar" checkIn={null} bookingOpen={false} manages={false} />);
    const sheet = openSheet();
    expect(sheet.queryByRole("link", { name: /Saya hadir/ })).toBeNull();
    expect(sheet.getByText("Saya hadir").closest("[aria-disabled='true']")?.textContent).toContain("Absen dibuka 30 menit sebelum sesi mulai");
    expect(sheet.queryByRole("link", { name: /Book ruang/ })).toBeNull();
  });

  it("gives the panitia who run sessions Buat sesi and Kirim pengumuman", () => {
    render(<QuickActions place="top" checkIn={null} bookingOpen manages />);
    const sheet = openSheet();
    expect(sheet.getByRole("link", { name: /Buat sesi/ }).getAttribute("href")).toBe("/wam/manage/sessions/new");
    expect(sheet.getByRole("link", { name: /Kirim pengumuman/ }).getAttribute("href")).toBe("/wam/manage/announcements");
  });
});
