import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScheduleExport } from "./ScheduleExport";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ScheduleExport (Linimasa)", () => {
  it("offers PDF and Excel for the week on screen and the WhatsApp text, which can be changed before it is sent", async () => {
    fetchMock.mockResolvedValue(new Response("meeting tanggal 10\n- Appraisal team SS | *CFC Ananta Room* | 11.00 - 12.30 (2 pax)\n\nupdate per 10/11/2026 11.50 WIB"));
    render(<ScheduleExport range="minggu" date="2026-11-10" label="9 – 15 Nov 2026" />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/wam/sessions/export?format=text&rentang=minggu&tanggal=2026-11-10");
    expect(screen.getByRole("link", { name: "PDF" }).getAttribute("href")).toContain("format=pdf&rentang=minggu&tanggal=2026-11-10");
    expect(screen.getByRole("link", { name: "Excel" }).getAttribute("href")).toContain("format=xlsx");
    const text = await screen.findByDisplayValue(/meeting tanggal 10/);
    fireEvent.change(text, { target: { value: "meeting tanggal 10\n@Mas Raja" } });
    await waitFor(() => expect(screen.getByRole("link", { name: "Kirim ke WhatsApp" }).getAttribute("href")).toBe(`https://wa.me/?text=${encodeURIComponent("meeting tanggal 10\n@Mas Raja")}`));
  });

  it("says so when the text cannot be made", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    render(<ScheduleExport range="hari" date="2026-11-10" label="Selasa, 10 Nov 2026" />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText(/Teks belum bisa dibuat/)).toBeTruthy();
  });
});
