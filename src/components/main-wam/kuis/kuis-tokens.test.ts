import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "../theme/tokens";

/* Kuis live's own tokens (theme.module.css §1.7) read as they should, light and dark: the letter on each option, the text on a medal and on the winner's gold. */

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
      const pairs: [string, string][] = [
        ...["a", "b", "c", "d"].map(letter => ["on-kuis", `kuis-${letter}`] as [string, string]),
        ...["medal-1", "medal-2", "medal-3", "win-container"].map(medal => ["on-kuis-medal", `kuis-${medal}`] as [string, string]),
      ];
      const low = pairs.filter(([front, back]) => contrast(pick(front), pick(back)) < 4.5).map(([front, back]) => `${front} on ${back}`);
      expect(low).toEqual([]);
    });
  }
  it("are the same in Gelap and Sistem", () => {
    for (const [name, value] of Object.entries(system).filter(([name]) => name.includes("kuis"))) expect(dark[name], name).toBe(value);
    expect(Object.keys(system).filter(name => name.includes("kuis"))).toHaveLength(10);
  });
});
