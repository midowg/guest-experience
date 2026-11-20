import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { FrameSignal, LivenessStep } from "@/lib/hr/liveness";
import type { FaceReading } from "./faceEngine";

/*
 * The camera and the face engine are stand-ins: the engine answers a scripted list of looks, one
 * per frame, so the test walks the whole flow (straight look, blink, straight, smile, straight,
 * selfie) without a camera or a model.
 */
let script: { faces?: number; signal?: Partial<FrameSignal> }[] = [];
let frame = 0;
const embedding = Array.from({ length: 128 }, (_, i) => (i % 7) - 3);

vi.mock("./faceEngine", () => ({
  MIN_SHARPNESS: 20,
  loadFaceEngine: async () => ({
    read: (_video: unknown, t: number): FaceReading => {
      const look = script[Math.min(frame, script.length - 1)];
      frame += 1;
      const one = (look.faces ?? 1) === 1;
      return {
        faces: look.faces ?? 1,
        signal: one ? { t, blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.05, smileRight: 0.05, yaw: 0, ...look.signal } : null,
        points: one ? [[40, 50], [70, 50], [55, 70], [42, 90], [70, 90]] : null,
        box: one ? { x: 0.35, y: 0.3, width: 0.3, height: 0.36 } : null,
        closeness: 0.2,
      };
    },
    embed: async () => ({ embedding, sharpness: 200 }),
    analyzeImage: async () => ({ ok: false, reason: "tidak_ada_wajah" }),
    timings: { loadMs: 1, embedMs: 1 },
  }),
}));

const { FaceCamera } = await import("./FaceCamera");

const straight = (count: number) => Array.from({ length: count }, () => ({}));
const steps: LivenessStep[] = ["kedip", "senyum"];

beforeEach(() => {
  frame = 0;
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: "high" } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback: BlobCallback, type?: string) { callback(new Blob(["x"], { type: type ?? "image/png" })); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("walks a straight look, each step and a selfie, then hands back three looks", async () => {
  script = [
    ...straight(4),
    { signal: { blinkLeft: 0.8, blinkRight: 0.8 } }, {},
    ...straight(4),
    { signal: { smileLeft: 0.7, smileRight: 0.7 } },
    ...straight(4),
  ];
  const onDone = vi.fn();
  render(<FaceCamera steps={steps} purpose="absen" onDone={onDone} />);
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 6000 });
  const capture = onDone.mock.calls[0][0];
  expect(capture.frameEmbeddings).toHaveLength(3);
  expect(capture.steps).toEqual(steps);
  expect(capture.embedding).toHaveLength(128);
  expect(capture.selfie.mime).toBe("image/webp");
  expect(capture.signals.length).toBeGreaterThan(5);
}, 10_000);

it("asks for only one face in the picture", async () => {
  script = [{ faces: 2 }];
  render(<FaceCamera steps={steps} purpose="absen" onDone={vi.fn()} />);
  expect(await screen.findByText("Pastikan hanya kamu yang terlihat di kamera", {}, { timeout: 3000 })).toBeTruthy();
});

it("explains a refused camera and offers to try again", async () => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => { throw new DOMException("no", "NotAllowedError"); }) } });
  script = [{}];
  render(<FaceCamera steps={steps} purpose="daftar" onDone={vi.fn()} />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/Akses kamera ditolak/);
  expect(screen.getByRole("button", { name: /Coba lagi/ })).toBeTruthy();
});
