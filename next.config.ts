import type { NextConfig } from "next";

// Personal invitations and tickets carry a secret in the address: no referrer, no cache, no index.
const personalHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];
const cameraHere = [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }];
const sameOriginFrame = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }];

const config: NextConfig = {
  poweredByHeader: false,
  // WAM's pages are per person (dynamic); keeping a visited screen for 30 s makes moving between
  // its menus instant, like an app. Saving anything refreshes the screen it changed.
  experimental: { staleTimes: { dynamic: 30 } },
  // Panduan ke Werkudara: the office's public guide for every visitor, a finished page served as it
  // was designed (public/panduan-ke-werkudara), not an event.
  async redirects() {
    return [
      { source: "/panduan", destination: "/your-visit", permanent: false },
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
      { source: "/admin/hero-preview", headers: sameOriginFrame },
      { source: "/admin/pratinjau-langsung", headers: sameOriginFrame },
      // Development twin of the editor preview (404 in production).
      { source: "/dev-preview/pratinjau-langsung", headers: sameOriginFrame },
    ];
  },
};
export default config;
