import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClockInState, DailyRecord } from "@/lib/hr/attendance";

/* The clock-in screen with the server and the camera replaced: made-up office and person. */
const api = vi.hoisted(() => ({
  loadState: vi.fn(),
  readPlace: vi.fn(),
  startClockIn: vi.fn(),
  startEnroll: vi.fn(),
  submitClockIn: vi.fn(),
  submitEnroll: vi.fn(),
  withdrawFace: vi.fn(),
}));
vi.mock("./clockInApi", () => api);
// The bottom menu's place comes from the address; Beranda unless a test says otherwise.
const nav = vi.hoisted(() => ({ path: "/people" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));
vi.mock("./FaceCamera", () => ({
  FaceCamera: ({ onDone, purpose }: { onDone: (capture: unknown) => void; purpose: string }) =>
    <button type="button" onClick={() => onDone({ embedding: [], frameEmbeddings: [], signals: [], steps: [], selfie: { blob: new Blob(), mime: "image/webp" } })}>Kamera palsu {purpose}</button>,
}));

const { ClockInFlow } = await import("./ClockInFlow");

const office = { id: "o1", name: "Kantor Contoh", lat: -7.8, lng: 110.4, radiusM: 100, zone: "WIB" as const };
const base: ClockInState = {
  ready: true, waiting: null, face: { status: "aktif", source: "daftar", consented: true },
  today: { workDate: "2026-11-20", masuk: null, pulang: null }, offices: [office], recent: [], method: "gerakan", requests: [], leaves: [],
};
const record: DailyRecord = {
  id: "r1", kind: "masuk", at: "2026-11-20T01:30:00Z", workDate: "2026-11-20", method: "wajah", status: "sah", flags: [],
  officeName: "Kantor Contoh", distanceM: 20, accuracyM: 10, faceScore: 0.6, reasonKind: null, reasonText: null, hasSelfie: true, reviewNote: null,
};
const challenge = { purpose: "masuk", nonce: "n".repeat(24), steps: ["kedip", "senyum"], token: "t", expiresAt: "" };

beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset());
  api.loadState.mockResolvedValue({ ...base, today: { ...base.today, masuk: record } });
  api.startClockIn.mockResolvedValue({ kind: "tantangan", challenge, needsConsent: false });
  api.submitClockIn.mockResolvedValue({ data: { kind: "tercatat", record }, message: "Absen masuk tercatat." });
});
afterEach(() => { cleanup(); nav.path = "/people"; });
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

it("says what it waits for before it is ready", () => {
  render(<ClockInFlow initial={{ ...base, ready: false, waiting: "Absen harian menunggu migrasi 202611200701_pw_absen_harian.sql." }} />);
  expect(screen.getByText(/menunggu migrasi/)).toBeTruthy();
});

