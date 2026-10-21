import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/guest/PhotoGallery";
import { galleryOpen } from "@/lib/gallery";
import { getPublicEvent } from "@/lib/server/events";
import { listPublicPhotos } from "@/lib/server/gallery";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Galeri foto", robots: { index: false, follow: false } };

/** Ready photos of a published event. The gallery closes six months after the event. */
export default async function GuestGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();
  const open = galleryOpen(event);
  return <PhotoGallery event={event} photos={open ? await listPublicPhotos(event.id) : []} closed={!open} />;
}
