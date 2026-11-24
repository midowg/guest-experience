import { describe, expect, it } from "vitest";
import { applyFilterToPixels, CAMERA_FILTER_IDS, CAMERA_FILTERS, cssFilter, DEFAULT_CAMERA_FILTER, isCameraFilter } from "./camera-filters";

describe("the camera's filters", () => {
  it("Asli is the default and changes nothing", () => {
    expect(DEFAULT_CAMERA_FILTER).toBe("asli");
    expect(cssFilter("asli")).toBe("none");
    const pixels = new Uint8ClampedArray([10, 120, 250, 255]);
    applyFilterToPixels(pixels, "asli");
    expect([...pixels]).toEqual([10, 120, 250, 255]);
  });

  it("maps each filter to its CSS filter in a fixed order, from one list", () => {
    expect(CAMERA_FILTER_IDS).toEqual(["asli", "emas", "biru", "jaringan", "polaroid"]);
    expect(cssFilter("polaroid")).toBe("saturate(0.95) contrast(0.97) brightness(1.04)");
    expect(cssFilter("biru")).toBe("sepia(0.3) hue-rotate(175deg) saturate(0.95) contrast(1.05) brightness(0.98)");
    for (const id of CAMERA_FILTER_IDS) expect(Object.keys(CAMERA_FILTERS)).toContain(id);
    expect(isCameraFilter("emas")).toBe(true);
    expect(isCameraFilter("neon")).toBe(false);
  });

  it("the pixel fallback matches the filter: Emas warms, Biru and Jaringan cool, alpha stays", () => {
    const alpha = new Uint8ClampedArray([200, 40, 90, 77]);
    applyFilterToPixels(alpha, "polaroid");
    expect(alpha[3]).toBe(77);
    const net = new Uint8ClampedArray([128, 128, 128, 255]);
    applyFilterToPixels(net, "jaringan");
    expect(net[2]).toBeGreaterThan(net[0]);
    const gold = new Uint8ClampedArray([128, 128, 128, 255]);
    applyFilterToPixels(gold, "emas");
    expect(gold[0]).toBeGreaterThan(gold[2]);
    const blue = new Uint8ClampedArray([128, 128, 128, 255]);
    applyFilterToPixels(blue, "biru");
    expect(blue[2]).toBeGreaterThan(blue[0]);
  });
});
