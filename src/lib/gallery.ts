import { z } from "zod";

export const galleryStatuses = ["uploading", "pending", "ready", "hidden"] as const;
export type GalleryStatus = (typeof galleryStatuses)[number];
export const galleryStatusLabels: Record<GalleryStatus, string> = { uploading: "Sedang diunggah", pending: "Menunggu tinjauan", ready: "Tayang", hidden: "Disembunyikan" };

export const galleryLimits = {
  perEvent: 2000,
  originalBytes: 25 * 1024 * 1024,
  largeBytes: 4 * 1024 * 1024,
  thumbBytes: 512 * 1024,
  /** Long edge of the display and thumbnail versions made in the browser. */
  largeEdge: 2048,
  thumbEdge: 480,
} as const;

export type GalleryPhoto = {
  id: string; status: GalleryStatus; width: number | null; height: number | null;
  caption: string; alt: string; sort_order: number; created_at: string; original_bytes: number;
  thumb_url: string; large_url: string;
};

export const uploadRequestSchema = z.object({
  original: z.object({ type: z.string().max(100), size: z.number().int().min(1).max(galleryLimits.originalBytes) }),
  large: z.object({ size: z.number().int().min(1).max(galleryLimits.largeBytes) }),
  thumb: z.object({ size: z.number().int().min(1).max(galleryLimits.thumbBytes) }),
  width: z.number().int().min(1).max(20000).nullable(),
  height: z.number().int().min(1).max(20000).nullable(),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const photoPatchSchema = z.object({
  status: z.enum(["pending", "ready", "hidden"]).optional(),
  caption: z.string().trim().max(300).optional(),
  alt: z.string().trim().max(300).optional(),
  sort_order: z.number().int().optional(),
}).refine(patch => Object.keys(patch).length > 0, { message: "Tidak ada perubahan." });

/** Long edge scaled down to `edge`, never up. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const SIX_MONTHS = 183 * 24 * 3600 * 1000;
/** Guests can open the gallery until six months after the event ends. */
export function galleryOpen(event: { starts_at: string; ends_at: string | null }, now = Date.now()): boolean {
  const end = Date.parse(event.ends_at || event.starts_at);
  return !Number.isFinite(end) || now <= end + SIX_MONTHS;
}
