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
