import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { tvHomeApi } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV Announcement", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#0a0f2e" };

/**
 * /tv: the one address for every office TV, with no sign-in and no TV named. Every TV plays the
 * same board, so this is enough to put it on a screen; a TV's own address (/tv/lobi) only adds
 * that Admin WAM can tell which TV is on. Open on purpose, like those. Before the TV migration
 * there is nothing to play and the address is "not found".
 */
export default async function TvHomePage() {
  if (!isSupabaseConfigured()) notFound();
  const feed = await tvFeed(tvHomeApi.image).catch(() => null);
  if (!feed) notFound();
  return <TvBoard initial={feed} feedUrl={tvHomeApi.feed} />;
}
