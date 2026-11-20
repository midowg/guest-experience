import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DailyRecord } from "@/lib/hr/attendance";
import { hrAdminApi } from "@/lib/routes";
import { RecordReview } from "./RecordReview";

/* "Hapus absen" (21 Nov 2026): asks in place first, then deletes. A made-up person. */
const record: DailyRecord = {
  id: "11111111-2222-4333-8444-555555555555", kind: "masuk", at: "2026-11-20T01:52:00Z", workDate: "2026-11-20", method: "wajah", status: "perlu_cek",
  flags: ["di_luar_area"], officeName: "Kantor Contoh", distanceM: 8200, accuracyM: 12, faceScore: 0.55, reasonKind: "dinas", reasonText: null, hasSelfie: true, reviewNote: null,
};
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: record, message: "Absen masuk dihapus." }), { status: 200, headers: { "Content-Type": "application/json" } }));

beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("asks in place, naming whose clock-in it is, before deleting it and its selfie", async () => {
  const onDeleted = vi.fn(), onMessage = vi.fn();
  render(<RecordReview record={record} employeeId="e1" name="Contoh Satu" hasFace onChanged={vi.fn()} onDeleted={onDeleted} onMessage={onMessage} />);
  fireEvent.click(screen.getByRole("button", { name: /Hapus absen/ }));
  expect(fetchMock).not.toHaveBeenCalled();
  const ask = screen.getByRole("alertdialog");
  expect(ask.textContent).toMatch(/Hapus absen masuk Contoh Satu/);
  expect(ask.textContent).toMatch(/Selfie-nya ikut terhapus/);
  fireEvent.click(screen.getByRole("button", { name: /Ya, hapus absen/ }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(record));
  expect(fetchMock).toHaveBeenCalledWith(hrAdminApi.record(record.id), expect.objectContaining({ method: "DELETE" }));
  expect(onMessage).toHaveBeenCalledWith({ tone: "success", text: "Absen masuk dihapus. (Contoh Satu)" });
});

it("deletes nothing when the question is cancelled", () => {
  render(<RecordReview record={record} employeeId="e1" name="Contoh Satu" hasFace onChanged={vi.fn()} onDeleted={vi.fn()} onMessage={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Hapus absen/ }));
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
