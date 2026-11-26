import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/*
 * The layout rules the F1 audit asked for, read from the stylesheet (jsdom lays nothing out, so
 * the widths themselves are checked in the browser at 1440, 768, 375 and 320): a rule taken out
 * by mistake fails here.
 */
const sheet = readFileSync(new URL("./coffee-admin.module.css", import.meta.url), "utf8");
const rule = (selector: string) => {
  const at = sheet.indexOf(`\n${selector} {`);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf("}", at));
};
const block = (query: string) => {
  const at = sheet.indexOf(query);
  expect(at, `${query} is in the stylesheet`).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = sheet.indexOf("{", at); index < sheet.length; index++) {
    if (sheet[index] === "{") depth += 1;
    if (sheet[index] === "}" && --depth === 0) return sheet.slice(at, index);
  }
  return "";
};

// F1-03: a long line inside a section (Rekap's span on a phone) never widens the page.
it("lets the section's one column shrink", () => {
  expect(rule(".view")).toContain("grid-template-columns: minmax(0, 1fr)");
  expect(rule(".stack")).toContain("grid-template-columns: minmax(0, 1fr)");
  expect(block("@media (max-width: 760px)")).toMatch(/\.filterBar > span \{ flex: 1; min-width: 0;[^}]*text-overflow: ellipsis/);
});

// W-01: what is positioned inside the table stays in its scroll box.
it("keeps the table's scroll box as the frame of what is inside", () => {
  expect(rule(".tableBox")).toContain("position: relative");
});

// F1-05: a tablet gets the queue in one column.
it("puts the queue in one column up to 1100 px", () => {
  const tablet = block("@media (max-width: 1100px)");
  expect(tablet).toContain(".queueLayout { grid-template-columns: minmax(0, 1fr); }");
  expect(tablet).toContain(".aside { display: contents; }");
});

// F1-06: 44 px targets at every width, not only on a phone.
it("gives every control at least 44 px outside the phone layout too", () => {
  const wide = sheet.slice(0, sheet.indexOf("@media (max-width: 760px)"));
  for (const selector of [".primary, .secondary, .danger, .dangerText", ".textButton", ".segmented label", ".chips button, .chips label", ".field input, .field select, .field textarea", ".quotaRow input", ".sortButton", ".toast .toastAction"]) {
    expect(wide.slice(wide.indexOf(`\n${selector} {`)).split("}")[0], selector).toMatch(/min-height: 4[4-9]px/);
  }
  expect(rule(".iconButton")).toMatch(/width: 44px; height: 44px/);
  expect(wide).toContain(".root .headActions :is(a, button), .root .tall { min-height: 44px; }");
  expect(wide).not.toMatch(/min-height: (3\d|4[0-3])px/);
});

// F1-17: the edge of a field is its own, darker line.
it("draws fields and chips with the field line", () => {
  expect(sheet).toMatch(/--field-line: color-mix\(in srgb, var\(--cs-text\) (4[5-9]|[5-9]\d)%/);
  expect(rule(".field input, .field select, .field textarea")).toContain("var(--field-line)");
  expect(rule(".chips button, .chips label")).toContain("var(--field-line)");
});

// F1-12: on a phone the message is not laid over the first card's buttons.
it("shows the phone's messages under the top bar", () => {
  expect(block("@media (max-width: 760px)")).toMatch(/\.toastRegion \{[^}]*bottom: auto; top:/);
});

// F6: the phone's bottom menu takes as many columns as there are sections (four), each as wide as the others.
it("gives the phone's bottom menu one equal column per section", () => {
  const phone = block("@media (max-width: 760px)");
  expect(phone).toMatch(/\.tabBar \{[^}]*grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\)/);
  expect(phone).not.toContain("repeat(3, 1fr)");
});

// F6: the Menu's rows and the option switches keep their 44 px targets, and stack on a phone.
it("keeps the menu's rows and the switches reachable", () => {
  expect(rule(".menuMain")).toMatch(/min-height: 72px/);
  expect(rule(".switchRow")).toMatch(/min-height: 48px/);
  expect(block("@media (max-width: 760px)")).toContain(".menuMain { flex-basis: 100%;");
});
