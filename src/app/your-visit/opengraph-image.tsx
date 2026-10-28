import { isSupabaseConfigured } from "@/lib/server/config";
import { getCurrentPlaceGuide } from "@/lib/server/events";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Pratinjau tautan dari Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /your-visit: the card of the Panduan lokasi it opens. */
export default async function Image() {
  return linkPreview(isSupabaseConfigured() ? await getCurrentPlaceGuide().catch(() => null) : null);
}
