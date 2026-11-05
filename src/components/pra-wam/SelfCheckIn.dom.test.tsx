import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelfCheckIn } from "./SelfCheckIn";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
const checkInOffline = vi.fn();
const checkInOnline = vi.fn();
const shrinkProof = vi.fn();
vi.mock("./proofUpload", () => ({
  checkInOffline: (...args: unknown[]) => checkInOffline(...args),
  checkInOnline: (...args: unknown[]) => checkInOnline(...args),
  shrinkProof: (...args: unknown[]) => shrinkProof(...args),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => undefined;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
// Kamis 26 Nov 2026, 10.00–12.00 WIB: absen 09.30–12.30.
const now = "2026-11-26T03:00:00.000Z";
const open = { kind: "buka" as const, closes: "2026-11-26T05:30:00.000Z" };
const hadir = () => screen.getByRole("button", { name: "Saya hadir" });
const dialog = () => screen.queryByRole("dialog");

it("is disabled before the window opens and after it closes, and says why", () => {
  const { rerender } = render(<SelfCheckIn sessionId={SESSION} now="2026-11-26T01:00:00.000Z" selfReady
    status={{ kind: "belum", opens: "2026-11-26T02:30:00.000Z", closes: "2026-11-26T05:30:00.000Z" }} />);
  expect(hadir()).toHaveProperty("disabled", true);
  expect(screen.getByText("Absen dibuka 30 menit sebelum mulai (09.30).")).toBeTruthy();
  expect(document.getElementById(hadir().getAttribute("aria-describedby")!)?.textContent).toContain("Absen dibuka 30 menit sebelum mulai (09.30)");
  rerender(<SelfCheckIn sessionId={SESSION} now="2026-11-26T06:00:00.000Z" selfReady status={{ kind: "tutup" }} />);
  expect(hadir()).toHaveProperty("disabled", true);
  expect(screen.getByText("Absen sudah ditutup")).toBeTruthy();
});

it("shows how the person was recorded, without the button", () => {
  render(<SelfCheckIn sessionId={SESSION} now={now} selfReady status={{ kind: "hadir", at: "2026-11-26T02:42:00Z", method: "online" }} />);
  expect(screen.getByText("Hadir 09.42 · online (Zoom)")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Saya hadir" })).toBeNull();
});

it("has no button before the migration: the QR words stay", () => {
  render(<SelfCheckIn sessionId={SESSION} now={now} selfReady={false} status={open} />);
  expect(screen.queryByRole("button", { name: "Saya hadir" })).toBeNull();
  expect(screen.getByText(/Scan QR yang ditempel di ruang/)).toBeTruthy();
});

it("asks where, records offline with one tap, and updates in place", async () => {
  checkInOffline.mockResolvedValue({ answer: { kind: "tercatat", checkedInAt: "2026-11-26T02:42:00Z", method: "offline" }, message: "Absen tercatat." });
  render(<SelfCheckIn sessionId={SESSION} now={now} selfReady status={open} />);
  hadir().focus();
  fireEvent.click(hadir());
  expect(dialog()).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Kamu hadir di mana?" })).toBeTruthy();
  expect(document.activeElement?.textContent).toContain("Di kantor (offline)");

  // Esc closes and gives the focus back.
  fireEvent(dialog()!, new Event("cancel", { cancelable: true }));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(hadir());

  fireEvent.click(hadir());
  fireEvent.click(screen.getByRole("button", { name: /Di kantor \(offline\)/ }));
  await waitFor(() => expect(screen.getByText("Hadir 09.42 · di kantor")).toBeTruthy());
  expect(checkInOffline).toHaveBeenCalledWith(SESSION);
  expect(dialog()).toBeNull();
  expect(screen.queryByRole("button", { name: "Saya hadir" })).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("shows a refusal in the dialog and keeps it open", async () => {
  checkInOffline.mockRejectedValue(Object.assign(new Error("Absen sudah ditutup 12.30. Bila kamu hadir, minta panitia mencatat secara manual."), { name: "PraWamApiError" }));
  render(<SelfCheckIn sessionId={SESSION} now={now} selfReady status={open} />);
  fireEvent.click(hadir());
  fireEvent.click(screen.getByRole("button", { name: /Di kantor \(offline\)/ }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/^Absen sudah ditutup 12\.30/);
  expect(dialog()).not.toBeNull();
  expect(refresh).not.toHaveBeenCalled();
});

it("needs a screenshot before online can be sent, previews it, then records online", async () => {
  const blob = new Blob([new Uint8Array(10)], { type: "image/webp" });
  shrinkProof.mockResolvedValue({ blob, mime: "image/webp" });
  checkInOnline.mockImplementation(async (_id: string, _blob: Blob, _mime: string, progress: (share: number) => void) => {
    progress(0.5);
    return { answer: { kind: "tercatat", checkedInAt: "2026-11-26T02:45:00Z", method: "online" }, message: "Absen tercatat." };
  });
  const { container } = render(<SelfCheckIn sessionId={SESSION} now={now} selfReady status={open} />);
  fireEvent.click(hadir());
  fireEvent.click(screen.getByRole("button", { name: /Online lewat Zoom/ }));
  expect(screen.getByText("Unggah tangkapan layar Zoom yang menunjukkan kamu di meeting ini.")).toBeTruthy();
  const send = screen.getByRole("button", { name: "Kirim dan tandai hadir" });
  expect(send).toHaveProperty("disabled", true);

  const [gallery, shot] = [...container.querySelectorAll<HTMLInputElement>("input[type=file]")];
  expect(gallery.hasAttribute("capture")).toBe(false);
  expect(shot.getAttribute("capture")).toBe("environment");
  // Not a picture: a plain message, still nothing to send.
  fireEvent.change(gallery, { target: { files: [new File(["x"], "catatan.pdf", { type: "application/pdf" })] } });
  expect(screen.getByRole("alert").textContent).toMatch(/JPG, PNG, WebP, atau HEIC/);
  expect(shrinkProof).not.toHaveBeenCalled();

  fireEvent.change(gallery, { target: { files: [new File(["png"], "zoom.png", { type: "image/png" })] } });
  expect((await screen.findByRole("img", { name: "Pratinjau tangkapan layar Zoom" })).getAttribute("src")).toBe("blob:preview");
  expect(screen.getByRole("button", { name: "Pilih gambar lain" })).toBeTruthy();
  expect(send).toHaveProperty("disabled", false);
  fireEvent.click(send);
  await waitFor(() => expect(screen.getByText("Hadir 09.45 · online (Zoom)")).toBeTruthy());
  expect(checkInOnline).toHaveBeenCalledWith(SESSION, blob, "image/webp", expect.any(Function));
  expect(dialog()).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("goes back from the online step to the choice", () => {
  render(<SelfCheckIn sessionId={SESSION} now={now} selfReady status={open} />);
  fireEvent.click(hadir());
  fireEvent.click(screen.getByRole("button", { name: /Online lewat Zoom/ }));
  fireEvent.click(screen.getByRole("button", { name: "Kembali" }));
  expect(screen.getByRole("heading", { name: "Kamu hadir di mana?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Batal" }));
  expect(dialog()).toBeNull();
});
