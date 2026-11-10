import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { DEFAULT_WAM_LOOK } from "@/lib/pra-wam/theme";
import { TV_DEFAULT_SETTINGS, weekOf, type TvFeed } from "@/lib/pra-wam/tv";
import { tvApi } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { screenForKey, tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV Announcement", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#0b1220" };

/**
 * What an office TV opens: /tv/{address}, with no sign-in, e.g. /tv/lobi. The address is the short
 * one the admin picked in Admin WAM → TV Announcement and is open on purpose (a TV made before the
 * short addresses still answers at its long key); an address no TV has is "not found". The page
 * then keeps itself fresh through GET /api/tv/{address}.
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
    return { now: now.toISOString(), date, days: weekOf(date).map(day => ({ date: day, rooms: [] })), slides: [], settings: TV_DEFAULT_SETTINGS, look: DEFAULT_WAM_LOOK };
  });
  return <TvBoard initial={feed} feedUrl={tvApi.feed(key)} />;
}
