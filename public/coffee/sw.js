// Werkudara Coffee's service worker (26 Nov 2026): makes the app installable and answers with a
// short offline page when there is no signal. Pages are personal: nothing is cached.
//
// Scope: /coffee (no slash), so the app's first page, the one the home-screen icon opens, is
// controlled too. That needs the "Service-Worker-Allowed: /coffee" header next.config.ts sends with
// this file. A scope is a prefix of the address as text, so the handler itself checks that the page
// is the app's (/coffee or /coffee/…) and leaves anything else alone.
//
// Web push (F4, 26 Nov 2026): "push" shows the notification the server sent and tells the open
// windows to read again; "notificationclick" brings the right window to the front, or opens one.
// - Windows are looked for with includeUncontrolled: a window that was open before this worker took
//   over, and the pengelola's admin (/admin/coffee, outside the scope), are otherwise not found.
// - A window that is already open is never navigated (that would reload it and throw away what is
//   on screen): it gets the focus and a message, and moves itself. Only without one a window opens,
//   and only at an address of the app or of its admin.
// - While a guest holds GA's tablet (the cookie the tablet sets in "Serahkan ke tamu"), whatever
//   arrives is shown as one neutral line without a name, a drink or a room, and without a sound.
//   Where the worker cannot read cookies it stays neutral whenever a tablet page is open.
const APP = "/coffee";
const ADMIN = "/admin/coffee";
const TABLET = "/coffee/ga";
const GUEST_COOKIE = "coffee_ga_tamu";
const ICON = "/coffee/icon-192.png";
const QUIET = { title: "Werkudara Coffee", body: "Ada pembaruan pesanan." };
const OFFLINE = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Werkudara Coffee</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF6EE;color:#2B1E16;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:24px;margin:0 0 8px">Sinyalnya hilang</h1><p style="max-width:22rem;margin:0 auto 20px;line-height:1.5;color:#6B5546">Werkudara Coffee butuh internet supaya pengajuanmu sampai ke pengelola. Periksa sinyal, lalu coba lagi.</p>
<button onclick="location.reload()" style="min-height:52px;padding:0 24px;border:0;border-radius:12px;background:#2F6B5A;color:#fff;font-weight:600;font-size:17px">Coba lagi</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  const { pathname } = new URL(event.request.url);
  if (pathname !== APP && !pathname.startsWith(APP + "/")) return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

const under = (pathname, base) => pathname === base || pathname.startsWith(base + "/");
const pathOf = url => { try { return new URL(url).pathname; } catch { return ""; } };
const openWindows = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });
/** Which part of Werkudara Coffee an address belongs to: the admin, GA's tablet, the employee app, or none. */
const areaOf = pathname => under(pathname, ADMIN) ? "admin" : under(pathname, TABLET) ? "ga" : under(pathname, APP) ? "app" : "";
/** The address a notification may open: on this site and inside the app or its admin, else the app's first page. */
function safeUrl(value) {
  try {
    const url = new URL(typeof value === "string" && value ? value : APP, self.location.origin);
    if (url.origin === self.location.origin && areaOf(url.pathname)) return url;
  } catch { /* not an address */ }
  return new URL(APP, self.location.origin);
}
/** Is a guest holding GA's tablet? Unknown (no cookie access) counts as yes while a tablet page is open. */
async function guestHolds(windows) {
  try {
    if (self.cookieStore) return ((await self.cookieStore.get(GUEST_COOKIE)) || {}).value === "1";
  } catch { /* cookies cannot be read here */ }
  return windows.some(client => areaOf(pathOf(client.url)) === "ga");
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  if (!data || typeof data !== "object") data = {};
  event.waitUntil((async () => {
    const windows = await openWindows();
    const quiet = await guestHolds(windows);
    const text = quiet ? QUIET : { title: typeof data.title === "string" && data.title ? data.title : QUIET.title, body: typeof data.body === "string" ? data.body : "" };
    const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
    // A note with the same tag replaces the older one; renotify makes it show again (a claim done after an Urungkan).
    await self.registration.showNotification(text.title, {
      body: text.body, icon: ICON, badge: ICON, tag: quiet ? "coffee" : tag, renotify: Boolean(quiet || tag), silent: quiet,
      data: { url: safeUrl(data.url).href },
    });
    // The open screens read again now instead of at their next tick (the tablet ignores it in guest mode).
    for (const client of windows) client.postMessage({ type: "coffee:push" });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  const area = areaOf(url.pathname);
  event.waitUntil((async () => {
    const windows = await openWindows();
    const client = windows.find(item => areaOf(pathOf(item.url)) === area);
    if (client && "focus" in client) {
      await client.focus().catch(() => undefined);
      client.postMessage({ type: "coffee:open", url: url.pathname + url.search });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
