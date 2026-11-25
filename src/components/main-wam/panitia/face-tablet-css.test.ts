import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "face-tablet.module.css"), "utf8");

describe("Absen mode tablet layout rules", () => {
  it("never cuts a text off: names and labels wrap, the strip scrolls sideways", () => {
    expect(css).not.toMatch(/text-overflow:\s*ellipsis|line-clamp|white-space:\s*nowrap/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.strip ol \{[^}]*overflow-x: auto/);
  });
  it("two columns only on a landscape tablet; upright and on a phone the panel goes under the camera", () => {
    expect(css).toMatch(/grid-template-columns: minmax\(0, 1fr\) 320px/);
    expect(css).toMatch(/@media not all and \(min-width: 900px\) and \(min-height: 480px\) and \(orientation: landscape\)/);
  });
  it("the Buka di tablet hint is a phone-width thing only", () => {
    expect(css).toMatch(/@media \(max-width: 699px\) \{ \.phone \{ display: block; \} \}/);
  });
  it("is calm for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition: none/);
  });
});
