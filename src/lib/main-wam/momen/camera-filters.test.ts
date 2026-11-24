import { describe, expect, it } from "vitest";
import { applyFilterToPixels, CAMERA_TONE_IDS, CAMERA_TONES, cssFilter, DEFAULT_CAMERA_TONE, isCameraTone } from "./camera-filters";

describe("the camera's colour tones", () => {
  it("are Asli, Emas, Fajar and Mono (no Biru), Asli is the default and changes nothing", () => {
    expect(CAMERA_TONE_IDS).toEqual(["asli", "emas", "fajar", "mono"]);
    expect(DEFAULT_CAMERA_TONE).toBe("asli");
    expect(cssFilter("asli")).toBe("none");
    const pixels = new Uint8ClampedArray([10, 120, 250, 255]);
    applyFilterToPixels(pixels, "asli");
    expect([...pixels]).toEqual([10, 120, 250, 255]);
    expect(isCameraTone("biru")).toBe(false);
    expect(isCameraTone("mono")).toBe(true);
  });

  it("maps each tone to its CSS filter in a fixed order, from one list", () => {
    expect(cssFilter("emas")).toBe("sepia(0.3) saturate(1.2) contrast(1.03) brightness(1.05)");
    expect(cssFilter("fajar")).toBe("saturate(0.95) contrast(0.97) brightness(1.06)");
    expect(cssFilter("mono")).toBe("grayscale(1) contrast(1.04) brightness(1.02)");
    for (const id of CAMERA_TONE_IDS) expect(Object.keys(CAMERA_TONES)).toContain(id);
  });

  it("the pixel fallback matches the tone: Emas warms, Fajar lifts, Mono is grey, alpha stays", () => {
    const alpha = new Uint8ClampedArray([200, 40, 90, 77]);
    applyFilterToPixels(alpha, "fajar");
    expect(alpha[3]).toBe(77);
    const gold = new Uint8ClampedArray([128, 128, 128, 255]);
    applyFilterToPixels(gold, "emas");
    expect(gold[0]).toBeGreaterThan(gold[2]);
    const dawn = new Uint8ClampedArray([100, 100, 100, 255]);
    applyFilterToPixels(dawn, "fajar");
    expect(dawn[0]).toBeGreaterThan(100);
    const mono = new Uint8ClampedArray([220, 60, 20, 255]);
    applyFilterToPixels(mono, "mono");
    expect(Math.abs(mono[0] - mono[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(mono[1] - mono[2])).toBeLessThanOrEqual(1);
  });
});
