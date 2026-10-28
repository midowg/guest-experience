import type { NextConfig } from "next";

// Personal invitations and tickets carry a secret in the address: no referrer, no cache, no index.
const personalHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];
const sameOriginFrame = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }];

const config: NextConfig = {
  poweredByHeader: false,
  // Panduan ke Werkudara: the office's public guide for every visitor, a finished page served as it
  // was designed (public/panduan-ke-werkudara), not an event.
  async redirects() {
    return [
      { source: "/panduan", destination: "/your-visit", permanent: false },
      { source: "/panduan-ke-werkudara", destination: "/your-visit", permanent: false },
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
      // The door check-in scans tickets with the camera; every other page keeps it off.
      { source: "/admin/acara/:ref/checkin", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }] },
      { source: "/admin/hero-preview", headers: sameOriginFrame },
      { source: "/admin/pratinjau-langsung", headers: sameOriginFrame },
      // Development twin of the editor preview (404 in production).
      { source: "/dev-preview/pratinjau-langsung", headers: sameOriginFrame },
    ];
  },
};
export default config;
