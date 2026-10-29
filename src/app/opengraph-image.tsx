import { linkPreview, previewSize } from "@/lib/server/link-preview";

export const dynamic = "force-dynamic";
export const alt = "Werkudara Journey";
export const size = previewSize;
export const contentType = "image/png";

/** Link preview for the front page: the general welcome, since it features no event. */
export default function Image() {
  return linkPreview(null);
}
