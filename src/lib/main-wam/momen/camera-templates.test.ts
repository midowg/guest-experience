import { describe, expect, it, vi } from "vitest";
import { drawTemplate } from "./camera-template-draw";
import { CAMERA_TEMPLATES, DEFAULT_SIGN, EVENT_DAYS, isSign, LOGO_ASPECT, photoStamp, SIGN_IDS, templateLayout, toSign, type SignId, type TemplateOp } from "./camera-templates";

const TAKEN = "2027-01-06T10:02:00+07:00";
const ops = (id: SignId, width = 400, height = 500, lang: "id" | "en" = "id") => templateLayout(id, width, height, lang, TAKEN);
const texts = (list: TemplateOp[]) => list.filter((op): op is Extract<TemplateOp, { k: "text" }> => op.k === "text");
const logoOf = (list: TemplateOp[]) => list.find((op): op is Extract<TemplateOp, { k: "logo" }> => op.k === "logo");

describe("the signs", () => {
  it("are Tanpa, Tanda, Label, Bingkai, Film, Poster, Polaroid and Jaringan, Tanpa first and the default (the old Simpel and Emas are gone)", () => {
    expect([...SIGN_IDS]).toEqual(["tanpa", "tanda", "label", "bingkai", "film", "poster", "polaroid", "jaringan"]);
    expect(CAMERA_TEMPLATES.map(template => template.id)).toEqual([...SIGN_IDS]);
    expect(DEFAULT_SIGN).toBe("tanpa");
    for (const old of ["simpel", "emas", "biru", "", null, undefined]) { expect(isSign(old)).toBe(false); expect(toSign(old)).toBe("tanpa"); }
    expect(toSign("film")).toBe("film");
    expect(templateLayout("tanpa", 400, 500)).toEqual([]);
  });

  it("carry no filter: only their own shapes, lines, words, mark and art", () => {
    for (const id of SIGN_IDS) for (const op of ops(id)) expect(["rect", "grad", "frame", "path", "text", "logo", "net"]).toContain(op.k);
  });

  it("print the photo's date and time on the WIB clock, in both languages", () => {
    expect(photoStamp(TAKEN)).toEqual({ short: "6 JAN 2027", time: "10.02", long: "6 Januari 2027", film: "06 01 '27" });
    expect(photoStamp("2027-01-06T03:02:00Z")).toMatchObject({ short: "6 JAN 2027", time: "10.02" });
    expect(photoStamp("2027-01-07T17:30:00Z")).toMatchObject({ short: "8 JAN 2027", time: "00.30" }); // past midnight in WIB
    expect(photoStamp("2027-05-09T08:05:00+07:00", "id")).toMatchObject({ short: "9 MEI 2027", long: "9 Mei 2027" });
    expect(photoStamp("2027-08-17T08:05:00+07:00", "en")).toMatchObject({ short: "17 AUG 2027", long: "17 August 2027" });
  });

  it("Tanda: a gold bar, the mark and WAM 2026 with the date and time, at the bottom left", () => {
    const list = ops("tanda");
    expect(texts(list).map(text => text.text)).toEqual(["WAM 2026", "6 JAN 2027 · 10.02"]);
    const mark = logoOf(list)!;
    expect(mark.x).toBeLessThan(60); expect(mark.y).toBeGreaterThan(400); expect(mark.color).toBe("#FFFFFF");
    expect(list.some(op => op.k === "rect" && op.fill === "#F5C542" && op.w === 3)).toBe(true);
    expect(texts(list)[0].font).toBe("display"); expect(texts(list)[1].font).toBe("sans");
  });

  it("Label: a rounded dark card with a gold edge: Shaping Tomorrow, WAM 2026 big, the date and Kota Batu", () => {
    const list = ops("label");
    expect(texts(list).map(text => text.text)).toEqual(["SHAPING TOMORROW", "WAM 2026", "6 JAN 2027", "KOTA BATU"]);
    const card = list.find((op): op is Extract<TemplateOp, { k: "rect" }> => op.k === "rect" && op.r === 14)!;
    expect(card.fill).toBe("#0B1638"); expect(card.opacity).toBe(0.62); expect(card.stroke).toMatchObject({ color: "#FFFFFF", opacity: 0.22 });
    expect(texts(list)[1].size).toBe(40); expect(texts(list)[1].font).toBe("display");
    expect(logoOf(list)).toBeUndefined();
  });

  it("Bingkai: a thin white frame, four gold corners and a pill with the event, the place and the date", () => {
    const list = ops("bingkai");
    expect(list.filter(op => op.k === "frame")).toHaveLength(1);
    const corners = list.filter((op): op is Extract<TemplateOp, { k: "path" }> => op.k === "path");
    expect(corners).toHaveLength(4);
    for (const corner of corners) { expect(corner.points).toHaveLength(3); expect(corner.color).toBe("#F5C542"); expect(corner.line).toBe(3.5); }
    expect(texts(list).map(text => text.text)).toEqual(["WAM 2026 · KOTA BATU · 6 JAN 2027"]);
    expect(list.some(op => op.k === "rect" && op.r === 11 && op.w === 256)).toBe(true);
  });

  it("Film: black borders with sprocket holes down both sides and the orange edge marks (12A, WAM 26, the date as DD MM 'YY)", () => {
    const list = ops("film");
    expect(list.filter(op => op.k === "rect" && op.r === 3)).toHaveLength(42); // 21 holes on each side
    expect(texts(list).map(text => text.text)).toEqual(["▶ 12A", "WAM 26", "06 01 '27"]);
    expect(texts(list).every(text => text.color === "#F5821F" && text.font === "display")).toBe(true);
    expect(texts(list).map(text => text.align)).toEqual(["start", "middle", "end"]);
  });

  it("Poster: SHAPING and TOMORROW stretched to 360 wide over a dark fade, the event small above", () => {
    const list = ops("poster");
    const big = texts(list).filter(text => text.stretchW);
    expect(big.map(text => [text.text, text.size, text.stretchW])).toEqual([["SHAPING", 112, 360], ["TOMORROW", 100, 360]]);
    expect(texts(list).map(text => text.text)).toEqual(["WAM 2026", "KOTA BATU · 5–8 JAN 2027", "SHAPING", "TOMORROW"]);
    expect(list.some(op => op.k === "grad" && op.a0 === 0.78)).toBe(true);
  });

  it("Polaroid: a paper mount, handwriting turned two degrees, the long date, and the mark in navy at the bottom right", () => {
    const list = ops("polaroid");
    const [hand, date] = texts(list);
    expect(hand).toMatchObject({ text: "WAM 2026, Kota Batu", font: "script", rotate: -2 });
    expect(date.text).toBe("6 Januari 2027");
    expect(texts(templateLayout("polaroid", 400, 500, "en", TAKEN))[1].text).toBe("6 January 2027");
    const mark = logoOf(list)!;
    expect(mark.color).toBe("#0B1638"); expect(mark.x).toBeGreaterThan(300); expect(mark.y).toBeGreaterThan(400); expect(mark.shadow).toBe(false);
    expect(list.filter(op => op.k === "rect" && op.fill === "#F4F2EC")).toHaveLength(4);
  });

  it("Jaringan: the network art, a fade, the title and the place with the days, and the mark in the top right", () => {
    const list = ops("jaringan");
    expect(list.some(op => op.k === "net" && op.opacity === 0.24)).toBe(true);
    expect(texts(list).map(text => text.text)).toEqual(["WERKUDARA ANNUAL MEETING 2026", `KOTA BATU · ${EVENT_DAYS.id.long}`]);
    expect(texts(ops("jaringan", 400, 500, "en"))[1].text).toBe("KOTA BATU · 5–8 JANUARY 2027");
    const mark = logoOf(list)!;
    expect(mark.x + mark.w).toBeLessThanOrEqual(400); expect(mark.x).toBeGreaterThan(300); expect(mark.y).toBeLessThan(60); expect(mark.color).toBe("#FFFFFF");
  });

  for (const id of SIGN_IDS.filter(sign => sign !== "tanpa")) {
    for (const [width, height] of [[400, 500], [1200, 1500], [640, 800]]) {
      it(`${id} at ${width}x${height}: everything is inside the photo, the words fit, the mark keeps its shape, and the colours are the brand's (no purple)`, () => {
        const list = ops(id, width, height);
        const s = width / 400;
        for (const text of texts(list)) {
          expect(text.size, text.text).toBeGreaterThan(0);
          expect(text.x, text.text).toBeGreaterThanOrEqual(0); expect(text.x, text.text).toBeLessThanOrEqual(width);
          expect(text.y, text.text).toBeGreaterThan(0); expect(text.y, text.text).toBeLessThanOrEqual(height);
          if (!text.stretchW) {
            const cap = text.font === "display" ? 0.5 : text.font === "sans" ? 0.74 : 0.62;
            expect(text.text.length * text.size * (cap + text.ls), text.text).toBeLessThanOrEqual(text.maxW + 0.01);
          } else expect(text.stretchW).toBe(360 * s);
          expect(text.maxW, text.text).toBeLessThanOrEqual(width);
        }
        const mark = logoOf(list);
        if (mark) { expect(mark.w / mark.h).toBeCloseTo(LOGO_ASPECT, 3); expect(mark.x).toBeGreaterThanOrEqual(0); expect(mark.x + mark.w).toBeLessThanOrEqual(width + 0.01); expect(mark.y + mark.h).toBeLessThanOrEqual(height + 0.01); }
        const colours = new Set(list.flatMap(op => (op.k === "text" || op.k === "path" || op.k === "frame" || op.k === "logo" || op.k === "grad" ? [(op as { color: string }).color] : op.k === "rect" ? [op.fill, ...(op.stroke ? [op.stroke.color] : [])] : [])));
        for (const colour of colours) expect(["#F5C542", "#0B1638", "#46D2FF", "#F4F2EC", "#FFFFFF", "#4A5578", "#050914", "#F5821F"], colour).toContain(colour);
      });
    }
    it(`${id} scales with the photo's width: 1200 wide is 400 wide times three`, () => {
      const norm = (value: unknown, k: number): unknown => (typeof value === "number" ? Math.round((value / k) * 1e4) / 1e4 : Array.isArray(value) ? value.map(item => norm(item, k)) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "ls" || key === "weight" || key === "opacity" || key === "a0" || key === "a1" || key === "rotate" || key === "stroke" ? item : norm(item, k)])) : value);
      const base = ops(id, 400, 500), big = ops(id, 1200, 1500);
      expect(big.length).toBe(base.length);
      expect(norm(big.map(op => (op.k === "rect" && op.stroke ? { ...op, stroke: { ...op.stroke, w: op.stroke.w / 3 } } : op)), 3)).toEqual(norm(base, 1));
    });
  }
});

