import { describe, expect, it } from "vitest";
import { cutoutAlpha, cutoutBox } from "./cutout";

describe("cutting a person out of their photo", () => {
  it("drops what is surely background, keeps what is surely not, and fades the edge between", () => {
    expect(cutoutAlpha(1)).toBe(0);
    expect(cutoutAlpha(0.7)).toBe(0);
    expect(cutoutAlpha(0)).toBe(255);
    expect(cutoutAlpha(0.3)).toBe(255);
    expect(cutoutAlpha(0.5)).toBeGreaterThan(100);
    expect(cutoutAlpha(0.5)).toBeLessThan(160);
  });

  it("finds the box around the person, and none when next to nothing is kept", () => {
    const width = 10, height = 10;
    const alpha = new Uint8ClampedArray(width * height);
    for (let y = 2; y < 9; y += 1) for (let x = 3; x < 7; x += 1) alpha[y * width + x] = 255;
    expect(cutoutBox(alpha, width, height)).toEqual({ left: 3, top: 2, right: 7, bottom: 9 });
    const speck = new Uint8ClampedArray(width * height);
    speck[55] = 255;
    expect(cutoutBox(speck, width, height)).toBeNull();
    expect(cutoutBox(new Uint8ClampedArray(width * height), width, height)).toBeNull();
  });
});
