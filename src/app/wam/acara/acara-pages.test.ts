import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The gate is checked close to the data (docs/main-wam/KONTRAK.md §3): the layout's check does not
 * re-run on navigation, so every Main WAM page and API must call a gate itself. Every area agent's
 * new page is held to it here.
 */

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const root = decodeURIComponent(here);
const apiRoot = join(root, "..", "..", "api", "wam", "acara");
const praHome = join(root, "..", "(app)", "page.tsx");

function files(dir: string, name: string): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return []; }
  return entries.flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full, name) : entry === name ? [full] : [];
  });
}
const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("Main WAM's pages and APIs", () => {
  it("call the gate on every page inside the frame", () => {
    // The @sheet slot's catch-all draws nothing (it only clears the sheet), so it has no data to gate.
    const pages = files(join(root, "(app)"), "page.tsx").filter(path => !/@sheet[\\/]\[\.\.\.catchAll\]/.test(path));
    expect(pages.length).toBeGreaterThanOrEqual(4);
    for (const page of pages) expect(code(page), page).toMatch(/require(MainWam|Module|Action)Page\(/);
  });

  it("draw no sheet from the @sheet slot's catch-all and answer the frame's own page with a 404 (an unknown address stays one)", () => {
    expect(code(join(root, "(app)", "@sheet", "[...catchAll]", "page.tsx"))).toMatch(/return null/);
    expect(code(join(root, "(app)", "@sheet", "default.tsx"))).toMatch(/return null/);
    expect(code(join(root, "(app)", "default.tsx"))).toMatch(/notFound\(\)/);
  });

  it("call the gate in every API, except the theme's images (public: the splash shows before signing in)", () => {
    const routes = files(apiRoot, "route.ts").filter(path => !/[\\/]tema[\\/]/.test(path));
    for (const route of routes) expect(code(route), route).toMatch(/require(MainWam|Module|Action)Api\(/);
  });

  it("leave /wam to Pra WAM unless Main WAM is on for the person (checked before anything else)", () => {
    const source = code(praHome);
    const redirect = source.indexOf("await redirectToMainWam(");
    expect(redirect).toBeGreaterThan(0);
    expect(redirect).toBeLessThan(source.indexOf("requireMemberPage("));
  });
});
