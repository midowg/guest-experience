import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PosterPage } from "@/app/_guest/pages";
import { eventByCode } from "@/app/_guest/find";
import { POSTER_LABEL } from "@/lib/poster";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: POSTER_LABEL, robots: { index: false, follow: false } };

export default async function ShortPosterPage({ params }: { params: Promise<{ code: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  return <PosterPage event={await eventByCode((await params).code, "/poster")} />;
}
