import { getFeaturedEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Werkudara Guest Experience";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for the front page: the event on air, or the general welcome. */
export default async function Image() {
  const event = isSupabaseConfigured() ? await getFeaturedEvent().catch(() => null) : null;
  return linkPreview(event);
}
