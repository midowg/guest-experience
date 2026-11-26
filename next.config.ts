import type { NextConfig } from "next";

// Personal invitations and tickets carry a secret in the address: no referrer, no cache, no index.
const personalHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];
const cameraHere = [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }];
// HR Werkudara (/hr, 20 Nov 2026): absensi with the face and the office point, and Admin HR's
// "Pakai lokasi saya" for office points. Camera and location for this site only.
const faceAndPlace = [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" }];
const sameOriginFrame = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }];

const config: NextConfig = {
  poweredByHeader: false,
  // WAM's pages are per person (dynamic); keeping a visited screen for 30 s makes moving between
  // its menus instant, like an app. Saving anything refreshes the screen it changed.
  experimental: { staleTimes: { dynamic: 30 } },
  // Panduan ke Werkudara: the office's public guide for every visitor, a finished page served as it
  // was designed (public/panduan-ke-werkudara), not an event.
  async rewrites() {
    // beforeFiles, not the default afterFiles: Next adds the intercepting routes ((app)/@sheet/(.)agenda/[id], Detail sesi as a
    // sheet over the screen) as beforeFiles rewrites whose source is the folder's address (/wam/acara/agenda/:id). The address
    // /wam2026/agenda/x must already be /wam/acara/agenda/x when they are tried, else the sheet is never intercepted: a tap on a
    // session went to the full Agenda page (its skeleton behind the sheet, and Beranda left behind).
    return { beforeFiles: [{ source: "/wam2026", destination: "/wam/acara" }, { source: "/wam2026/:path*", destination: "/wam/acara/:path*" }] };
  },
  async redirects() {
    return [
      // WAM 2026 (the event app) is published as /wam2026; the folder stays src/app/wam/acara (it shares /wam's layout) and
      // the rewrite below serves it. The old address keeps working for links already sent.
      { source: "/wam/acara", destination: "/wam2026", permanent: true },
      { source: "/wam/acara/:path*", destination: "/wam2026/:path*", permanent: true },
      // Ringkasan panitia/BOD in the event app was removed on 23 Nov 2026 (the owner's ask); old links land on Beranda, not a 404.
      { source: "/wam2026/ringkasan/:path*", destination: "/wam2026", permanent: false },
      { source: "/wam/acara/ringkasan/:path*", destination: "/wam2026", permanent: false },
      { source: "/panduan", destination: "/your-visit", permanent: false },
      // WG People moved from /hr to /people (21 Nov 2026, the owner's ask); old links and installs keep working.
      { source: "/hr", destination: "/people", permanent: true },
      { source: "/hr/:path*", destination: "/people/:path*", permanent: true },
      // Werkudara Coffee: the pengelola page was first planned at /coffee/hr; it lives in Journey Admin (25 Nov 2026).
      { source: "/coffee/hr", destination: "/admin/coffee", permanent: false },
      { source: "/coffee/hr/:path*", destination: "/admin/coffee", permanent: false },
      { source: "/panduan-ke-werkudara", destination: "/your-visit", permanent: false },
      // The app was first published as /pra-wam with Indonesian paths; it is WAM now (Pra WAM is a
      // phase inside it). Old links and printed QR codes keep working.
      { source: "/pra-wam/absen/:token", destination: "/wam/check-in/:token", permanent: true },
      { source: "/pra-wam/masuk", destination: "/wam/login", permanent: true },
      { source: "/pra-wam/atur-password", destination: "/wam/reset-password", permanent: true },
      { source: "/pra-wam/:path*", destination: "/wam", permanent: true },
      // WAM's settings moved from the super admin to Admin WAM, for every admin; only Data karyawan stays.
      { source: "/admin/super/pra-wam", destination: "/admin/wam", permanent: true },
      { source: "/admin/super/wam", destination: "/admin/wam", permanent: true },
      // "Unit dan jabatan" left Admin WAM: units are imported with Data karyawan (super admin).
      { source: "/admin/wam/unit", destination: "/admin/super/karyawan", permanent: true },
      // Appraisal became Book (room booking for everyone); query strings (?date=, ?edit=) pass through.
      { source: "/wam/appraisal/book", destination: "/wam/book/new", permanent: true },
      { source: "/wam/appraisal", destination: "/wam/book", permanent: true },
      // Lemari MoM was renamed Arsip MoM (12 Nov 2026) the day it opened.
      { source: "/admin/wam/lemari-mom", destination: "/admin/wam/arsip-mom", permanent: true },
      // Wellbeing moved to /wlm (WLM, the programme's name, 18 Nov 2026); older links keep working.
      { source: "/wellbeing", destination: "/wlm", permanent: false },
      { source: "/wellbeing/:path*", destination: "/wlm/:path*", permanent: false },
      { source: "/admin/wellbeing", destination: "/admin/wlm", permanent: false },
      { source: "/admin/wellbeing/:path*", destination: "/admin/wlm/:path*", permanent: false },
      // Main WAM's admin left Admin Pra WAM for its own door, Admin WAM 2026 (20 Nov 2026, KONTRAK §15); old links
      // land there and are checked there (the wam_acara right).
      { source: "/admin/wam/main", destination: "/admin/wam2026", permanent: false },
      { source: "/admin/wam/main/:path*", destination: "/admin/wam2026/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ] },
      // Werkudara Coffee's service worker sits at /coffee/sw.js, which by default may only control /coffee/…; the app's first
      // page is /coffee itself, so the worker is allowed that one address above its folder (26 Nov 2026, audit F2-04).
      { source: "/coffee/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/coffee" }, { key: "Cache-Control", value: "no-cache, max-age=0" }] },
      { source: "/e/:slug/i/:token", headers: personalHeaders },
      { source: "/e/:slug/i/:token/tiket", headers: personalHeaders },
      { source: "/:code([A-Za-z2-9]{6})/:token([a-z2-9]{8})", headers: personalHeaders },
      { source: "/:code([A-Za-z2-9]{6})/:token([a-z2-9]{8})/tiket", headers: personalHeaders },
      // The door check-in (admin) and WAM's attendance scanner use the camera. The policy belongs to
      // the page first loaded, and both scanners are reached by moving inside the app without a
      // reload (Beranda or Agenda to Scan; the event list to Check-in), so the whole area allows the
      // camera for this site only. Guest pages keep it off.
      { source: "/admin", headers: cameraHere },
      { source: "/admin/:path*", headers: cameraHere },
      { source: "/wam", headers: cameraHere },
      { source: "/wam/:path*", headers: cameraHere },
      // WAM 2026 (the event app, 21 Nov 2026): camera for Momen and Misi, location for the Misi place check.
      { source: "/wam2026", headers: faceAndPlace },
      { source: "/wam2026/:path*", headers: faceAndPlace },
      { source: "/people", headers: faceAndPlace },
      { source: "/people/:path*", headers: faceAndPlace },
      // Development calibration of the face check and the clock-in layout (404 in production).
      { source: "/dev-preview/wajah", headers: faceAndPlace },
      { source: "/dev-preview/absen", headers: faceAndPlace },
      { source: "/admin/hero-preview", headers: sameOriginFrame },
      { source: "/admin/pratinjau-langsung", headers: sameOriginFrame },
      // Development twin of the editor preview (404 in production).
      { source: "/dev-preview/pratinjau-langsung", headers: sameOriginFrame },
      // The editor options preview frames this sample guest page (404 in production).
      { source: "/dev-preview/welcome", headers: sameOriginFrame },
    ];
  },
};
export default config;
