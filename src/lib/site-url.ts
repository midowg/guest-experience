/** The public site (Werkudara Journey), used when the configured address is only a local one. */
export const PUBLIC_SITE = "https://journey.werkudara.group";
const isLocal = (url: URL) => ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(url.hostname) || url.hostname.endsWith(".localhost");

/**
 * The public address of the site, for absolute links in link previews. NEXT_PUBLIC_SITE_URL wins,
 * except a local address on Vercel (copied from a laptop's .env), which would put localhost in
 * every WhatsApp preview. Production then uses the public site; other deployments their Vercel
 * production domain; development localhost.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (!(env.VERCEL && isLocal(url))) return url;
    } catch { /* fall through to the platform address */ }
  }
  if (env.VERCEL_ENV === "production") return new URL(PUBLIC_SITE);
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

/**
 * The address put in links the team shares (copy, QR, WhatsApp). NEXT_PUBLIC_SHARE_URL wins;
 * otherwise the site address, except that a local one (an admin run on a laptop against the live
 * database) becomes the public site, so a shared link never points at localhost.
 */
export function shareUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_SHARE_URL?.trim();
  if (configured) {
    try { return new URL(configured); } catch { /* fall through */ }
  }
  const site = siteUrl(env);
  return isLocal(site) ? new URL(PUBLIC_SITE) : site;
}
