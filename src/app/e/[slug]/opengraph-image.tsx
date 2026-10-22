import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Undangan acara Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /e/{slug} and the personal links under it. Drafts get the general card. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = isSupabaseConfigured() ? await getPublicEvent(slug).catch(() => null) : null;
  return linkPreview(event);
}
