import { expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { cameraProblem } from "./qr-detect";

/** A printed QR as camera pixels: black modules on white, with the quiet zone around it. */
function picture(text: string, scale = 6) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size, margin = 4 * scale, side = size * scale + margin * 2;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!qr.modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = ((margin + y * scale + dy) * side + margin + x * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, side };
}

it("reads a WAM attendance QR without the browser's own reader (Safari on iPhone)", () => {
  const text = "https://journey.werkudara.group/wam/check-in/Ab3dE5fG7hJ9kLmN";
  const { data, side } = picture(text);
  expect(jsQR(data, side, side, { inversionAttempts: "dontInvert" })?.data).toBe(text);
});

it("says why the camera did not open", () => {
  expect(cameraProblem(new DOMException("x", "NotAllowedError"), "Pakai Kamera.")).toMatch(/^Akses kamera ditolak\..* Pakai Kamera\.$/);
  expect(cameraProblem(new DOMException("x", "NotFoundError"), "")).toMatch(/tidak ditemukan/);
  expect(cameraProblem(new Error("x"), "Lagi.")).toBe("Kamera tidak bisa dibuka. Lagi.");
});
