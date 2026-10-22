// Offline copy of guest pages for trips and programmes with weak signal: /AB23CD, /AB23CD/k7q2mx9p
// (and the older /e/… addresses). Pages: network first, the last copy when offline. Build assets:
// cached on first use. Never touches /admin, /api, or anything else on the site.
const CACHE = "wk-guest-v2";
const GUEST_PAGE = /^\/(?:e\/[^/]+(?:\/i\/[0-9a-f]{64})?|[A-HJKMNP-Z2-9]{6}(?:\/[a-hjkmnp-z2-9]{8})?)\/?$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  // Calendar files, link previews and photo downloads (short-lived addresses) are never served
  // from the offline copy.
  if (url.pathname.endsWith(".ics") || url.pathname.includes("opengraph-image") || url.pathname.endsWith("/unduh")) return;

  if (request.mode === "navigate" && GUEST_PAGE.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|png|svg|webp|jpg|jpeg)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
  }
});
