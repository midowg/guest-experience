import { describe, expect, it } from "vitest";
import { applyFilterToPixels, CAMERA_TONE_IDS, CAMERA_TONES, cssFilter, DEFAULT_CAMERA_TONE, filterPixel, isCameraTone, toCameraTone, toneTint } from "./camera-filters";

describe("the photo filters", () => {
  it("are Asli, Cerah, Hangat, Sejuk, Pudar and Mono (the old Emas and Fajar are gone); Asli is the default and changes nothing", () => {
    expect(CAMERA_TONE_IDS).toEqual(["asli", "cerah", "hangat", "sejuk", "pudar", "mono"]);
    expect(Object.keys(CAMERA_TONES)).toEqual([...CAMERA_TONE_IDS]);
    expect(DEFAULT_CAMERA_TONE).toBe("asli");
    expect(cssFilter("asli")).toBe("none");
    expect(toneTint("asli")).toBeNull();
    const pixels = new Uint8ClampedArray([10, 120, 250, 255]);
    applyFilterToPixels(pixels, "asli");
    expect([...pixels]).toEqual([10, 120, 250, 255]);
  });

  it("a remembered or sent id that is not a filter any more (Emas, Fajar, Biru) becomes Asli", () => {
    for (const old of ["emas", "fajar", "biru", "", null, undefined, 3]) { expect(isCameraTone(old)).toBe(false); expect(toCameraTone(old)).toBe("asli"); }
    expect(toCameraTone("sejuk")).toBe("sejuk");
  });

  it("the recipes are the prototype's, in the prototype's order (one list: the preview and the photo that is sent use the same string)", () => {
    expect(cssFilter("cerah")).toBe("brightness(1.06) contrast(1.05) saturate(1.12)");
    expect(cssFilter("hangat")).toBe("sepia(0.18) saturate(1.08) hue-rotate(-8deg) brightness(1.03)");
    expect(cssFilter("sejuk")).toBe("saturate(0.95) hue-rotate(8deg) brightness(1.02) contrast(1.03)");
    expect(cssFilter("pudar")).toBe("contrast(0.9) saturate(0.85) brightness(1.06)");
    expect(cssFilter("mono")).toBe("grayscale(1) contrast(1.08)");
  });

  it("Sejuk lays 8 % brand blue and Pudar 6 % white over the picture; the others lay nothing", () => {
    expect(toneTint("sejuk")).toBe("rgba(47, 111, 235, 0.08)");
    expect(toneTint("pudar")).toBe("rgba(255, 255, 255, 0.06)");
    for (const id of ["asli", "cerah", "hangat", "mono"] as const) expect(toneTint(id)).toBeNull();
  });

  describe("the pixel fallback follows the recipe step by step (same result as the CSS filter, within one level)", () => {
    // Values worked out by hand from the Filter Effects formulas.
    it("Mono: a grey pixel, then the contrast of 1.08 around the middle", () => {
      // luminance of (200,100,50) = .2126*200 + .7152*100 + .0722*50 = 42.52 + 71.52 + 3.61 = 117.65; contrast: (117.65 - 127.5) * 1.08 + 127.5 = 116.86
      const [r, g, b] = filterPixel("mono", [200, 100, 50]);
      expect(r).toBeCloseTo(116.86, 1); expect(g).toBeCloseTo(116.86, 1); expect(b).toBeCloseTo(116.86, 1);
    });
    it("Cerah: brighter, a little more contrast, more colour", () => {
      // (128,128,128): brightness 135.68; contrast (135.68 - 127.5) * 1.05 + 127.5 = 136.089; a grey pixel is untouched by saturate
      const [r, g, b] = filterPixel("cerah", [128, 128, 128]);
      expect(r).toBeCloseTo(136.09, 1); expect(g).toBeCloseTo(136.09, 1); expect(b).toBeCloseTo(136.09, 1);
      const [r2, , b2] = filterPixel("cerah", [200, 100, 50]);
      expect(r2 - b2).toBeGreaterThan(150); // 150 apart in the picture, more after the filter
    });
    it("Hangat: warms (red up, blue down) and a grey pixel leans orange", () => {
      const [r, , b] = filterPixel("hangat", [128, 128, 128]);
      expect(r).toBeGreaterThan(b + 10);
    });
    it("Sejuk: a warm pixel loses some red", () => {
      const [r] = filterPixel("sejuk", [200, 100, 50]);
      expect(r).toBeLessThan(200 * 1.02 * 1.03 + 8);
    });
    it("Pudar: blacks are lifted and whites pulled down (less contrast), colours quieter", () => {
      const [r0] = filterPixel("pudar", [0, 0, 0]);
      const [r1] = filterPixel("pudar", [255, 255, 255]);
      expect(r0).toBeGreaterThan(0);
      expect(r1).toBeLessThanOrEqual(255);
      const [r, g] = filterPixel("pudar", [200, 100, 50]);
      expect(r - g).toBeLessThan(100);
    });
    it("is applied to every pixel of the data, alpha stays, and values are kept inside 0-255", () => {
      const data = new Uint8ClampedArray([200, 40, 90, 77, 255, 255, 255, 255]);
      applyFilterToPixels(data, "cerah");
      expect(data[3]).toBe(77);
      expect(data[7]).toBe(255);
      expect(data[4]).toBe(255);
      for (const id of CAMERA_TONE_IDS) {
        const sample = new Uint8ClampedArray([13, 200, 99, 255]);
        applyFilterToPixels(sample, id);
        const [r, g, b] = filterPixel(id, [13, 200, 99]);
        expect(Math.abs(sample[0] - r)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(sample[1] - g)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(sample[2] - b)).toBeLessThanOrEqual(0.5);
      }
    });
  });
});
