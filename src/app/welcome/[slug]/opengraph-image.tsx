import { welcomeEventQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";
import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Pratinjau tautan dari Werkudara";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for /welcome/vortex and the personal links under it. Drafts get the general card. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return linkPreview(isSupabaseConfigured() ? await welcomeEventQuietly((await params).slug) : null);
}
