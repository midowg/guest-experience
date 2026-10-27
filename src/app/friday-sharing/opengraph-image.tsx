import { isSupabaseConfigured } from "@/lib/server/config";
import { getCurrentFridaySharing } from "@/lib/server/events";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Pratinjau tautan dari Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /friday-sharing: the card of the Friday Sharing it opens. */
export default async function Image() {
  return linkPreview(isSupabaseConfigured() ? await getCurrentFridaySharing().catch(() => null) : null);
}
