/**
 * The public address of the site, for absolute links in link previews. NEXT_PUBLIC_SITE_URL wins;
 * on Vercel the production domain is the fallback, and localhost during development.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { return new URL(configured); } catch { /* fall through to the platform address */ }
  }
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}
