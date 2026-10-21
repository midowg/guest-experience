import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { GalleryPage } from "@/app/_guest/pages";
import { galleryPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Galeri foto", robots: { index: false, follow: false } };

export default async function LegacyGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();
  if (event.code) permanentRedirect(galleryPath(event));
  return <GalleryPage event={event} />;
}
