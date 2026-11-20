import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./FaceCamera", () => ({
  FaceCamera: ({ onDone, purpose }: { onDone: (capture: unknown) => void; purpose: string }) =>
    <button type="button" onClick={() => onDone({ embedding: [], frameEmbeddings: [], signals: [], steps: [], selfie: { blob: new Blob(), mime: "image/webp" } })}>Kamera palsu {purpose}</button>,
}));

const { ClockInFlow } = await import("./ClockInFlow");

const office = { id: "o1", name: "Kantor Contoh", lat: -7.8, lng: 110.4, radiusM: 100, zone: "WIB" as const };
const base: ClockInState = {
  ready: true, waiting: null, face: { status: "aktif", source: "daftar", consented: true },
  today: { workDate: "2026-11-20", masuk: null, pulang: null }, offices: [office], recent: [], method: "gerakan", requests: [],
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
afterEach(() => cleanup());

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
  expect(await screen.findByText("Absen masuk tercatat.")).toBeTruthy();
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
  expect(await screen.findByText(/Wajahmu terdaftar/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Lanjut absen masuk/ })).toBeTruthy();
});

it("explains a refused location and lets the person read it again", async () => {
  const { PraWamApiError } = await import("@/components/pra-wam/api");
  api.readPlace.mockRejectedValueOnce(new PraWamApiError("Akses lokasi ditolak. Buka pengaturan situs di browser, izinkan Lokasi untuk WAM, lalu coba lagi."));
  render(<ClockInFlow initial={base} />);
  fireEvent.click(screen.getByRole("button", { name: /Absen masuk/ }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Akses lokasi ditolak/);
  api.readPlace.mockResolvedValue({ lat: -7.8, lng: 110.4, accuracyM: 8 });
  fireEvent.click(screen.getByRole("button", { name: /Baca ulang lokasi/ }));
  expect(await screen.findByText(/Di dalam area/)).toBeTruthy();
});
