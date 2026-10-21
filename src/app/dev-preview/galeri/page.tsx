import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { GalleryManager } from "@/components/admin/gallery/GalleryManager";
import { PhotoGallery } from "@/components/guest/PhotoGallery";
import type { GalleryPhoto } from "@/lib/gallery";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/**
 * Layout check for the photo gallery with placeholder photos. ?tampil=tamu shows the guest page;
 * ?r2=0 shows the "storage not set up" state. Nothing is uploaded from here.
 */
export default async function DevGalleryPage({ searchParams }: { searchParams: Promise<{ tampil?: string; r2?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const event = { ...createSeedEvent(), contact: { ...createSeedEvent().contact, phone: "0812 0000 0000" } };
  const statuses: GalleryPhoto["status"][] = ["ready", "ready", "pending", "ready", "hidden", "pending", "ready", "ready"];
  const photos: GalleryPhoto[] = statuses.map((status, n) => ({
    id: `9a000000-0000-4000-8000-00000000000${n}`, status, width: 1600, height: 1000, caption: n === 0 ? "Contoh keterangan foto" : "", alt: "",
    sort_order: n, created_at: "2026-11-04T00:00:00Z", original_bytes: 1000,
    thumb_url: `https://picsum.photos/seed/wk-galeri${n}/480/300`, large_url: `https://picsum.photos/seed/wk-galeri${n}/1600/1000`,
  }));
  if (params.tampil === "tamu") return <PhotoGallery event={event} photos={photos.filter(photo => photo.status === "ready")} closed={false} />;
  return <AdminShell bare><h1>Galeri foto (contoh)</h1><GalleryManager event={event} initial={photos} configured={params.r2 !== "0"} migrated /></AdminShell>;
}
