// WAM's service worker (scope /wam/): makes the app installable, answers with a short offline
// page when there is no signal, and shows Notifikasi di HP (Web Push, 8 Nov 2026). Pages are
// personal, so nothing signed-in is cached.
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

// Notifikasi di HP: the server sends {title, body, url, tag}; tapping opens that page in WAM.
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  // A note with the same tag replaces the older one on the phone; renotify makes it ring and show
  // again (9 Nov 2026: a second "Kirim notifikasi tes" used to replace the first in silence).
  event.waitUntil(self.registration.showNotification(data.title || "WAM", {
    body: data.body || "",
    icon: "/wam/icon-192.png",
    badge: "/wam/badge-96.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/wam/notifications" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/wam/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin + "/wam") && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
