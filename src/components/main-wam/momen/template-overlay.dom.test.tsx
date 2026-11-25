import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SIGN_IDS, templateLayout, type SignId } from "@/lib/main-wam/momen/camera-templates";
import { TemplateOverlay } from "./TemplateOverlay";

/*
 * The preview of a sign (the SVG) and the photo that is sent (the canvas) draw ONE list of ops (templateLayout): here the SVG is read back and
 * compared with the list, text by text and shape by shape (the canvas side is in camera-templates.test.ts), so what the person sees is what is sent.
 */

afterEach(cleanup);
const TAKEN = "2027-01-06T10:02:00+07:00";

describe("the preview of a sign is its op list", () => {
  it("Tanpa draws nothing", () => {
    const { container } = render(<TemplateOverlay sign="tanpa" lang="id" taken={TAKEN} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  for (const id of SIGN_IDS.filter(sign => sign !== "tanpa") as SignId[]) {
    it(`${id}: the same words in the same places, the same shapes, the same mark and art`, () => {
      const ops = templateLayout(id, 400, 500, "id", TAKEN);
      const { container } = render(<TemplateOverlay sign={id} lang="id" taken={TAKEN} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 400 500");
      const words = ops.filter(op => op.k === "text");
      const drawn = [...svg.querySelectorAll("text")];
      expect(drawn.map(node => node.textContent)).toEqual(words.map(op => op.text));
      words.forEach((op, index) => {
        const node = drawn[index];
        expect(Number(node.getAttribute("x"))).toBeCloseTo(op.x, 3);
        expect(Number(node.getAttribute("y"))).toBeCloseTo(op.y, 3);
        expect(Number(node.getAttribute("font-size"))).toBeCloseTo(op.size, 3);
        expect(node.getAttribute("fill")).toBe(op.color);
        expect(node.getAttribute("text-anchor")).toBe(op.align);
        expect(node.style.fontFamily).toContain(op.font === "display" ? "--mw-font-condensed" : op.font === "sans" ? "--mw-font-sans" : "Segoe Script");
        if (op.stretchW) { expect(node.getAttribute("textLength")).toBe(String(op.stretchW)); expect(node.getAttribute("lengthAdjust")).toBe("spacingAndGlyphs"); }
        if (op.rotate) expect(node.getAttribute("transform")).toBe(`rotate(${op.rotate} ${op.x} ${op.y})`);
      });
      expect(svg.querySelectorAll("rect").length).toBe(ops.filter(op => op.k === "rect" || op.k === "grad" || op.k === "frame").length);
      expect(svg.querySelectorAll("path").length).toBe(ops.filter(op => op.k === "path").length);
      expect(svg.querySelectorAll("image[data-logo]").length).toBe(ops.filter(op => op.k === "logo").length);
      expect(svg.querySelectorAll("image:not([data-logo])").length).toBe(ops.filter(op => op.k === "net").length);
    });
  }

  it("prints the photo's own date and time (the sign follows `taken` and the language)", () => {
    const { container, rerender } = render(<TemplateOverlay sign="tanda" lang="id" taken={TAKEN} />);
    expect(container.textContent).toContain("6 JAN 2027 · 10.02");
    rerender(<TemplateOverlay sign="tanda" lang="id" taken="2027-01-08T16:45:00+07:00" />);
    expect(container.textContent).toContain("8 JAN 2027 · 16.45");
    rerender(<TemplateOverlay sign="polaroid" lang="en" taken={TAKEN} />);
    expect(container.textContent).toContain("6 January 2027");
  });
});
