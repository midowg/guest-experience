import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PosterPage } from "@/app/_guest/pages";
import { POSTER_LABEL } from "@/lib/poster";
import { posterPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: POSTER_LABEL, robots: { index: false, follow: false } };

export default async function LegacyPosterPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();
  if (event.code) permanentRedirect(posterPath(event));
  return <PosterPage event={event} />;
}
