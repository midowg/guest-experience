import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { GalleryManager } from "@/components/admin/gallery/GalleryManager";
import { galleryReadiness, listAdminPhotos } from "@/lib/server/gallery";
import { getAdminEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const readiness = await galleryReadiness(id);
  const photos = readiness.configured && readiness.migrated ? await listAdminPhotos(id) : [];
  return <AdminShell>
    <p className="eyebrow">Galeri foto acara</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="gallery" />
    <GalleryManager event={event} initial={photos} configured={readiness.configured} migrated={readiness.migrated} />
  </AdminShell>;
}
