import { z } from "zod";
import { galleryOpen } from "@/lib/gallery";
import { getPublicEvent } from "@/lib/server/events";
import { originalDownload } from "@/lib/server/gallery";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** GET: redirect to a one-hour address for the original of a ready photo. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; photoId: string }> }) {
  const { slug, photoId } = await params;
  if (!isSupabaseConfigured() || !z.uuid().safeParse(photoId).success) return new Response("Foto tidak ditemukan.", { status: 404 });
  const event = await getPublicEvent(slug).catch(() => null);
  if (!event || !galleryOpen(event)) return new Response("Foto tidak ditemukan.", { status: 404 });
  const url = await originalDownload(event.id, photoId, event.slug).catch(() => null);
  if (!url) return new Response("Foto tidak ditemukan.", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
