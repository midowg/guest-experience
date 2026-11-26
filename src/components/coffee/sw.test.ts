import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { HOLD_COOKIE } from "./ga/hold";
import { coffeeAdminPath, coffeePath } from "@/lib/routes";

/*
 * Web push in the service worker (F4): public/coffee/sw.js is run here with a make-believe `self`,
 * as layout.test.ts does for its fetch handler. What a real browser adds (the push service, the
 * system's notification, the focus) is not part of this; see the owner checklist in the plan.
 */
const SITE = "https://journey.example";
const source = readFileSync(fileURLToPath(new URL(`../../../public${coffeePath.serviceWorker}`, import.meta.url)), "utf8");

type Shown = { title: string; options: { body: string; tag?: string; renotify: boolean; silent: boolean; icon: string; data: { url: string } } };
function worker(options: { windows?: string[]; cookie?: string | null; cookieStore?: boolean } = {}) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: Shown[] = [], opened: string[] = [], focused: string[] = [], told: { url: string; message: unknown }[] = [];
  const windows = (options.windows ?? []).map(path => ({
    url: `${SITE}${path}`,
    focus: async () => { focused.push(path); },
    postMessage: (message: unknown) => { told.push({ url: path, message }); },
    navigate: async () => { throw new Error("an open window is never navigated"); },
  }));
  const self = {
    location: { origin: SITE },
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; },
    skipWaiting: () => undefined,
    registration: { showNotification: async (title: string, shownOptions: Shown["options"]) => { shown.push({ title, options: shownOptions }); } },
    clients: {
      claim: async () => undefined,
      matchAll: async (query: { type: string; includeUncontrolled: boolean }) => { expect(query).toEqual({ type: "window", includeUncontrolled: true }); return windows; },
      openWindow: async (url: string) => { opened.push(url); },
    },
    ...(options.cookieStore === false ? {} : { cookieStore: { get: async (name: string) => name === HOLD_COOKIE && options.cookie ? { name, value: options.cookie } : null } }),
  };
  new Function("self", "fetch", "Response", "URL", source)(self, async () => new Response(""), Response, URL);
  const run = async (name: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve();
    listeners[name]({ ...event, waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
  };
  return {
    shown, opened, focused, told,
    push: (payload: unknown) => run("push", { data: payload === undefined ? null : { json: () => { if (typeof payload === "string") throw new SyntaxError("not JSON"); return payload; }, text: () => String(payload) } }),
    click: (url: unknown) => run("notificationclick", { notification: { close: () => undefined, data: url === undefined ? undefined : { url } } }),
  };
}
const claim = { title: "Silakan ambil di mesin", body: "Café Latte kamu selesai diproses oleh Dewi.", url: coffeePath.orders, tag: "K-418" };

it("shows what the server sent, under the order's tag, and tells the open windows to read again", async () => {
  const sw = worker({ windows: [coffeePath.orders, coffeeAdminPath.home] });
  await sw.push(claim);
  expect(sw.shown).toEqual([{ title: claim.title, options: { body: claim.body, icon: coffeePath.icon("icon-192.png"), badge: coffeePath.icon("icon-192.png"), tag: "K-418", renotify: true, silent: false, data: { url: `${SITE}${coffeePath.orders}` } } }]);
  expect(sw.told).toEqual([{ url: coffeePath.orders, message: { type: "coffee:push" } }, { url: coffeeAdminPath.home, message: { type: "coffee:push" } }]);
});

it("always shows something, also for a push it cannot read", async () => {
  for (const payload of [undefined, "bukan json", null, 42, {}]) {
    const sw = worker();
    await sw.push(payload);
    expect(sw.shown, String(payload)).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({ title: "Werkudara Coffee", options: { data: { url: `${SITE}${coffeePath.home}` } } });
  }
});

it("says one neutral line, without a sound, while a guest holds GA's tablet", async () => {
  const sw = worker({ windows: [coffeePath.ga], cookie: "1" });
  await sw.push({ title: "Klaim baru", body: "Rina · Café Latte", url: coffeeAdminPath.home, tag: "K-419" });
  await sw.push({ title: "Pesanan rapat siap diambil", body: "Vasuki Room · 4 minuman. Selesai diproses oleh Dewi.", url: coffeePath.gaOrder("o1"), tag: "T-0113" });
  expect(sw.shown.map(item => [item.title, item.options.body, item.options.silent, item.options.tag])).toEqual([
    ["Werkudara Coffee", "Ada pembaruan pesanan.", true, "coffee"], ["Werkudara Coffee", "Ada pembaruan pesanan.", true, "coffee"],
  ]);
  expect(JSON.stringify(sw.shown.map(item => [item.title, item.options.body, item.options.tag]))).not.toMatch(/Rina|Latte|Vasuki|Dewi|K-419|T-0113/);
  // The cookie decides, also with no window open (the tablet's browser was put away in guest mode).
  const closed = worker({ cookie: "1" });
  await closed.push(claim);
  expect(closed.shown[0]).toMatchObject({ title: "Werkudara Coffee", options: { body: "Ada pembaruan pesanan.", silent: true } });
  // Guest mode is over (the cookie is gone): the tablet reads the real words again.
  const back = worker({ windows: [coffeePath.ga], cookie: null });
  await back.push(claim);
  expect(back.shown[0]).toMatchObject({ title: claim.title, options: { body: claim.body, silent: false } });
});

it("stays neutral on a browser that cannot read cookies whenever a tablet page is open", async () => {
  const tablet = worker({ windows: [coffeePath.ga], cookieStore: false });
  await tablet.push(claim);
  expect(tablet.shown[0]).toMatchObject({ title: "Werkudara Coffee", options: { body: "Ada pembaruan pesanan.", silent: true } });
  const phone = worker({ windows: [coffeePath.orders], cookieStore: false });
  await phone.push(claim);
  expect(phone.shown[0]).toMatchObject({ title: claim.title, options: { silent: false } });
});

it("brings the window of the right part to the front and tells it where to go, without loading it again", async () => {
  const sw = worker({ windows: [coffeePath.home, coffeePath.ga, `${coffeeAdminPath.home}/rekap`] });
  await sw.click(`${SITE}${coffeePath.orders}`);
  await sw.click(`${SITE}${coffeePath.gaOrder("o1")}`);
  await sw.click(`${SITE}${coffeeAdminPath.home}`);
  expect(sw.focused).toEqual([coffeePath.home, coffeePath.ga, `${coffeeAdminPath.home}/rekap`]);
  expect(sw.told).toEqual([
    { url: coffeePath.home, message: { type: "coffee:open", url: coffeePath.orders } },
    { url: coffeePath.ga, message: { type: "coffee:open", url: coffeePath.gaOrder("o1") } },
    { url: `${coffeeAdminPath.home}/rekap`, message: { type: "coffee:open", url: coffeeAdminPath.home } },
  ]);
  expect(sw.opened).toEqual([]);
});

it("opens a window when that part is not open, and never the tablet's window for the employee app", async () => {
  const sw = worker({ windows: [coffeePath.ga] });
  await sw.click(`${SITE}${coffeePath.orders}`);
  await sw.click(`${SITE}${coffeeAdminPath.home}`);
  expect(sw.opened).toEqual([`${SITE}${coffeePath.orders}`, `${SITE}${coffeeAdminPath.home}`]);
  expect(sw.focused).toEqual([]);
});

it("only ever opens an address of the app or its admin on this site", async () => {
  for (const url of ["https://evil.example/coffee", "//evil.example/coffee", "javascript:alert(1)", `${SITE}/admin/akses`, `${SITE}/coffeeshop`, `${SITE}/admin/coffeeshop`, undefined, 7]) {
    const sw = worker();
    await sw.click(url);
    expect(sw.opened, String(url)).toEqual([`${SITE}${coffeePath.home}`]);
    const pushed = worker();
    await pushed.push({ ...claim, url });
    expect(pushed.shown[0].options.data.url, String(url)).toBe(`${SITE}${coffeePath.home}`);
  }
});
