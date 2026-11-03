// WAM's service worker (scope /wam/): makes the app installable and answers with a short
// offline page when there is no signal. Pages are personal, so nothing signed-in is cached.
const OFFLINE = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WAM</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FAFAF7;color:#1E2733;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-family:Georgia,serif;color:#1551A0;font-weight:600">WAM</h1><p>Tidak ada koneksi internet. Periksa sinyal lalu coba lagi.</p>
<button onclick="location.reload()" style="min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#1551A0;color:#FAFAF7;font-weight:800;font-size:15px">Coba lagi</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
