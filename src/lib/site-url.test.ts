import { expect, it } from "vitest";
import { shareUrl, siteUrl } from "./site-url";

it("prefers the configured address, then the Vercel production domain, then localhost", () => {
  expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://invitation.example", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://invitation.example");
  expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "bukan url", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://x.vercel.app");
  expect(siteUrl({}).origin).toBe("http://localhost:3000");
});

it("never puts a local address in production previews", () => {
  expect(siteUrl({ VERCEL: "1", VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://journey.werkudara.group");
  expect(siteUrl({ VERCEL: "1", VERCEL_ENV: "production" }).origin).toBe("https://journey.werkudara.group");
  expect(siteUrl({ VERCEL: "1", VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://x.vercel.app");
  // On a laptop a local address is what the developer asked for.
  expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3100" }).origin).toBe("http://localhost:3100");
});

it("never shares a localhost link: a local site address becomes the public site", () => {
  expect(shareUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }).origin).toBe("https://journey.werkudara.group");
  expect(shareUrl({}).origin).toBe("https://journey.werkudara.group");
  expect(shareUrl({ NEXT_PUBLIC_SITE_URL: "https://staging.example" }).origin).toBe("https://staging.example");
  expect(shareUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SHARE_URL: "https://share.example" }).origin).toBe("https://share.example");
});
