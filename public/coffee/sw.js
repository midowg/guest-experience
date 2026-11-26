// Werkudara Coffee's service worker (scope /coffee/, 26 Nov 2026): makes the app installable and
// answers with a short offline page when there is no signal. Pages are personal: nothing is cached.
// Web push (the "push" and "notificationclick" handlers) is added in F4.
const OFFLINE = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Werkudara Coffee</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF6EE;color:#2B1E16;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:24px;margin:0 0 8px">Sinyalnya hilang</h1><p style="max-width:22rem;margin:0 auto 20px;line-height:1.5;color:#6B5546">Werkudara Coffee butuh internet supaya pengajuanmu sampai ke pengelola. Periksa sinyal, lalu coba lagi.</p>
<button onclick="location.reload()" style="min-height:52px;padding:0 24px;border:0;border-radius:12px;background:#2F6B5A;color:#fff;font-weight:600;font-size:17px">Coba lagi</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
