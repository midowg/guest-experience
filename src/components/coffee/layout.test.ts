import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { GET } from "@/app/coffee/manifest.webmanifest/route";
import { COFFEE_PATH, coffeePath } from "@/lib/routes";

/*
 * The layout rules the audits of F0 and F1 asked for, read from the employee app's stylesheet
 * (jsdom lays nothing out, so the widths themselves are checked in the browser at 375, 320 and
 * desktop): a rule taken out by mistake fails here. And the files that make the app installable.
 */
const here = (path: string) => new URL(path, import.meta.url);
const sheet = readFileSync(here("./coffee.module.css"), "utf8");
const rule = (selector: string) => {
  const at = sheet.indexOf(`\n${selector} {`);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  return sheet.slice(at, sheet.indexOf("}", at));
};

it("gives every control at least 44 px, at every width", () => {
  for (const selector of [".primary, .secondary, .danger", ".theme .textButton", ".theme .dangerText", ".segmented button", ".input", ".theme .linkButton", ".option", ".theme .links :is(a, button)", ".theme button.toastBody", ".preview summary"]) {
    expect(rule(selector), selector).toMatch(/min-height: (4[4-9]|[5-9]\d)px/);
  }
  expect(rule(".iconButton")).toContain("width: 44px; height: 44px");
  expect(rule(".avatarButton")).toContain("width: 44px; height: 44px");
  expect(rule(".theme .tabbar a")).toContain("min-height: var(--tabbar)");
  expect(rule(".theme")).toContain("--tabbar: 64px");
  expect(sheet).not.toMatch(/min-height: (3\d|4[0-3])px/);
});

it("never lets a long line widen the phone: columns shrink, long words wrap", () => {
  expect(rule(".theme")).toContain("overflow-x: clip");
  expect(rule(".grid")).toContain("repeat(2, minmax(0, 1fr))");
  expect(rule('.options[data-cols="3"]')).toContain("repeat(3, minmax(0, 1fr))");
  expect(rule(".main > *")).toContain("min-width: 0");
  expect(rule(".history strong")).toContain("text-overflow: ellipsis");
  expect(sheet).toContain("@media (max-width: 359px)");
});

it("keeps the screen clear of the notch, the home bar and its own bottom menu", () => {
  expect(rule(".topbar")).toContain("env(safe-area-inset-top)");
  expect(rule(".tabbar")).toContain("env(safe-area-inset-bottom)");
  expect(rule(".main")).toContain("calc(var(--tabbar) + 24px + env(safe-area-inset-bottom))");
  expect(rule(".sheet")).toContain("env(safe-area-inset-bottom)");
});

it("types at 16 px or more in fields (no zoom on iPhone) and rests when motion is reduced", () => {
  expect(rule(".input")).toMatch(/font-size: 1[6-9]px/);
  expect(sheet).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.theme \*[^}]*animation: none !important; transition: none !important;/);
});

it("is installable: a manifest that opens /coffee full screen, with icons that exist", async () => {
  const manifest = await GET().json();
  expect(manifest).toMatchObject({ id: COFFEE_PATH, start_url: COFFEE_PATH, scope: COFFEE_PATH, display: "standalone", name: "Werkudara Coffee", lang: "id" });
  // The first page is inside the scope (a scope ending in a slash would leave /coffee itself outside).
  expect(coffeePath.home.startsWith(manifest.scope)).toBe(true);
  expect(coffeePath.orders.startsWith(manifest.scope)).toBe(true);
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  for (const name of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
    expect(existsSync(here(`../../../public${coffeePath.icon(name)}`)), name).toBe(true);
  }
  for (const icon of manifest.icons as { src: string }[]) expect(existsSync(here(`../../../public${icon.src}`)), icon.src).toBe(true);
});

it("has a service worker that answers offline with a page and keeps nothing personal", () => {
  const worker = readFileSync(here(`../../../public${coffeePath.serviceWorker}`), "utf8");
  expect(worker).toContain('addEventListener("fetch"');
  expect(worker).toContain('event.request.mode !== "navigate"');
  expect(worker).toContain("Sinyalnya hilang");
  expect(worker).not.toMatch(/caches\.|cache\.put/);
});
