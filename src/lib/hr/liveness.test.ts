import { describe, expect, it } from "vitest";
import { CHALLENGE_LENGTH, challengeDone, framesLookReal, LIVENESS, LIVENESS_STEPS, pickChallenge, stepDone, stepPrompt, type FrameSignal } from "./liveness";

const neutral: Omit<FrameSignal, "t"> = { blinkLeft: 0.05, blinkRight: 0.05, smileLeft: 0.05, smileRight: 0.05, yaw: 0 };
/** Frames from poses, 50 ms apart. */
const frames = (...poses: Partial<Omit<FrameSignal, "t">>[]): FrameSignal[] => poses.map((pose, i) => ({ t: i * 50, ...neutral, ...pose }));
const closed = { blinkLeft: 0.8, blinkRight: 0.8 };
const smile = { smileLeft: 0.7, smileRight: 0.7 };

describe("challenge", () => {
  it("picks two different steps, the same for the same nonce", () => {
    const steps = pickChallenge("nonce-contoh-0001");
    expect(steps).toHaveLength(CHALLENGE_LENGTH);
    expect(new Set(steps).size).toBe(CHALLENGE_LENGTH);
    expect(pickChallenge("nonce-contoh-0001")).toEqual(steps);
  });
  it("uses every step across many nonces", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickChallenge(`nonce-${i}-abcdefgh`)).flat());
    expect([...seen].sort()).toEqual([...LIVENESS_STEPS].sort());
  });
  it("has a prompt for every step", () => {
    for (const step of LIVENESS_STEPS) expect(stepPrompt(step).length).toBeGreaterThan(3);
  });
});

describe("steps", () => {
  it("counts a blink only when the eyes open again", () => {
    expect(stepDone("kedip", frames({}, closed, {}))).toBe(true);
    expect(stepDone("kedip", frames({}, closed))).toBe(false);
    // Eyes closed from the start (a photo with closed eyes) is not a blink.
    expect(stepDone("kedip", frames(closed, closed, closed))).toBe(false);
  });
  it("counts a smile after a neutral face", () => {
    expect(stepDone("senyum", frames({}, smile))).toBe(true);
    expect(stepDone("senyum", frames(smile, smile))).toBe(false);
  });
  it("counts a turn to the person's own left and right after facing the camera", () => {
    expect(stepDone("toleh_kiri", frames({ yaw: 0 }, { yaw: -LIVENESS.turn }))).toBe(true);
    expect(stepDone("toleh_kiri", frames({ yaw: 0 }, { yaw: LIVENESS.turn }))).toBe(false);
    expect(stepDone("toleh_kanan", frames({ yaw: 0 }, { yaw: 25 }))).toBe(true);
    expect(stepDone("toleh_kanan", frames({ yaw: 30 }, { yaw: 30 }))).toBe(false);
  });
  it("needs the steps in their order", () => {
    const blinkThenSmile = frames({}, closed, {}, smile);
    expect(challengeDone(["kedip", "senyum"], blinkThenSmile)).toBe(true);
    expect(challengeDone(["senyum", "kedip"], blinkThenSmile)).toBe(false);
  });
});

describe("frames", () => {
  it("accepts real-looking frames and refuses impossible ones", () => {
    expect(framesLookReal(frames({}, closed, {}))).toBe(true);
    expect(framesLookReal([])).toBe(false);
    expect(framesLookReal(frames({ blinkLeft: 2 }))).toBe(false);
    expect(framesLookReal([{ t: 100, ...neutral }, { t: 50, ...neutral }])).toBe(false);
    expect(framesLookReal(Array.from({ length: LIVENESS.maxFrames + 1 }, (_, i) => ({ t: i, ...neutral })))).toBe(false);
  });
});
