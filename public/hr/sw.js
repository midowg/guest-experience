// HR Werkudara's service worker (scope /hr/, 20 Nov 2026): makes the app installable, answers with
// a short offline page when there is no signal, and keeps the face check's programs and models
// (about 25 MB, the same for everyone; each address names its exact version) after the first
// clock-in, so the next one starts at once and spends no data. Pages are personal: never cached.
const OFFLINE = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HR Werkudara</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F6F7F9;color:#111827;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-size:22px;color:#2F6FEB">HR Werkudara</h1><p>Tidak ada koneksi internet. Absen butuh internet untuk dicatat; periksa sinyal lalu coba lagi.</p>
<button onclick="location.reload()" style="min-height:48px;padding:0 20px;border:0;border-radius:12px;background:#2F6FEB;color:#fff;font-weight:700;font-size:15px">Coba lagi</button></div></body></html>`;

// A new version is a new address; FACE_CACHE changes only to drop the old files.
const FACE_CACHE = "hr-face-v1";
const FACE_FILES = [
  "/hr/models/",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm/",
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/",
];
const isFaceFile = url => FACE_FILES.some(prefix => (prefix.startsWith("/") ? url.origin === self.location.origin && url.pathname.startsWith(prefix) : url.href.startsWith(prefix)));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("hr-face-") && name !== FACE_CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method === "GET" && isFaceFile(new URL(request.url))) {
    event.respondWith((async () => {
      const cache = await caches.open(FACE_CACHE);
      const kept = await cache.match(request);
      if (kept) return kept;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })());
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
