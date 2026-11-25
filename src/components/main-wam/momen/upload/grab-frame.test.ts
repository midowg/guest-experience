import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* grabFrame is plain (KONTRAK §40); applyLook, at Kirim: the colour tone is drawn into the picture first, the sign over it afterwards (so its words and mark are never toned); nothing chosen = the picture as it is. */
const calls: string[] = [];
const drawTemplate = vi.fn((...args: unknown[]) => { void args; calls.push("sign"); });
vi.mock("@/lib/main-wam/momen/camera-template-draw", () => ({ drawTemplate: (...args: unknown[]) => (drawTemplate as unknown as (...a: unknown[]) => void)(...args), loadTemplateAssets: async () => ({ logo: null, net: null }) }));

import { applyLook, grabFrame, type Picture } from "./compress";

function fakeCanvas() {
  const ctx = {
    _filter: "none",
    get filter() { return this._filter; },
    set filter(value: string) { this._filter = value; calls.push(`filter:${value}`); },
    drawImage: () => { calls.push(`draw(${ctx._filter})`); },
    _fill: "", get fillStyle() { return this._fill; }, set fillStyle(value: string) { this._fill = value; }, fillRect: () => { calls.push(`fill(${ctx._fill})`); },
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: () => undefined,
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

beforeEach(() => {
  calls.length = 0; drawTemplate.mockClear();
  vi.stubGlobal("CanvasRenderingContext2D", class { })
  ;(globalThis.CanvasRenderingContext2D.prototype as unknown as { filter: string }).filter = "none";
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => undefined }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const video = { videoWidth: 1600, videoHeight: 1200 } as unknown as HTMLVideoElement;
const closed = vi.fn();
const picture = (): Picture => ({ source: {} as CanvasImageSource, width: 1600, height: 1200, close: closed });

describe("grabFrame", () => {
  it("takes the plain frame: no canvas, no tone, no sign (they are chosen later, in the editor)", async () => {
    await grabFrame(video);
    expect(calls).toEqual([]);
  });
});

describe("applyLook", () => {
  beforeEach(() => closed.mockClear());
  it("with nothing chosen it gives the picture back as it is (no canvas, nothing closed)", async () => {
    const original = picture();
    expect(await applyLook(original)).toBe(original);
    expect(calls).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });
  it("a sign alone: the picture drawn untoned, then the sign; the picture is closed", async () => {
    await applyLook(picture(), "tanda");
    expect(calls).toEqual(["draw(none)", "sign"]);
    expect(calls.some(call => call.startsWith("fill("))).toBe(false); // no filter, no colour layer
    expect(closed).toHaveBeenCalledTimes(1);
  });
  it("a tone alone: the picture drawn toned, no sign", async () => {
    await applyLook(picture(), "tanpa", "mono");
    expect(calls[0]).toMatch(/^filter:grayscale\(1\)/);
    expect(calls).toContain("draw(grayscale(1) contrast(1.08))");
    expect(calls).not.toContain("sign");
    expect(calls[calls.length - 1]).toBe("filter:none");
  });
  it("both: the filter is applied, switched off, and only then the sign is drawn", async () => {
    await applyLook(picture(), "polaroid", "hangat");
    expect(calls.indexOf("filter:none")).toBeGreaterThan(calls.findIndex(call => call.startsWith("draw(sepia")));
    expect(calls[calls.length - 1]).toBe("sign");
    expect(drawTemplate).toHaveBeenCalledTimes(1);
  });
  it("Sejuk and Pudar lay their thin colour layer over the filtered picture, after the filter and before the sign", async () => {
    await applyLook(picture(), "label", "sejuk", "2027-01-06T10:02:00+07:00");
    const layer = calls.findIndex(call => call.startsWith("fill("));
    expect(calls[layer]).toBe("fill(rgba(47, 111, 235, 0.08))");
    expect(layer).toBeGreaterThan(calls.indexOf("filter:none"));
    expect(layer).toBeLessThan(calls.indexOf("sign"));
    // the photo's time goes to the sign's layout (its date and time are printed)
    expect(drawTemplate.mock.calls[0][1]).toEqual(expect.any(Array));
    calls.length = 0;
    await applyLook(picture(), "tanpa", "pudar");
    expect(calls).toContain("fill(rgba(255, 255, 255, 0.06))");
    expect(calls).not.toContain("sign");
  });
});
