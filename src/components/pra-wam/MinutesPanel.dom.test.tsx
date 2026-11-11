import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MinutesView } from "@/lib/pra-wam/minutes";

const request = vi.hoisted(() => vi.fn());
vi.mock("./api", async importOriginal => ({ ...await importOriginal<typeof import("./api")>(), praWamRequest: request }));
import { MinutesPanel } from "./MinutesPanel";

const SESSION = "5e550000-0000-4000-8000-000000000001";
const ACTION = "ac000000-0000-4000-8000-000000000001";
const view = (patch: Partial<MinutesView> = {}): MinutesView => ({
  migrated: true, needed: true, status: "belum", minutes: null, canWrite: true, open: true, viewerId: "me",
  people: [{ id: "11111111-1111-4111-8111-111111111111", name: "Raja" }, { id: "me", name: "Saya" }], ...patch,
});
const written: MinutesView["minutes"] = {
  summary: "Bahas target Q1", decisions: "Target naik 10%", submittedBy: "Raja", submittedAt: "2026-11-10T04:00:00.000Z", updatedBy: "Raja", updatedAt: "2026-11-10T04:00:00.000Z",
  actions: [{ id: ACTION, task: "Kirim data penjualan", picId: "me", picName: "Saya", dueDate: "2026-11-14", done: false }],
};

beforeEach(() => request.mockReset());
afterEach(cleanup);

it("lets someone in the meeting write the MoM: summary, decisions and follow-ups with PIC and due date", async () => {
  request.mockResolvedValue({ data: view({ status: "sudah", minutes: written }), message: "Notulen disimpan." });
  render(<MinutesPanel sessionId={SESSION} initial={view()} />);
  expect(screen.getByText("MoM belum diisi")).toBeTruthy();
  expect(screen.getByText(/Meeting sudah selesai, notulennya belum diisi/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Tulis notulen/ }));
  fireEvent.change(screen.getByLabelText("Ringkasan"), { target: { value: "Bahas target Q1" } });
  fireEvent.change(screen.getByLabelText("Keputusan"), { target: { value: "Target naik 10%" } });
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.click(screen.getByRole("button", { name: /Tambah tindak lanjut/ }));
  fireEvent.change(screen.getByLabelText("Tugas 1"), { target: { value: "Kirim data penjualan" } });
  fireEvent.change(screen.getByLabelText("PIC tugas 1"), { target: { value: "11111111-1111-4111-8111-111111111111" } });
  fireEvent.change(screen.getByLabelText("Tenggat tugas 1"), { target: { value: "2026-11-14" } });
  // An empty second row is left out.
  fireEvent.click(screen.getByRole("button", { name: "Simpan notulen" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0]).toEqual([`/api/wam/sessions/${SESSION}/minutes`, { method: "PUT", json: {
    summary: "Bahas target Q1", decisions: "Target naik 10%",
    actions: [{ task: "Kirim data penjualan", picId: "11111111-1111-4111-8111-111111111111", dueDate: "2026-11-14", done: false }],
  } }]);
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(screen.getByText("Bahas target Q1")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Ubah notulen/ })).toBeTruthy();
});

it("lets the PIC tick a follow-up done without writing the MoM; others only read", async () => {
  request.mockResolvedValue({ data: { ...written!.actions[0], done: true }, message: "Tindak lanjut ditandai selesai." });
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written, canWrite: false })} />);
  expect(screen.queryByRole("button", { name: /Ubah notulen/ })).toBeNull();
  const box = screen.getByRole("checkbox", { name: /Kirim data penjualan/ });
  fireEvent.click(box);
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/wam/sessions/${SESSION}/minutes/actions/${ACTION}`, { method: "PATCH", json: { done: true } }));
  await waitFor(() => expect((screen.getByRole("checkbox", { name: /Kirim data penjualan/ }) as HTMLInputElement).checked).toBe(true));
  unmount();
  // A reader who is not its PIC sees it, without a checkbox.
  render(<MinutesPanel sessionId={SESSION} initial={view({ status: "sudah", minutes: written, canWrite: false, viewerId: "hod" })} />);
  const panel = within(screen.getByRole("region", { name: "Notulen" }));
  expect(panel.queryByRole("checkbox")).toBeNull();
  expect(panel.getByText(/PIC Saya · tenggat/)).toBeTruthy();
});

it("waits for the meeting to start, and for the migration", () => {
  const { unmount } = render(<MinutesPanel sessionId={SESSION} initial={view({ status: "belum-waktunya", canWrite: false, open: false })} />);
  expect(screen.getByText("Notulen bisa ditulis setelah meeting dimulai.")).toBeTruthy();
  unmount();
  render(<MinutesPanel sessionId={SESSION} initial={view({ migrated: false, canWrite: false })} />);
  expect(screen.getByText(/setelah pembaruan sistem selesai/)).toBeTruthy();
});
