import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "./theme/tokens";

/*
 * Colours and sizes of Main WAM's screens come from the tokens (--mw-*), nothing else. Any literal
 * colour in src/components/main-wam or src/app/wam/acara fails here, unless it is listed below with a
 * reason. The tokens themselves (theme/theme.module.css, theme/tokens.ts) are where literals live.
 * Dark mode has its own checks: both dark blocks are the same, and every text pair reads at 4.5:1.
 */

const here = decodeURIComponent(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const roots = [here, join(here, "..", "..", "app", "wam", "acara")];

/** The only places a literal colour may stay, each with why. Keep this short. */
const EXCEPTIONS: Record<string, string> = {
  "theme/theme.module.css": "the tokens themselves",
  "theme/tokens.ts": "the neutral default theme and the page colours (the tokens' twin in code)",
  "momen/MosaicCanvas.tsx": "canvas cannot take color-mix(): rgba() is built from the value of a token it has just read",
  "momen/upload/compress.ts": "the white a photo is flattened onto before it becomes a JPEG (data, not interface)",
  "peserta/masuk/masuk.module.css": "Splash and Masuk keep the prototype's own brand palette (pegasus art, gold, blue-black), the only screens that do",
  "ui/sheet.module.css": "::backdrop does not inherit the theme root's custom properties in every browser: a fallback behind var(--mw-overlay-scrim)",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : files(full);
    return /\.(css|tsx?|)$/.test(entry) && /\.(css|tsx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const NAMED = "white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|gold|brown|cyan|magenta";
const LITERALS: [string, RegExp][] = [
  ["hex colour", /#[0-9a-fA-F]{3,8}\b/],
  ["rgb()/rgba()", /\brgba?\(/],
  ["hsl()/hsla()", /\bhsla?\(/],
  ["lab/lch/oklab/oklch/hwb()", /\b(?:ok)?(?:lab|lch)\(|\bhwb\(/],
  ["named colour as a value", new RegExp(`(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)?|outline(?:-color)?|box-shadow)\\s*:[^;{}]*\\b(?:${NAMED})\\b`, "i")],
  ["named colour in color-mix()", new RegExp(`color-mix\\([^)]*\\b(?:${NAMED})\\b`, "i")],
  ["canvas style set to a colour", new RegExp(`(?:fillStyle|strokeStyle)\\s*=\\s*["'\`](?!transparent)`)],
];

describe("Main WAM: no literal colours outside the tokens", () => {
  const all = roots.flatMap(files);
  it("looks at the screens", () => { expect(all.length).toBeGreaterThan(100); });

  it("every colour is a --mw-* token (exceptions listed with a reason)", () => {
    const found: string[] = [];
    for (const file of all) {
      const name = relative(here, file).split(sep).join("/");
      if (EXCEPTIONS[name]) continue;
      const code = strip(readFileSync(file, "utf8"));
      for (const [label, pattern] of LITERALS) {
        const hit = pattern.exec(code);
        if (hit) found.push(`${name}: ${label}: ${hit[0].slice(0, 60)}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the camera and the QR scanner follow the theme: no surface of their own (no --mw-camera*, --mw-ondark*, data-mw-camera, ondark variants)", () => {
    const theme = readFileSync(join(here, "theme", "theme.module.css"), "utf8");
    expect(theme).not.toMatch(/--mw-(camera|ondark|overlay-camera)/);
    const used: string[] = [];
    for (const file of all) {
      const code = strip(readFileSync(file, "utf8"));
      const hit = /--mw-(?:camera|ondark|overlay-camera)|data-mw-camera|variant="ondark"|tone="ondark"|\.ondark|\.iconOndark/.exec(code);
      if (hit) used.push(`${relative(here, file)}: ${hit[0]}`);
    }
    expect(used).toEqual([]);
  });

  it("every exception still exists and still needs it", () => {
    for (const name of Object.keys(EXCEPTIONS)) {
      const file = all.find(path => relative(here, path).split(sep).join("/") === name);
      expect(file, name).toBeTruthy();
      const code = strip(readFileSync(file!, "utf8"));
      expect(LITERALS.some(([, pattern]) => pattern.test(code)), `${name} has no literal any more: drop it from EXCEPTIONS`).toBe(true);
    }
  });

  it("every var(--mw-x) a stylesheet reads is a token the theme defines", () => {
    const theme = readFileSync(join(here, "theme", "theme.module.css"), "utf8");
    const defined = new Set([...theme.matchAll(/(--mw-[a-z0-9-]+)\s*:/g)].map(match => match[1]));
    const local = /(--mw-[a-z0-9-]+)\s*:/g;
    const unknown: string[] = [];
    for (const file of all.filter(path => path.endsWith(".css"))) {
      const css = strip(readFileSync(file, "utf8"));
      const own = new Set([...css.matchAll(local)].map(match => match[1]));
      for (const match of css.matchAll(/var\((--mw-[a-z0-9-]+)/g)) {
        if (!defined.has(match[1]) && !own.has(match[1])) unknown.push(`${relative(here, file)}: ${match[1]}`);
      }
    }
    // Set by the theme root from the admin's slots (kv-*, font) or by a component's own style prop (toast-*, reserve, w, badge-ring …).
    expect([...new Set(unknown)].filter(entry => !/--mw-(kv-|font-jakarta|toast-)|-(w|icon-fg|icon-press|badge-ring|vvh)$/.test(entry))).toEqual([]);
  });
});

/** The custom properties a block sets, by name. */
function block(css: string, opening: RegExp): Record<string, string> {
  const start = opening.exec(css);
  if (!start) throw new Error(`no ${opening}`);
  let depth = 0;
  let end = start.index + start[0].length - 1;
  for (let at = end; at < css.length; at++) {
    if (css[at] === "{") depth++;
    if (css[at] === "}" && --depth === 0) { end = at; break; }
  }
  const body = css.slice(start.index + start[0].length, end);
  return Object.fromEntries([...body.matchAll(/(--mw-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim().replace(/\s+/g, " ")]));
}

describe("Main WAM: light and dark tokens", () => {
  const css = readFileSync(join(here, "theme", "theme.module.css"), "utf8");
  const light = block(css, /\n\.root \{/);
  const dark = block(css, /\n\.root\[data-mw-mode="dark"\] \{/);
  const system = block(css, /\n  \.root\[data-mw-mode="system"\] \{/);

  it("Sistem draws exactly what Gelap draws (two blocks, one look)", () => {
    expect(system).toEqual(dark);
  });

  it("every colour token the light mode has is either redefined for dark or meant to be the same (media, fixed hues)", () => {
    const same = /^--mw-(media-|overlay-|kv-|chart-|image-|font|display-font|type-|ls-|space-|radius-|ease-|motion-|touch|topbar|nav-h|safe-|column|focus|photo-bg|elev-0)/;
    const colour = (value: string) => /#|rgb\(|color-mix|linear-gradient/.test(value);
    const missing = Object.entries(light).filter(([name, value]) => colour(value) && !same.test(name) && !(name in dark)).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  for (const [mode, tokens] of [["terang", light], ["gelap", { ...light, ...dark }]] as const) {
    it(`text reads at 4.5:1 and icons at 3:1 in the ${mode} mode`, () => {
      const pick = (name: string) => {
        const value = tokens[`--mw-${name}`];
        const fallback = /var\(--mw-kv-[a-z0-9-]+,\s*(#[0-9A-Fa-f]{6})\)/.exec(value ?? "");
        const hex = fallback ? fallback[1] : value;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex ?? "")) throw new Error(`--mw-${name} is not a plain colour: ${value}`);
        return hex;
      };
      const text: [string, string][] = [];
      for (const on of ["text-1", "text-2", "text-3"]) for (const back of ["bg", "surface", "surface-2"]) text.push([on, back]);
      for (const kind of ["primary", "success", "warning", "error", "momen", "emisi", "wellbeing", "awarding", "accent"]) {
        text.push([`on-${kind}-container`, `${kind}-container`]);
      }
      text.push(["on-primary", "primary"], ["on-error", "error"], ["on-accent", "accent"], ["on-accent-2", "accent"], ["error", "surface"], ["error", "bg"], ["emisi-accent", "surface"], ["emisi-accent", "bg"], ["primary-strong", "surface"], ["primary-strong", "bg"],
        ["inverse-on-surface", "inverse-surface"], ["inverse-on-surface-2", "inverse-surface"], ["inverse-primary", "inverse-surface"]);
      const low = text.filter(([front, back]) => contrast(pick(front), pick(back)) < 4.5).map(([front, back]) => `${front} on ${back} ${contrast(pick(front), pick(back)).toFixed(2)}`);
      expect(low).toEqual([]);
      const icons = ["primary", "success", "warning", "momen", "emisi", "awarding", "wellbeing", "outline-strong"].filter(name => contrast(pick(name), pick("surface")) < 3);
      expect(icons).toEqual([]);
    });
  }
});

describe("the literal-colour check itself", () => {
  const flagged = (code: string) => LITERALS.some(([, pattern]) => pattern.test(strip(code)));
  it("catches the usual ways to write a colour", () => {
    for (const code of [".a { color: #fff; }", ".a { background: #1E3A5F; }", ".a { color: rgb(0 0 0 / 0.5); }", ".a { color: rgba(0,0,0,.5); }", ".a { border: 1px solid white; }",
      ".a { background: color-mix(in srgb, black 20%, transparent); }", "const c = { color: \"hsl(10 20% 30%)\" };", "ctx.fillStyle = \"#000\";", ".a { fill: oklch(0.5 0.1 200); }"]) {
      expect(flagged(code), code).toBe(true);
    }
  });
  it("lets tokens, keywords and comments through", () => {
    for (const code of [".a { color: var(--mw-text-1); background: transparent; }", ".a { white-space: nowrap; }", "/* #fff and rgb(0 0 0) in a comment */ .a { color: inherit; }",
      ".a { box-shadow: 0 0 0 2px var(--mw-focus); }", "// white in a comment\nconst x = 1;", "ctx.fillStyle = \"transparent\";", ".a { color: currentColor; }"]) {
      expect(flagged(code), code).toBe(false);
    }
  });
});
