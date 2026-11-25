import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "../theme/tokens";

/*
 * The quiz tag's tokens (theme.module.css §1.7: the "Kuis" label in Modul and Agenda) read as they should,
 * light and dark. Kuis live itself has no colour of its own any more: only the theme's (neutrals, primary,
 * gold, success/error), so no other --mw-kuis-* token may come back.
 */

const here = decodeURIComponent(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const css = readFileSync(join(here, "..", "theme", "theme.module.css"), "utf8");
function block(opening: RegExp): Record<string, string> {
  const start = opening.exec(css)!;
  let depth = 0;
  let end = start.index + start[0].length - 1;
  for (let at = end; at < css.length; at++) {
    if (css[at] === "{") depth++;
    if (css[at] === "}" && --depth === 0) { end = at; break; }
  }
  return Object.fromEntries([...css.slice(start.index + start[0].length, end).matchAll(/(--mw-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}
const light = block(/\n\.root \{/);
const dark = { ...light, ...block(/\n\.root\[data-mw-mode="dark"\] \{/) };
const system = block(/\n {2}\.root\[data-mw-mode="system"\] \{/);

describe("Kuis live's tokens", () => {
  for (const [mode, tokens] of [["terang", light], ["gelap", dark]] as const) {
    it(`read at 4.5:1 in the ${mode} mode`, () => {
      const pick = (name: string) => tokens[`--mw-${name}`];
      const pairs: [string, string][] = [["on-kuis", "kuis-d"]];
      const low = pairs.filter(([front, back]) => contrast(pick(front), pick(back)) < 4.5).map(([front, back]) => `${front} on ${back}`);
      expect(low).toEqual([]);
    });
  }
  it("are the same in Gelap and Sistem", () => {
    for (const [name, value] of Object.entries(system).filter(([name]) => name.includes("kuis"))) expect(dark[name], name).toBe(value);
    expect(Object.keys(system).filter(name => name.includes("kuis"))).toHaveLength(2);
  });
  it("hold only the quiz tag (Kuis live reads the theme's colours)", () => {
    expect(Object.keys(light).filter(name => name.includes("kuis")).sort()).toEqual(["--mw-kuis-d", "--mw-on-kuis"]);
  });
});

describe("Kuis live's screens", () => {
  it("draw with the theme's colours only: no colour of their own, no gradient, no glow, no module accent", () => {
    for (const file of ["play.module.css", "stage.module.css", "control.module.css", "avatar.module.css", "confetti.ts"]) {
      const text = readFileSync(join(here, file), "utf8");
      expect(text, file).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
      expect(text, file).not.toMatch(/gradient\(/);
      expect(text, file).not.toMatch(/--mw-(kuis|momen|awarding|emisi|wellbeing|mosaic|glow)/);
    }
  });
});
