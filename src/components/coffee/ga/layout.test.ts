import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/*
 * The tablet's layout rules, read from its stylesheet (jsdom lays nothing out; the widths are
 * checked in the browser at 1280×800, 1024×768 and 768×1024): a rule taken out by mistake fails here.
 */
const sheet = readFileSync(new URL("./ga.module.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const at = sheet.indexOf(`\n${selector} {`);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf("}", at));
};

it("gives every control at least 48 px on the tablet", () => {
  for (const selector of [".ga .primary, .ga .secondary, .ga .ghost, .ga .dangerText", ".ga .segmented button", ".ga .tapFor button", ".ga .chip", ".ga .option", ".ga .back", ".ga .input",
    ".ga .people button", ".ga .disclosure", ".ga .lineBody", ".ga .bookExit", ".ga .bookItems button", ".ga .ribbons button", ".ga .bookOption", ".ga .bookInput", ".ga .inkButton, .ga .lineButton",
    ".ga .bookBack", ".ga .danger", ".ga .topLink"]) {
    expect(rule(selector), selector).toMatch(/min-height: (4[89]|[5-9]\d)px/);
  }
  expect(rule(".ga .stepper button")).toContain("width: 48px; height: 48px");
  expect(rule(".ga .iconButton")).toContain("width: 48px; height: 48px");
  // No control height below 48 anywhere (28 px is the status pill, which is not pressed).
  expect(sheet.match(/min-height: (\d+)px/g)?.map(found => Number(found.replace(/\D/g, ""))).filter(px => px < 48 && px !== 28)).toEqual([]);
});

it("stands upright in one column and never widens the screen", () => {
  expect(sheet).toContain("@media (max-width: 900px)");
  const upright = sheet.slice(sheet.indexOf("@media (max-width: 900px)"));
  for (const part of [".ga .home {", ".ga .newGrid {", ".ga .quickGrid {", ".ga .sentGrid {", ".ga .spread {"]) expect(upright, part).toContain(part);
  expect(rule(".ga .home")).toContain("minmax(0, 1fr)");
  expect(rule(".ga .quickGrid")).toContain("minmax(0, 1fr)");
  expect(rule(".stage")).toContain("overflow: hidden");
});

it("types at 16 px or more in fields and rests when motion is reduced", () => {
  expect(rule(".ga .input")).toMatch(/font-size: 1[6-9]px/);
  expect(rule(".ga .bookInput")).toMatch(/font-size: 1[6-9]px/);
  expect(sheet).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.ga \*[^}]*animation: none !important; transition: none !important;/);
});

/* ---------- after the F3 audit (26 Nov 2026) */

/** WCAG contrast of two "#RRGGBB" colours. */
function contrast(a: string, b: string): number {
  const light = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const token = (name: string) => new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`).exec(rule(".ga"))![1];

it("F3-01 leaves no way out of the guest's book by a pull, a long press, a selection or a dragged photo", () => {
  expect(rule(".ga .book")).toMatch(/overscroll-behavior: none/);
  expect(rule(".ga .book")).toContain("-webkit-touch-callout: none");
  expect(rule(".ga .book img")).toContain("pointer-events: none");
  expect(rule(".ga .spread, .ga .page")).toContain("overscroll-behavior: contain");
  expect(sheet).toContain(".ga :is(button, a, [role=\"button\"], summary), .ga .book { -webkit-user-select: none; user-select: none; }");
});

it("F3-04 gives the PIN keypad keys of 56 px or more", () => {
  expect(rule(".ga .pinKey")).toMatch(/min-height: (5[6-9]|[6-9]\d)px/);
  expect(rule(".ga .pinPad")).toContain("grid-template-columns: repeat(3, 1fr)");
  expect(contrast(token("field-line"), token("surface"))).toBeGreaterThanOrEqual(3);
});

it("F3-14 draws the focus ring on paper in ink (gold is 2.2:1 there), and the edges of choices at 3:1 or more", () => {
  expect(contrast(token("gold"), token("paper"))).toBeLessThan(3);
  expect(rule(".ga .spread :focus-visible")).toContain("outline-color: var(--book-ink)");
  expect(contrast(token("book-ink"), token("paper"))).toBeGreaterThanOrEqual(3);
  // On the black cover gold stays: it is clear there.
  expect(contrast(token("gold"), token("book-black"))).toBeGreaterThanOrEqual(3);
  expect(rule(".ga .bookInput:focus")).toContain("var(--book-ink)");
  expect(rule(".ga .bookInput:focus")).not.toContain("--gold");
  expect(rule(".ga .chip")).toContain("border: 1px solid var(--field-line)");
  expect(rule(".ga .option")).toContain("border: 1px solid var(--field-line)");
  // The book's unpicked choice: ink at 60 % on paper is about 4:1 (it was 35 %, 2.2:1).
  const alpha = Number(/border: 1px solid rgba\(26, 26, 26, (\.\d+)\)/.exec(rule(".ga .bookOption"))![1]);
  const mix = (ink: number, paper: number) => Math.round(ink * alpha + paper * (1 - alpha)).toString(16).padStart(2, "0");
  expect(contrast(`#${mix(0x1a, 0xfa)}${mix(0x1a, 0xf7)}${mix(0x1a, 0xf0)}`, token("paper"))).toBeGreaterThanOrEqual(3);
});

it("F3-11 shows Nama Anda as a full box when the tablet stands upright, clear of the bar that sticks to the bottom", () => {
  const upright = sheet.slice(sheet.indexOf("@media (max-width: 900px)"));
  expect(upright).toMatch(/\.ga \.bookInput \{[^}]*border: 1px solid var\(--book-ink\)[^}]*margin-bottom: 20px/);
  expect(upright).toContain(".ga .bookActions { position: sticky; bottom: 0;");
});

it("F3-05 and F3-07: the offline banner's button is a full target, and the search block has room above it when it rises", () => {
  expect(rule(".ga .offline button")).toMatch(/min-height: (4[89]|[5-9]\d)px/);
  expect(contrast(token("wait"), token("wait-c"))).toBeGreaterThanOrEqual(4.5);
  expect(rule(".ga .searchBlock")).toContain("scroll-margin-top");
});

/* ---------- the tablet's own sign-in (26 Nov 2026) */

it("lays the sign-in out in two panes lying down, one column upright, and lets the page scroll under a keyboard", () => {
  expect(rule(".ga .signCard")).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
  const upright = sheet.slice(sheet.lastIndexOf("@media (max-width: 900px)"));
  expect(upright).toContain(".ga .signCard { grid-template-columns: minmax(0, 1fr);");
  // The page grows with its contents (the tablet's stage does not): a field under the keyboard can be scrolled to.
  expect(rule(".signPage")).toContain("min-height: 100dvh");
  expect(rule(".signPage")).not.toContain("overflow: hidden");
  expect(rule(".ga .signForm .input")).toContain("scroll-margin");
  // Its fields and buttons are the tablet's own: 52 px fields at 17 px, 56 px for the one main button.
  expect(rule(".ga .input")).toMatch(/min-height: 5\dpx/);
  expect(rule(".ga .big")).toMatch(/min-height: 5\dpx/);
  expect(contrast(token("wait"), token("wait-c"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("ink"), token("emp-c"))).toBeGreaterThanOrEqual(4.5);
});
