import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Main WAM tersembunyi (20 Nov 2026): Pra WAM (the app, its components, Admin Pra WAM) has no card
 * or link into Main WAM. The only way from /wam to /wam/acara is Pra WAM Beranda's redirectToMainWam, which
 * never leaves Pra WAM while Main WAM is hidden (gate.test.ts).
 */

const here = decodeURIComponent(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const src = join(here, "..", "..");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function files(dir: string): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return []; }
  return entries.flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}
const MAIN_WAM = /mainWamPath|mainWamApi|mainWamAdminPath|mainWamAdminApi|MAIN_WAM_PATH|["'`]\/wam\/acara|kuisScreen/;

describe("Pra WAM has no way into Main WAM", () => {
  it("in the app and its components (only Beranda's redirectToMainWam, which respects the switch)", () => {
    const sources = [...files(join(src, "app", "wam", "(app)")), ...files(join(src, "components", "pra-wam"))];
    expect(sources.length).toBeGreaterThan(20);
    const found = sources.filter(file => MAIN_WAM.test(strip(readFileSync(file, "utf8")))).map(file => relative(src, file));
    expect(found).toEqual([]);
  });

  it("in Admin Pra WAM (Main WAM's admin is its own door since 20 Nov 2026, /admin/wam2026)", () => {
    const sources = [...files(join(src, "app", "admin", "wam")), ...files(join(src, "components", "admin", "wam"))];
    expect(sources.length).toBeGreaterThan(20);
    const found = sources.filter(file => MAIN_WAM.test(strip(readFileSync(file, "utf8")))).map(file => relative(src, file));
    expect(found).toEqual([]);
  });
});
