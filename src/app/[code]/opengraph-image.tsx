import { eventByCodeQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Undangan acara Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /AB23CD and the personal links under it. Drafts get the general card. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  return linkPreview(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null);
}
