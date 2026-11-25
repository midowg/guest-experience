import { describe, expect, it, vi } from "vitest";
import { drawTemplate } from "./camera-template-draw";
import { CAMERA_TEMPLATES, DEFAULT_SIGN, LOGO_ASPECT, SIGN_IDS, SIMPLE_LINE, TEMPLATE_TITLE, templateLayout, type TemplateOp } from "./camera-templates";

describe("the camera's signs", () => {
  it("are Tanpa, Simpel, Emas, Jaringan and Polaroid (no Biru), Tanpa first and the default; each sign but Tanpa carries the event's words and a mark in the top right", () => {
    expect(CAMERA_TEMPLATES.map(template => template.id)).toEqual(["tanpa", "simpel", "emas", "jaringan", "polaroid"]);
    expect(CAMERA_TEMPLATES.map(template => template.id)).toEqual([...SIGN_IDS]);
    expect(DEFAULT_SIGN).toBe("tanpa");
    const [tanpa, simpel, ...frames] = CAMERA_TEMPLATES;
    expect(tanpa.lines).toEqual([]); expect(tanpa.logo).toBeNull();
    expect(simpel.lines).toEqual([SIMPLE_LINE]); expect(simpel.logo).toBe("top-right");
    for (const template of frames) {
      expect(template.lines.join(" ").toLowerCase(), template.id).toBe(TEMPLATE_TITLE.toLowerCase());
      expect(template.logo).toBe("top-right");
    }
  });

  it("Tanpa draws nothing", () => { expect(templateLayout("tanpa", 400, 500)).toEqual([]); });

  it("a sign carries no colour tone: it draws only its own shapes, words and mark (nothing that filters the photo)", () => {
    for (const id of SIGN_IDS) for (const op of templateLayout(id, 400, 500)) expect(["rect", "grad", "frame", "text", "logo", "net"]).toContain(op.k);
  });

  it("Simpel is one small line at the bottom left and a small mark in the top right", () => {
    const ops = templateLayout("simpel", 400, 500, "id");
    const texts = ops.filter((op): op is Extract<TemplateOp, { k: "text" }> => op.k === "text");
    expect(texts.map(text => text.text)).toEqual(["WAM 2026 · Kota Batu · 5–8 Jan 2027"]);
    expect(texts[0].align).toBe("start");
    expect(texts[0].size).toBeLessThanOrEqual(11);
    expect(texts[0].x).toBeLessThan(40);
    const logo = ops.find((op): op is Extract<TemplateOp, { k: "logo" }> => op.k === "logo")!;
    expect(logo.h).toBeLessThanOrEqual(32);
  });

  for (const id of ["simpel", "emas", "jaringan", "polaroid"] as const) {
    for (const [width, height] of [[400, 500], [1200, 1500], [640, 800]]) {
      it(`${id} at ${width}x${height}: the mark sits in the top right, the words are inside the photo and scale with its width`, () => {
        const ops = templateLayout(id, width, height, "id");
        const logo = ops.find((op): op is Extract<TemplateOp, { k: "logo" }> => op.k === "logo")!;
        expect(logo.x + logo.w).toBeLessThanOrEqual(width);
        expect(logo.x).toBeGreaterThan(width / 2);
        expect(logo.y).toBeLessThan(height / 4);
        expect(logo.w / logo.h).toBeCloseTo(LOGO_ASPECT, 3);
        expect(logo.w).toBeGreaterThan(width * 0.05); expect(logo.w).toBeLessThan(width * 0.16);
        const texts = ops.filter((op): op is Extract<TemplateOp, { k: "text" }> => op.k === "text");
        expect(texts.length).toBeGreaterThan(0);
        for (const text of texts) {
          const spread = text.text.length * text.size * (0.72 + text.ls);
          expect(spread, text.text).toBeLessThanOrEqual(text.maxW + 0.01);
          expect(text.maxW).toBeLessThan(width);
          expect(text.y).toBeGreaterThan(height * 0.7); // on the bottom edge, never over the faces
        }
        expect(texts.map(text => text.text).join(" ")).toContain(id === "simpel" ? SIMPLE_LINE : TEMPLATE_TITLE.toUpperCase());
      });
    }
  }

  it("the date line follows the language", () => {
    const text = (lang: "id" | "en") => templateLayout("polaroid", 400, 500, lang).filter(op => op.k === "text").map(op => (op as { text: string }).text).join("|");
    expect(text("id")).toContain("5–8 JANUARI 2027 · KOTA BATU");
    expect(text("en")).toContain("5–8 JANUARY 2027 · KOTA BATU");
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
    for (const id of ["simpel", "emas", "jaringan", "polaroid"] as const) {
      const { ctx, calls } = fakeContext();
      drawTemplate(ctx, templateLayout(id, 1000, 1250, "id"), { logo, net: null }, make);
      const mark = calls.find(call => call.name === "drawImage")!;
      const [, x, y, w, h] = mark.args as number[];
      expect(x + w, id).toBeLessThanOrEqual(1000);
      expect(x, id).toBeGreaterThan(500);
      expect(y, id).toBeLessThan(300);
      expect(h, id).toBeGreaterThan(0);
      expect(calls.filter(call => call.name === "fillText").length, id).toBeGreaterThan(id === "simpel" ? 10 : 20);
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
