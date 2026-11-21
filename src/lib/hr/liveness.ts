/*
 * Absen harian (20 Nov 2026): is it a living face, not a photo or a screen? The server picks two
 * steps at random for each clock-in (blink, turn left, turn right, smile), the phone follows the
 * face with MediaPipe and sends what it saw frame by frame, and both sides judge the steps with
 * these same rules. A printed photo or a recorded video cannot follow steps it did not know.
 * Pure, so the server checks it again without a camera.
 */

export const LIVENESS_STEPS = ["kedip", "toleh_kiri", "toleh_kanan", "senyum"] as const;
export type LivenessStep = (typeof LIVENESS_STEPS)[number];
export const CHALLENGE_LENGTH = 2;

/**
 * What the phone saw in one frame. Blinks and smiles are MediaPipe blendshapes (0 = open / neutral,
 * 1 = fully closed / smiling). `yaw` is the head's turn in degrees **from the person's own point of
 * view**: negative = turned to their own left, positive = to their own right, 0 = facing the camera.
 */
export type FrameSignal = { t: number; blinkLeft: number; blinkRight: number; smileLeft: number; smileRight: number; yaw: number };

export const LIVENESS = {
  /** Both eyes at least this closed is a blink; both at most `eyeOpen` is open. */
  eyeClosed: 0.45,
  eyeOpen: 0.25,
  smile: 0.5,
  neutralSmile: 0.25,
  /** A turn: at least this many degrees, after facing the camera (within `facing`). */
  turn: 20,
  facing: 10,
  /** The most frames the phone sends (about 12 s at 20 fps). */
  maxFrames: 240,
} as const;

export const stepPrompts: Record<LivenessStep, string> = {
  kedip: "Kedipkan mata",
  toleh_kiri: "Toleh ke kiri",
  toleh_kanan: "Toleh ke kanan",
  senyum: "Tersenyum",
};
export const stepPrompt = (step: LivenessStep) => stepPrompts[step];

/** FNV-1a: a small, stable hash of the nonce. */
function hash(text: string, seed: number): number {
  let value = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** The steps for one clock-in, the same on the phone and the server for the same nonce. */
export function pickChallenge(nonce: string, length = CHALLENGE_LENGTH): LivenessStep[] {
  const pool = [...LIVENESS_STEPS];
  const steps: LivenessStep[] = [];
  for (let i = 0; i < Math.min(length, LIVENESS_STEPS.length); i += 1) {
    const [step] = pool.splice(hash(nonce, i) % pool.length, 1);
    steps.push(step);
  }
  return steps;
}

const eyesClosed = (frame: FrameSignal) => frame.blinkLeft >= LIVENESS.eyeClosed && frame.blinkRight >= LIVENESS.eyeClosed;
const eyesOpen = (frame: FrameSignal) => frame.blinkLeft <= LIVENESS.eyeOpen && frame.blinkRight <= LIVENESS.eyeOpen;
const smile = (frame: FrameSignal) => (frame.smileLeft + frame.smileRight) / 2;
const facing = (frame: FrameSignal) => Math.abs(frame.yaw) <= LIVENESS.facing;

/**
 * Where a step is finished in the frames, looking from `from`: the index of the frame that ends
 * it, or -1. Each step needs a neutral frame before it, so holding a pose from the start does not
 * count. A blink must open again.
 */
export function stepDoneAt(step: LivenessStep, frames: readonly FrameSignal[], from = 0): number {
  let ready = false;
  let closed = false;
  for (let i = from; i < frames.length; i += 1) {
    const frame = frames[i];
    switch (step) {
      case "kedip":
        if (!closed && eyesOpen(frame)) ready = true;
        else if (ready && eyesClosed(frame)) closed = true;
        else if (closed && eyesOpen(frame)) return i;
        break;
      case "senyum":
        if (smile(frame) <= LIVENESS.neutralSmile) ready = true;
        else if (ready && smile(frame) >= LIVENESS.smile) return i;
        break;
      case "toleh_kiri":
        if (facing(frame)) ready = true;
        else if (ready && frame.yaw <= -LIVENESS.turn) return i;
        break;
      case "toleh_kanan":
        if (facing(frame)) ready = true;
        else if (ready && frame.yaw >= LIVENESS.turn) return i;
        break;
    }
  }
  return -1;
}

export const stepDone = (step: LivenessStep, frames: readonly FrameSignal[], from = 0) => stepDoneAt(step, frames, from) >= 0;

/**
 * Every step, in its order. The next step looks from the frame that ended the one before (an
 * opened eye after a blink is also a neutral face), so no frame finishes two steps.
 */
export function challengeDone(steps: readonly LivenessStep[], frames: readonly FrameSignal[]): boolean {
  let from = 0;
  for (const step of steps) {
    const at = stepDoneAt(step, frames, from);
    if (at < 0) return false;
    from = at;
  }
  return true;
}

/** Frames that are plausible at all: finite numbers, time going forward, at most `maxFrames`. */
export function framesLookReal(frames: readonly FrameSignal[]): boolean {
  if (!frames.length || frames.length > LIVENESS.maxFrames) return false;
  let last = -Infinity;
  for (const frame of frames) {
    const values = [frame.t, frame.blinkLeft, frame.blinkRight, frame.smileLeft, frame.smileRight, frame.yaw];
    if (!values.every(Number.isFinite) || frame.t < last) return false;
    if ([frame.blinkLeft, frame.blinkRight, frame.smileLeft, frame.smileRight].some(value => value < 0 || value > 1) || Math.abs(frame.yaw) > 90) return false;
    last = frame.t;
  }
  return true;
}
