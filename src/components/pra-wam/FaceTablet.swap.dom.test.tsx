import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KioskAnswer, KioskCandidate, KioskRecorded } from "@/lib/pra-wam/face-kiosk";

/*
 * The bug from the first try (23 Nov 2026): Ayu was being read, stepped out, Budi stepped into the
 * same place, and Budi's box got Ayu's name. The answer must stay with the face that was read.
 */
const unit = (axis: number) => { const vector = new Array<number>(128).fill(0); vector[axis] = 1; return vector; };
const AYU = unit(0), BUDI = unit(1);
let inFront = AYU;
const look = () => ({
  faces: 1, closeness: 0.1, box: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
  points: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  signal: { t: performance.now(), blinkLeft: 0.1, blinkRight: 0.1, smileLeft: 0.1, smileRight: 0.1, yaw: 0 },
});
vi.mock("@/components/hr/faceEngine", () => ({
  loadFaceEngine: async () => ({ readAll: () => [look()], embed: async () => ({ embedding: inFront, sharpness: 60 }) }),
}));
vi.mock("./FaceCheckIn", () => ({ cropSelfie: async () => ({ blob: new Blob(["x"]), mime: "image/webp" }) }));

beforeAll(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 });
  HTMLMediaElement.prototype.play = async () => undefined;
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => undefined })) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(cleanup);

const person = (name: string): KioskCandidate => ({ employeeId: name, name, department: "Comms", percent: 90, referenceUrl: null, token: "t", upload: { key: "k", uploadUrl: "", token: "u" } });

it("keeps a name on the face that was read, not on whoever steps into its place", async () => {
  const { FaceTablet } = await import("./FaceTablet");
  let answerAyu: (answer: KioskAnswer) => void = () => undefined;
  const identify = vi.fn((_session: string, input: { embedding: number[] }) => input.embedding[0] === 1
    ? new Promise<KioskAnswer>(resolve => { answerAyu = resolve; })
    : Promise.resolve<KioskAnswer>({ kind: "tidak-dikenali" }));
  const record = vi.fn(async (): Promise<KioskRecorded> => ({ kind: "tercatat", person: { employeeId: "Ayu", name: "Ayu Lestari", department: "Comms", percent: 90 }, checkedInAt: new Date().toISOString(), present: 1 }));
  const now = Date.now();
  const { container } = render(<FaceTablet sessionId="s" title="Forum" when="Senin" backHref="/" client={{ identify, record }}
    overview={{ total: 2, withFace: 2, present: 0, opens: new Date(now - 60_000).toISOString(), closes: new Date(now + 3_600_000).toISOString() }} />);
  fireEvent.click(screen.getByRole("button", { name: /Mulai/ }));

  await waitFor(() => expect(identify).toHaveBeenCalledTimes(1), { timeout: 4000 });
  // Ayu steps out mid-read; Budi stands in the same place.
  inFront = BUDI;
  await act(() => new Promise(resolve => setTimeout(resolve, 1000)));
  await act(async () => { answerAyu({ kind: "cocok", candidate: person("Ayu Lestari") }); });

  await waitFor(() => expect(screen.getAllByRole("status").map(item => item.textContent).join(" ")).toMatch(/Ayu Lestari.*Tercatat hadir/));
  // The message names Ayu (she was recorded), but no box carries her name: the box in front is Budi's.
  const labels = () => Array.from(container.querySelectorAll("[aria-hidden] span")).map(item => item.textContent).join(" ");
  expect(labels()).not.toMatch(/Ayu/);
  // And Budi is read on his own.
  await waitFor(() => expect(identify).toHaveBeenCalledTimes(2), { timeout: 4000 });
  expect(identify.mock.calls[1][1].embedding).toEqual(BUDI);
  expect(labels()).not.toMatch(/Ayu/);
}, 15_000);
