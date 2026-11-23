import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FaceCheckIn, FaceResult, FACING_YAW, hintOf, type FaceClient } from "./FaceCheckIn";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  // Reduced motion: the percent shows at once.
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const noop = () => undefined;

it("says hadir with the percent, the batas cocok and both photos", async () => {
  render(<FaceResult answer={{ kind: "tercatat", checkedInAt: "2026-11-09T03:10:00Z", method: "wajah", percent: 92, status: "cocok" }} photoUrl="blob:foto" referenceUrl="https://r2.example/acuan" onRetry={noop} onDone={noop} />);
  expect(screen.getByRole("status").textContent).toBe("Kamu tercatat hadir");
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("92");
  expect(screen.getByText("Batas cocok 76%")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("92%")).toBeTruthy());
  expect(screen.getByAltText("Foto absen")).toBeTruthy();
  expect(screen.getByAltText("Foto awal di WG People")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Selesai" })).toBeTruthy();
});

it("says perlu cek, and for no match offers Ambil ulang and Scan QR", () => {
  const { rerender } = render(<FaceResult answer={{ kind: "tercatat", checkedInAt: "2026-11-09T03:10:00Z", method: "wajah", percent: 64, status: "perlu_cek" }} photoUrl={null} referenceUrl={null} onRetry={noop} onDone={noop} />);
  expect(screen.getByRole("status").textContent).toBe("Tercatat, menunggu cek");
  const retry = vi.fn();
  rerender(<FaceResult answer={{ kind: "tidak-cocok", percent: 21 }} photoUrl={null} referenceUrl={null} onRetry={retry} onDone={noop} />);
  expect(screen.getByRole("status").textContent).toBe("Wajah belum cocok");
  fireEvent.click(screen.getByRole("button", { name: "Ambil ulang" }));
  expect(retry).toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Scan QR saja" }).getAttribute("href")).toBe("/wam/check-in");
});

it("sends someone without a WG People face to the QR, before any camera", async () => {
  const client: FaceClient = { start: vi.fn(async () => ({ kind: "tanpa-wajah" as const, message: "Wajahmu belum terdaftar di WG People." })), send: vi.fn() };
  render(<FaceCheckIn sessionId="s1" canTap client={client} />);
  fireEvent.click(screen.getByRole("button", { name: "Absen pakai wajah" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Wajahmu belum terdaftar di WG People."));
  expect(screen.getByRole("link", { name: "Scan QR saja" })).toBeTruthy();
  expect(client.send).not.toHaveBeenCalled();
});

it("cannot be pressed while the check-in is closed", () => {
  render(<FaceCheckIn sessionId="s1" canTap={false} client={{ start: vi.fn(), send: vi.fn() }} />);
  expect((screen.getByRole("button", { name: "Absen pakai wajah" }) as HTMLButtonElement).disabled).toBe(true);
});

it("lets the photo be taken only while one near face looks straight at the camera", () => {
  expect(hintOf(1, 0.2, 0)).toBeNull();
  expect(hintOf(1, 0.2, FACING_YAW)).toBeNull();
  expect(hintOf(1, 0.2, FACING_YAW + 5)).toBe("Hadapkan wajahmu lurus ke kamera");
  expect(hintOf(1, 0.2, -30)).toBe("Hadapkan wajahmu lurus ke kamera");
  expect(hintOf(1, 0.2, null)).toBe("Hadapkan wajahmu lurus ke kamera");
  expect(hintOf(0, 0, null)).toBe("Arahkan wajahmu ke kamera");
  expect(hintOf(2, 0.2, 0)).toBe("Pastikan hanya kamu yang terlihat");
  expect(hintOf(1, 0.05, 0)).toBe("Dekatkan wajah ke kamera");
});
