import { describe, expect, it, vi } from "vitest";
import { CAMERA_FILTER_IDS, DEFAULT_CAMERA_FILTER } from "./camera-filters";
import { drawTemplate } from "./camera-template-draw";
import { CAMERA_TEMPLATES, LOGO_ASPECT, TEMPLATE_TITLE, templateLayout, type TemplateOp } from "./camera-templates";

describe("the camera's event templates", () => {
  it("are Asli plus four, Asli first and the default, and each of the four carries the event's words and a mark in the top right", () => {
    expect(CAMERA_TEMPLATES.map(template => template.id)).toEqual(["asli", "emas", "biru", "jaringan", "polaroid"]);
    expect(CAMERA_TEMPLATES.map(template => template.id)).toEqual([...CAMERA_FILTER_IDS]);
    expect(DEFAULT_CAMERA_FILTER).toBe("asli");
    const [asli, ...rest] = CAMERA_TEMPLATES;
    expect(asli.lines).toEqual([]); expect(asli.logo).toBeNull();
    for (const template of rest) {
      expect(template.lines.join(" ").toLowerCase(), template.id).toBe(TEMPLATE_TITLE.toLowerCase());
      expect(template.logo).toBe("top-right");
    }
  });

  it("Asli draws nothing", () => { expect(templateLayout("asli", 400, 500)).toEqual([]); });

  for (const id of ["emas", "biru", "jaringan", "polaroid"] as const) {
    for (const [width, height] of [[400, 500], [1200, 1500], [640, 800]]) {
      it(`${id} at ${width}x${height}: the mark sits in the top right, the words are inside the photo and scale with its width`, () => {
        const ops = templateLayout(id, width, height, "id");
        const logo = ops.find((op): op is Extract<TemplateOp, { k: "logo" }> => op.k === "logo")!;
        expect(logo.x + logo.w).toBeLessThanOrEqual(width);
        expect(logo.x).toBeGreaterThan(width / 2);
        expect(logo.y).toBeLessThan(height / 4);
        expect(logo.w / logo.h).toBeCloseTo(LOGO_ASPECT, 3);
        expect(logo.w).toBeGreaterThan(width * 0.06); expect(logo.w).toBeLessThan(width * 0.16);
        const texts = ops.filter((op): op is Extract<TemplateOp, { k: "text" }> => op.k === "text");
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          const spread = text.text.length * text.size * (0.72 + text.ls);
          expect(spread, text.text).toBeLessThanOrEqual(text.maxW + 0.01);
          expect(text.maxW).toBeLessThan(width);
          expect(text.y).toBeGreaterThan(height * 0.7); // on the bottom edge, never over the faces
        }
        expect(texts.map(text => text.text).join(" ")).toContain(id === "biru" ? "ANNUAL MEETING 2026" : TEMPLATE_TITLE.toUpperCase());
      });
    }
  }

  it("the date line follows the language", () => {
    const text = (lang: "id" | "en") => templateLayout("polaroid", 400, 500, lang).filter(op => op.k === "text").map(op => (op as { text: string }).text).join("|");
    expect(text("id")).toContain("4–7 JANUARI 2027 · KOTA BATU");
    expect(text("en")).toContain("4–7 JANUARY 2027 · KOTA BATU");
  });
});

function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const ctx = {
    save: record("save"), restore: record("restore"), fillRect: record("fillRect"), strokeRect: record("strokeRect"), fillText: record("fillText"), drawImage: record("drawImage"),
    createLinearGradient: () => ({ addColorStop: vi.fn() }), measureText: (text: string) => ({ width: text.length * 6 }),
    fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, font: "", textAlign: "", textBaseline: "", shadowColor: "", shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: "", imageSmoothingQuality: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("drawing a template on the photo", () => {
  const logo = { tag: "logo" } as unknown as CanvasImageSource;
  const scratch = fakeContext();
  const make = () => ({ width: 419, height: 477, getContext: () => scratch.ctx as CanvasRenderingContext2D });

  it("draws the tinted mark in the top right corner, then the words, on the photo's canvas", () => {
    for (const id of ["emas", "biru", "jaringan", "polaroid"] as const) {
      const { ctx, calls } = fakeContext();
      drawTemplate(ctx, templateLayout(id, 1000, 1250, "id"), { logo, net: null }, make);
      const mark = calls.find(call => call.name === "drawImage")!;
      const [, x, y, w, h] = mark.args as number[];
      expect(x + w, id).toBeLessThanOrEqual(1000);
      expect(x, id).toBeGreaterThan(500);
      expect(y, id).toBeLessThan(300);
      expect(h, id).toBeGreaterThan(0);
      expect(calls.filter(call => call.name === "fillText").length, id).toBeGreaterThan(20);
    }
    // the mark was tinted on its own scratch canvas first (source-in), so it is not black on a dark photo
    expect(scratch.calls.some(call => call.name === "drawImage" && call.args[0] === logo)).toBe(true);
    expect(scratch.ctx.globalCompositeOperation).toBe("source-in");
  });

  it("without the mark (it did not load) the rest is still drawn: the photo is not lost", () => {
    const { ctx, calls } = fakeContext();
    expect(() => drawTemplate(ctx, templateLayout("emas", 1000, 1250, "id"), { logo: null, net: null }, make)).not.toThrow();
    expect(calls.some(call => call.name === "drawImage")).toBe(false);
    expect(calls.some(call => call.name === "fillText")).toBe(true);
  });
});
