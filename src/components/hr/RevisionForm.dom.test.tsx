import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DailyRecord } from "@/lib/hr/attendance";

/* Ajukan revisi (21 Nov 2026): only the choices that fit, and what is sent. A made-up person. */
const api = vi.hoisted(() => ({ submitRequest: vi.fn(), cancelRequest: vi.fn() }));
vi.mock("./clockInApi", () => api);
const { RevisionForm } = await import("./RevisionForm");

const masuk: DailyRecord = {
  id: "11111111-2222-4333-8444-555555555555", kind: "masuk", at: "2026-11-19T01:40:00Z", workDate: "2026-11-19", method: "wajah", status: "sah", flags: [],
  officeName: "Kantor Contoh", distanceM: 20, accuracyM: 10, faceScore: 0.6, reasonKind: null, reasonText: null, hasSelfie: true, reviewNote: null,
};
beforeEach(() => { api.submitRequest.mockReset(); api.submitRequest.mockResolvedValue("Revisi terkirim. Admin HR akan memeriksanya."); });
afterEach(() => cleanup());

it("offers Lupa absen for an empty pulang and sends the time and the reason", async () => {
  const onDone = vi.fn();
  render(<RevisionForm date="2026-11-19" records={{ masuk, pulang: null }} zone="WIB" waiting={[]} onDone={onDone} onCancel={vi.fn()} />);
  expect((screen.getByLabelText(/Pulang · belum ada/) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByLabelText("Lupa absen pulang")).toBeTruthy();
  expect(screen.queryByLabelText("Batalkan absen")).toBeNull();
  fireEvent.change(screen.getByLabelText(/Jam yang benar/), { target: { value: "17:30" } });
  const send = screen.getByRole("button", { name: "Kirim revisi" }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Kenapa perlu direvisi?"), { target: { value: "HP mati" } });
  fireEvent.click(send);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith("Revisi terkirim. Admin HR akan memeriksanya."));
  expect(api.submitRequest).toHaveBeenCalledWith(expect.objectContaining({ type: "tambah", workDate: "2026-11-19", kind: "pulang", recordId: null, time: "17:30", note: "HP mati" }));
});

it("offers to fix or cancel an existing masuk, and waits when one is already asked", () => {
  const { rerender } = render(<RevisionForm date="2026-11-19" records={{ masuk, pulang: masuk }} zone="WIB" waiting={[]} onDone={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByLabelText("Jam salah")).toBeTruthy();
  expect(screen.getByLabelText("Batalkan absen")).toBeTruthy();
  rerender(<RevisionForm date="2026-11-19" records={{ masuk, pulang: masuk }} zone="WIB" waiting={["masuk"]} onDone={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByText(/Sudah ada revisi yang menunggu/)).toBeTruthy();
});
