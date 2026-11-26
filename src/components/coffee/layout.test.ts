import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { GET } from "@/app/coffee/manifest.webmanifest/route";
import nextConfig from "../../../next.config";
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

/* ---------- after the F2 audit (26 Nov 2026) */

it("F2-04 lets the worker control /coffee itself: the header, the scope, the manifest and the handler agree", async () => {
  const rules = await nextConfig.headers!();
  const rule = rules.find(item => item.source === coffeePath.serviceWorker);
  expect(rule?.headers).toContainEqual({ key: "Service-Worker-Allowed", value: COFFEE_PATH });
  // The worker file itself is always asked for again, so a new version reaches the phones.
  expect(rule?.headers.find(header => header.key === "Cache-Control")?.value).toMatch(/no-cache|max-age=0/);
  const manifest = await GET().json();
  expect(coffeePath.scope).toBe(COFFEE_PATH);
  expect(manifest.scope).toBe(coffeePath.scope);
  expect(manifest.start_url).toBe(coffeePath.home);
  // The worker's file sits inside what the header allows, and the first page is inside the scope.
  expect(coffeePath.serviceWorker.startsWith(`${COFFEE_PATH}/`)).toBe(true);
  expect(coffeePath.home.startsWith(coffeePath.scope)).toBe(true);
  // A scope is a prefix as text ("/coffeeshop" would match): the handler answers for the app's pages only.
  const worker = readFileSync(here(`../../../public${coffeePath.serviceWorker}`), "utf8");
  expect(worker).toContain(`const APP = "${COFFEE_PATH}";`);
  expect(worker).toContain('if (pathname !== APP && !pathname.startsWith(APP + "/")) return;');
});

it("F2-04 the worker answers a failed page of the app with the offline page, and nothing else", async () => {
  const worker = readFileSync(here(`../../../public${coffeePath.serviceWorker}`), "utf8");
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = { addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; }, skipWaiting: () => undefined, clients: { claim: async () => undefined } };
  const offline = async () => { throw new TypeError("Failed to fetch"); };
  new Function("self", "fetch", "Response", "URL", worker)(self, offline, Response, URL);
  const ask = (url: string, mode = "navigate") => {
    let answer: Promise<Response> | null = null;
    listeners.fetch({ request: { mode, url }, respondWith: (value: Promise<Response>) => { answer = value; } });
    return answer as Promise<Response> | null;
  };
  for (const page of [coffeePath.home, coffeePath.orders, coffeePath.ga, `${coffeePath.home}?pesan=ga`]) {
    const answer = await ask(`https://journey.example${page}`);
    expect(answer, page).not.toBeNull();
    expect(await answer!.text()).toContain("Sinyalnya hilang");
    expect(answer!.headers.get("Content-Type")).toMatch(/text\/html/);
  }
  // Not a page of the app, or not a page at all: the browser handles it as if there were no worker.
  expect(ask("https://journey.example/coffeeshop")).toBeNull();
  expect(ask("https://journey.example/admin/coffee")).toBeNull();
  expect(ask(`https://journey.example${coffeePath.photo("americano")}`, "no-cors")).toBeNull();
  expect(ask("https://journey.example/api/coffee/state", "cors")).toBeNull();
});

it("F2-05 does not lock the screen upright (the GA tablet lies down)", async () => {
  const manifest = await GET().json();
  expect(manifest).not.toHaveProperty("orientation");
  expect(manifest.display).toBe("standalone");
});

/** WCAG contrast of two "#RRGGBB" colours. */
function contrast(a: string, b: string): number {
  const light = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const token = (name: string) => new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`).exec(rule(".theme"))![1];

it("F2-14 draws the edge of a choice and of a timeline node at 3:1 or more, and marks the open tab by more than colour", () => {
  expect(rule(".option")).toContain("border: 1px solid var(--field-line)");
  expect(rule(".node")).toContain("border: 2px solid var(--field-line)");
  for (const ground of ["surface", "cream"]) expect(contrast(token("field-line"), token(ground)), ground).toBeGreaterThanOrEqual(3);
  // The old edge, for the record: far below.
  expect(contrast(token("line"), token("surface"))).toBeLessThan(3);
  expect(rule('.tabbar a[aria-current="page"] .tabIcon')).toContain("background: var(--emp-c)");
  expect(rule('.theme .tabbar a[aria-current="page"]')).toContain("font-weight: 700");
  expect(contrast(token("emp-strong"), token("surface"))).toBeGreaterThanOrEqual(4.5);
});

it("F2-12 keeps Ajukan klaim in reach on a short phone: the sheet's foot sticks to its bottom", () => {
  const foot = rule(".sheetFoot");
  expect(foot).toContain("position: sticky; bottom: 0");
  expect(foot).toContain("background: var(--cream)");
  // It takes over the sheet's bottom padding (the home bar's safe area included), so nothing shows under it.
  expect(foot).toContain("margin-bottom: calc(-20px - env(safe-area-inset-bottom))");
  expect(foot).toContain("calc(20px + env(safe-area-inset-bottom))");
  expect(rule(".sheet")).toContain("overflow-y: auto");
});

it("F2-07 gives the offline banner's button a full touch target", () => {
  expect(rule(".theme .offline button")).toMatch(/min-height: 4[4-9]px/);
  expect(contrast(token("wait"), token("wait-c"))).toBeGreaterThanOrEqual(4.5);
});
