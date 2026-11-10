import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { TV_DEFAULT_SETTINGS, weekOf, type TvFeed } from "@/lib/pra-wam/tv";
import { tvApi } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { screenForKey, tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV Announcement", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#0b1220" };

/**
 * What an office TV opens: /tv/{key}, with no sign-in. The key in the address is the secret (Admin
 * WAM → TV Announcement makes it); a wrong or removed key is "not found", like any unknown address.
 * The page then keeps itself fresh through GET /api/tv/{key}.
 */
export default async function TvPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isSupabaseConfigured()) notFound();
  const screen = await screenForKey(key).catch(() => null);
  if (!screen) notFound();
  const now = new Date();
  // Content that cannot be read right now starts the board empty; it fills in on the next ask.
  const feed: TvFeed = await tvFeed(slideId => tvApi.image(key, slideId), now).catch(() => {
    const date = wibDate(now.toISOString());
    return { now: now.toISOString(), date, days: weekOf(date).map(day => ({ date: day, rooms: [] })), slides: [], settings: TV_DEFAULT_SETTINGS };
  });
  return <TvBoard initial={feed} feedUrl={tvApi.feed(key)} />;
}
