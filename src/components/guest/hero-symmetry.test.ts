import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./guest.module.css", import.meta.url), "utf8");
const block = (selector: string, source = css) => {
  const start = source.indexOf(selector);
  return start === -1 ? "" : source.slice(start, source.indexOf("}", start));
};

describe("the opening fills the screen at every size", () => {
  // 86svh on desktop and 80svh on phones both let the next section peek in.
  it("asks for the full small-viewport height by default", () => {
    expect(block(".heroImage {")).toContain("min-height: 100svh");
  });

  it("keeps that on phones too", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(block(".heroImage {", mobile)).toContain("100svh");
  });

  it("uses svh everywhere, so collapsing browser chrome cannot overflow the screen", () => {
    expect(/min-height:\s*[^;]*\b\d+vh/.test(css)).toBe(false);
  });
});

describe("centred hero text is centred as a whole block", () => {
  const centred = block(".heroInnerCenter {");

  it("centres every child, not only the paragraphs", () => {
    // text-align alone leaves inline-flex children (the scroll cue) sitting off-axis.
    expect(centred).toContain("align-items: center");
    expect(centred).toContain("text-align: center");
  });

  it("stretches the rows that hold their own layout, so they centre on the same axis", () => {
    expect(block(".heroInnerCenter .heroMeta,")).toContain("width: 100%");
  });

  it("keeps each date/time pair readable left-to-right inside the centred row", () => {
    expect(block(".heroInnerCenter .heroMetaItem")).toContain("text-align: left");
  });
});

describe("date, time and place follow the alignment on a phone", () => {
  // Stacked full-width, a left-aligned label sits at the screen edge while the title above
  // it is centred — which is exactly the mismatch this block exists to prevent.
  const phone = css.slice(css.indexOf("@media (max-width: 720px)"));
  const stacked = block(".heroInnerCenter .heroMetaItem", phone);

  it("centres the fact rows instead of inheriting the wide-screen left alignment", () => {
    expect(stacked).toContain("text-align: center");
    expect(stacked).not.toContain("text-align: left");
  });

  it("stacks the facts so each one owns its row", () => {
    expect(block(".heroInnerCenter .heroMeta {", phone)).toContain("flex-direction: column");
  });

  it("puts the icon above its label, not adrift on the left margin", () => {
    expect(stacked).toContain("flex-direction: column");
    expect(stacked).toContain("align-items: center");
  });
});
