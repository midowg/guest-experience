import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AttendanceRequest, DailyRecord } from "@/lib/hr/attendance";

/* Ajukan revisi (21 Nov 2026): a sheet with Batal and Kirim; the day, only the choices that fit, and what is sent. A made-up person. */
const api = vi.hoisted(() => ({ submitRequest: vi.fn(), cancelRequest: vi.fn() }));
vi.mock("./clockInApi", () => api);
const { RevisionSheet } = await import("./RevisionForm");

const masuk: DailyRecord = {
  id: "11111111-2222-4333-8444-555555555555", kind: "masuk", at: "2026-11-19T01:40:00Z", workDate: "2026-11-19", method: "wajah", status: "sah", flags: [],
  officeName: "Kantor Contoh", distanceM: 20, accuracyM: 10, faceScore: 0.6, reasonKind: null, reasonText: null, hasSelfie: true, reviewNote: null,
};
const pulang: DailyRecord = { ...masuk, id: "11111111-2222-4333-8444-666666666666", kind: "pulang", at: "2026-11-19T10:10:00Z" };
const waitingMasuk: AttendanceRequest = {
  id: "q1", type: "ubah_jam", status: "menunggu", workDate: "2026-11-19", kind: "masuk", recordId: masuk.id, proposedTime: "08:15", zone: "WIB",
  reasonKind: null, reasonText: null, note: "Salah jam", decisionNote: null, decidedLabel: null, createdAt: "2026-11-19T12:00:00Z",
};
beforeEach(() => { api.submitRequest.mockReset(); api.submitRequest.mockResolvedValue("Revisi terkirim. Admin HR akan memeriksanya."); });
afterEach(() => cleanup());

it("offers Lupa absen for an empty pulang and sends the time and the reason with Kirim", async () => {
  const onDone = vi.fn(), onCancel = vi.fn();
  render(<RevisionSheet today="2026-11-19" recent={[masuk]} requests={[]} zone="WIB" onDone={onDone} onCancel={onCancel} />);
  expect(screen.getByRole("dialog", { name: "Ajukan revisi" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(onCancel).toHaveBeenCalled();
  expect((screen.getByLabelText(/Tanggal/) as HTMLInputElement).value).toBe("2026-11-19");
  expect(screen.getByRole("button", { name: /Pulang · belum ada/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText("Lupa absen pulang")).toBeTruthy();
  expect(screen.queryByLabelText("Batalkan absen")).toBeNull();
  fireEvent.change(screen.getByLabelText(/Jam yang benar/), { target: { value: "17:30" } });
  const send = screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Kenapa perlu direvisi?"), { target: { value: "HP mati" } });
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith("Revisi terkirim. Admin HR akan memeriksanya."));
  expect(api.submitRequest).toHaveBeenCalledWith(expect.objectContaining({ type: "tambah", workDate: "2026-11-19", kind: "pulang", recordId: null, time: "17:30", note: "HP mati" }));
  expect(screen.queryByRole("button", { name: "Batal" })).toBeNull();
});

it("offers to fix or cancel an existing masuk, and waits when one is already asked", () => {
  const { rerender } = render(<RevisionSheet today="2026-11-19" recent={[masuk, pulang]} requests={[]} zone="WIB" onDone={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Jam salah")).toBeTruthy();
  expect(screen.getByLabelText("Batalkan absen")).toBeTruthy();
  rerender(<RevisionSheet today="2026-11-19" recent={[masuk, pulang]} requests={[waitingMasuk]} zone="WIB" onDone={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByText(/Sudah ada revisi yang menunggu/)).toBeTruthy();
});

it("opens on the day it was asked from, starts afresh on another day, and keeps to the last 31 days", () => {
  render(<RevisionSheet today="2026-11-20" initialDate="2026-11-19" recent={[masuk, pulang]} requests={[]} zone="WIB" onDone={vi.fn()} onCancel={vi.fn()} />);
  const day = screen.getByLabelText(/Tanggal/) as HTMLInputElement;
  expect(day.value).toBe("2026-11-19");
  expect(screen.getByLabelText("Jam salah")).toBeTruthy();
  expect(day.min).toBe("2026-10-20");
  expect(day.max).toBe("2026-11-20");
  fireEvent.change(day, { target: { value: "2026-11-18" } });
  expect(screen.getByRole("button", { name: /Masuk · belum ada/ }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText("Lupa absen masuk")).toBeTruthy();
  fireEvent.change(day, { target: { value: "2026-12-01" } });
  expect(day.value).toBe("2026-11-18");
});
