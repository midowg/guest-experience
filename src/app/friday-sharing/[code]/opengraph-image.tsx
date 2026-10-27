import { eventByCodeQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Pratinjau tautan dari Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /friday-sharing/AB23CD: that Friday Sharing's card. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const event = isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null;
  return linkPreview(event?.event_kind === "csr" ? event : null);
}