it("clocks in inside the office: location, camera, then the answer without a reload", async () => {
  api.readPlace.mockResolvedValue({ lat: -7.8003, lng: 110.4, accuracyM: 12 });
  render(<ClockInFlow initial={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  expect(await screen.findByText(/Di dalam area/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Lanjut ke kamera/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Kamera palsu absen" }));
  expect(await screen.findByRole("heading", { name: "Tercatat. Selamat bekerja!" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Absen masuk, bukti" })).toBeTruthy();
  expect(api.submitClockIn).toHaveBeenCalledWith(challenge, expect.anything(), { lat: -7.8003, lng: 110.4, accuracyM: 12 }, null, null);
});

it("asks for a reason outside every office point before the camera", async () => {
  api.readPlace.mockResolvedValue({ lat: -7.9, lng: 110.4, accuracyM: 12 });
  render(<ClockInFlow initial={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  expect(await screen.findByText(/Di luar area kantor/)).toBeTruthy();
  const next = screen.getByRole("button", { name: /Lanjut ke kamera/ }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("WFH"));
  expect(next.disabled).toBe(false);
  fireEvent.click(next);
  fireEvent.click(await screen.findByRole("button", { name: "Kamera palsu absen" }));
  await waitFor(() => expect(api.submitClockIn).toHaveBeenCalled());
  expect(api.submitClockIn.mock.calls[0][3]).toEqual({ kind: "wfh", text: "" });
});

it("asks for consent and enrols someone without a face first", async () => {
  api.startEnroll.mockResolvedValue({ ...challenge, purpose: "daftar" });
  api.submitEnroll.mockResolvedValue({ data: { status: "menunggu" }, message: "Wajahmu terdaftar. Admin akan memeriksanya; sementara itu absenmu tetap tercatat." });
  render(<ClockInFlow initial={{ ...base, face: null }} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  const agree = screen.getByRole("button", { name: /Setuju, daftarkan wajah/ }) as HTMLButtonElement;
  expect(agree.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(agree);
  fireEvent.click(await screen.findByRole("button", { name: "Kamera palsu daftar" }));
  expect(await screen.findByRole("heading", { name: /Wajahmu terdaftar/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Lanjut absen masuk/ })).toBeTruthy();
});

it("explains a refused location and lets the person read it again", async () => {
  const { PraWamApiError } = await import("@/components/pra-wam/api");
  api.readPlace.mockRejectedValueOnce(new PraWamApiError("Akses lokasi ditolak. Buka pengaturan situs di browser, izinkan Lokasi untuk WG People, lalu coba lagi."));
  render(<ClockInFlow initial={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Akses lokasi ditolak/);
  api.readPlace.mockResolvedValue({ lat: -7.8, lng: 110.4, accuracyM: 8 });
  fireEvent.click(screen.getByRole("button", { name: /Baca ulang lokasi/ }));
  expect(await screen.findByText(/Di dalam area/)).toBeTruthy();
});

it("opens clocking in as a sheet with Batal as the one way out, which the back button also does", async () => {
  api.readPlace.mockResolvedValue({ lat: -7.8003, lng: 110.4, accuracyM: 12 });
  render(<ClockInFlow initial={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  expect(screen.getByRole("dialog", { name: "Absen masuk" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Tutup" })).toBeNull();
  expect((window.history.state as { hrTop?: string }).hrTop).toBe("sheet");
  // Batal goes back one step in the history; the browser then reports it (jsdom does not, so the test does).
  const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(back).toHaveBeenCalledOnce();
  back.mockRestore();
  window.history.replaceState(null, "");
  act(() => { window.dispatchEvent(new PopStateEvent("popstate", { state: null })); });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("shows each place of the bottom menu from the same data, each button once", () => {
  const today = { ...base, today: { ...base.today, masuk: record }, recent: [record], requests: [] };
  nav.path = "/people/riwayat";
  const { rerender } = render(<ClockInFlow initial={today} name="Contoh" fullName="Contoh Satu" />);
  expect(screen.getByRole("heading", { name: "Riwayat" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Hari ini, masuk/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Absen/ })).toBeNull();
  nav.path = "/people/pengajuan";
  rerender(<ClockInFlow initial={today} name="Contoh" fullName="Contoh Satu" />);
  expect(screen.getAllByRole("button", { name: /Ajukan/ })).toHaveLength(1);
  expect(screen.getByText("Tidak ada yang menunggu")).toBeTruthy();
  nav.path = "/people/profil";
  rerender(<ClockInFlow initial={today} name="Contoh" fullName="Contoh Satu" />);
  expect(screen.getByRole("heading", { name: "Contoh Satu" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Keluar" })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Ajukan/ })).toBeNull();
});

it("opens a day as a detail screen with a back button and Revisi, which opens the revision sheet on that day", () => {
  const today = { ...base, today: { ...base.today, masuk: record }, recent: [record] };
  nav.path = "/people/riwayat";
  render(<ClockInFlow initial={today} />);
  fireEvent.click(screen.getByRole("button", { name: /Hari ini, masuk/ }));
  expect(screen.getByRole("heading", { level: 1, name: /20 Nov/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Kembali" })).toBeTruthy();
  expect(screen.getByText("Tidak ada absen pulang")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Revisi" }));
  expect((screen.getByLabelText(/Tanggal/) as HTMLInputElement).value).toBe("2026-11-20");
});

it("asks before signing out", () => {
  nav.path = "/people/profil";
  render(<ClockInFlow initial={base} fullName="Contoh Satu" />);
  fireEvent.click(screen.getByRole("button", { name: "Keluar" }));
  expect(screen.getByRole("alertdialog", { name: "Keluar dari WG People?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
