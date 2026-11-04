/**
 * Reading a QR code from a live camera picture, in the browser. Chrome and Edge have a reader built
 * in (BarcodeDetector); Safari on iPhone and Firefox do not, so there the picture is copied to a
 * small canvas and read with jsQR, which is loaded only when it is needed.
 */

type Native = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type NativeClass = new (options: { formats: string[] }) => Native;

/** A reader for one camera: returns the text of a QR in the current picture, or null. */
export type QrReader = (video: HTMLVideoElement) => Promise<string | null>;

/** Whether this browser can open a camera at all (every reader below needs one). */
export function canUseCamera(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** The longest side the fallback reads at: big enough for a printed QR, small enough to be quick. */
const SIDE = 640;

export async function qrReader(): Promise<QrReader> {
  const Barcode = (window as unknown as { BarcodeDetector?: NativeClass }).BarcodeDetector;
  if (Barcode) {
    try {
      const native = new Barcode({ formats: ["qr_code"] });
      return async video => (await native.detect(video).catch(() => []))[0]?.rawValue || null;
    } catch {
      // Some builds expose the class but do not support QR codes; fall through to jsQR.
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async video => {
    const width = video.videoWidth, height = video.videoHeight;
    if (!context || !width || !height) return null;
    const scale = Math.min(1, SIDE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const picture = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(picture.data, picture.width, picture.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

/** What to tell a person whose camera did not open, by what the browser said. */
export function cameraProblem(error: unknown, otherway: string): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return `Akses kamera ditolak. Buka pengaturan situs di browser, izinkan Kamera, lalu coba lagi. ${otherway}`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `Kamera tidak ditemukan di perangkat ini. ${otherway}`;
  if (name === "NotReadableError") return `Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi. ${otherway}`;
  return `Kamera tidak bisa dibuka. ${otherway}`;
}
