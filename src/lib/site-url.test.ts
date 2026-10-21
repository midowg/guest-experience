import { expect, it } from "vitest";
import { siteUrl } from "./site-url";

it("prefers the configured address, then the Vercel production domain, then localhost", () => {
  expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://invitation.example", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://invitation.example");
  expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "bukan url", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://x.vercel.app");
  expect(siteUrl({}).origin).toBe("http://localhost:3000");
});
