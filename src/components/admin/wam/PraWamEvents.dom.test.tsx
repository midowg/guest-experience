import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PraWamEvent } from "@/lib/server/pra-wam/events";

const request = vi.fn();
vi.mock("@/components/admin/shared/api", async importOriginal => ({ ...(await importOriginal<object>()), adminRequest: (...args: unknown[]) => request(...args) }));
const { PraWamEvents, eventDates } = await import("./PraWamEvents");

afterEach(() => { cleanup(); request.mockReset(); });

const events: PraWamEvent[] = [
  { id: "a", slug: "pra-wam", name: "Pra WAM", kind: "pra_wam", startDate: "2026-11-10", endDate: "2026-12-20", status: "aktif", modules: { appraisal: true } },
  { id: "b", slug: "wam-2027", name: "WAM 2027", kind: "wam", startDate: "2027-01-04", endDate: "2027-01-07", status: "disiapkan", modules: {} },
];

it("writes a date range once per year", () => {
  expect(eventDates("2027-01-04", "2027-01-07")).toBe("4 Jan – 7 Jan 2027");
  expect(eventDates("2026-12-30", "2027-01-02")).toBe("30 Des 2026 – 2 Jan 2027");
  expect(eventDates("2027-01-04", "2027-01-04")).toBe("4 Jan 2027");
});

it("shows each event as a card, and saves a module switched off", async () => {
  request.mockResolvedValue({ message: "Tersimpan.", data: { events: [{ ...events[0], modules: { appraisal: false } }, events[1]] } });
  render(<PraWamEvents initial={events} migrated />);
  const pra = screen.getByRole("region", { name: "Pra WAM" });
  expect(within(pra).getByText("Aktif")).toBeTruthy();
  expect(within(pra).getByText("Dibuka")).toBeTruthy();
  const wam = screen.getByRole("region", { name: "WAM 2027" });
  expect(within(wam).getByText("Disiapkan")).toBeTruthy();
  expect(within(wam).getByText("Modul WAM disiapkan setelah Pra WAM.")).toBeTruthy();

  const save = within(pra).getByRole("button", { name: "Simpan" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(within(pra).getByRole("switch", { name: "Book: booking ruang" }));
  expect(within(pra).getByText("Ditutup")).toBeTruthy();
  fireEvent.click(within(pra).getByRole("button", { name: "Simpan" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse((request.mock.calls[0][1] as { body: string }).body)).toEqual({ status: "aktif", modules: { appraisal: false } });
  expect(await screen.findByText("Pra WAM: Tersimpan.")).toBeTruthy();
});