function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const ctx = {
    save: record("save"), restore: record("restore"), fillRect: record("fillRect"), strokeRect: record("strokeRect"), fillText: record("fillText"), drawImage: record("drawImage"),
    beginPath: record("beginPath"), moveTo: record("moveTo"), lineTo: record("lineTo"), arcTo: record("arcTo"), closePath: record("closePath"), fill: record("fill"), stroke: record("stroke"),
    translate: record("translate"), rotate: record("rotate"), scale: record("scale"),
    createLinearGradient: () => ({ addColorStop: vi.fn() }), measureText: (text: string) => ({ width: text.length * 6 }),
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "", globalAlpha: 1, font: "", textAlign: "", textBaseline: "", shadowColor: "", shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: "", imageSmoothingQuality: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("drawing a sign on the photo (the same ops the preview draws)", () => {
  const logo = { tag: "logo" } as unknown as CanvasImageSource;
  const net = { tag: "net" } as unknown as CanvasImageSource;
  const scratch = fakeContext();
  const make = () => ({ width: 419, height: 477, getContext: () => scratch.ctx as CanvasRenderingContext2D });

  it("draws every sign with all its words, letter by letter (a stretched word at once), and the tinted mark where the sign puts it", () => {
    for (const id of SIGN_IDS.filter(sign => sign !== "tanpa")) {
      const { ctx, calls } = fakeContext();
      const list = ops(id, 1000, 1250);
      drawTemplate(ctx, list, { logo, net }, make);
      const words = texts(list);
      const letters = words.filter(text => !text.stretchW).reduce((sum, text) => sum + [...text.text].length, 0) + words.filter(text => text.stretchW).length;
      expect(calls.filter(call => call.name === "fillText").length, id).toBe(letters);
      const mark = logoOf(list);
      const images = calls.filter(call => call.name === "drawImage");
      expect(images.length, id).toBe((mark ? 1 : 0) + (list.some(op => op.k === "net") ? 1 : 0));
      if (mark) { const [, x, y] = images.find(call => typeof (call.args[0] as { getContext?: unknown }).getContext === "function")!.args as number[]; expect(x, id).toBeCloseTo(mark.x, 3); expect(y, id).toBeCloseTo(mark.y, 3); }
    }
    // the mark was tinted on its own scratch canvas first (source-in), so it is not black on a dark photo
    expect(scratch.calls.some(call => call.name === "drawImage" && call.args[0] === logo)).toBe(true);
    expect(scratch.ctx.globalCompositeOperation).toBe("source-in");
  });

  it("draws the app's fonts when it could read them, the plain names when it could not", () => {
    const a = fakeContext();
    drawTemplate(a.ctx, ops("label", 400, 500), { logo: null, net: null, fonts: { display: "Fake Display", sans: "Fake Sans" } }, make);
    const fonts: string[] = [];
    const b = fakeContext();
    Object.defineProperty(b.ctx, "font", { set: (value: string) => { fonts.push(value); }, get: () => "" });
    drawTemplate(b.ctx, ops("label", 400, 500), { logo: null, net: null, fonts: { display: "Fake Display", sans: "Fake Sans" } }, make);
    expect(fonts.some(font => font.endsWith("Fake Display"))).toBe(true);
    expect(fonts.some(font => font.endsWith("Fake Sans"))).toBe(true);
    const c = fakeContext(); const plain: string[] = [];
    Object.defineProperty(c.ctx, "font", { set: (value: string) => { plain.push(value); }, get: () => "" });
    drawTemplate(c.ctx, ops("label", 400, 500), { logo: null, net: null }, make);
    expect(plain.some(font => font.includes("Barlow Condensed"))).toBe(true);
    expect(plain.some(font => font.includes("Plus Jakarta Sans"))).toBe(true);
  });

  it("turns the handwriting (Polaroid), stretches the big words (Poster) and rounds the card (Label)", () => {
    const polaroid = fakeContext();
    drawTemplate(polaroid.ctx, ops("polaroid", 400, 500), { logo, net }, make);
    expect(polaroid.calls.some(call => call.name === "rotate" && Math.abs((call.args[0] as number) + (2 * Math.PI) / 180) < 1e-9)).toBe(true);
    const poster = fakeContext();
    drawTemplate(poster.ctx, ops("poster", 400, 500), { logo, net }, make);
    const scales = poster.calls.filter(call => call.name === "scale").map(call => call.args[0] as number);
    expect(scales).toHaveLength(2);
    expect(scales[0]).toBeCloseTo(360 / ("SHAPING".length * 6), 5); // measureText says 6 per letter here
    const label = fakeContext();
    drawTemplate(label.ctx, ops("label", 400, 500), { logo, net }, make);
    expect(label.calls.filter(call => call.name === "arcTo").length).toBeGreaterThanOrEqual(8); // two rounded rectangles (the card and the gold edge), fill and outline
  });

  it("without the mark (it did not load) the rest is still drawn: the photo is not lost", () => {
    const { ctx, calls } = fakeContext();
    expect(() => drawTemplate(ctx, ops("tanda", 1000, 1250), { logo: null, net: null }, make)).not.toThrow();
    expect(calls.some(call => call.name === "drawImage")).toBe(false);
    expect(calls.some(call => call.name === "fillText")).toBe(true);
  });
});
