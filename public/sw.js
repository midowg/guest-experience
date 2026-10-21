// Offline copy of guest pages (/e/…) for trips and programmes with weak signal.
// Pages: network first, the last copy when offline. Build assets: cached on first use.
// Never touches /admin or /api; registered with scope /e/ from the guest page only.
const CACHE = "wk-guest-v1";

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
  // Calendar files and link previews are always fresh; never served from the offline copy.
  if (url.pathname.endsWith(".ics") || url.pathname.includes("opengraph-image")) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/e/")) {
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
