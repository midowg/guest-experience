import { notFound } from "next/navigation";
import { getAdminEvent, getFeaturedEventId } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/AdminShell";
import { EventEditor } from "@/components/admin/EventEditor";
import { DeleteEvent } from "@/components/admin/DeleteEvent";
import { formatDate, formatTime } from "@/lib/format";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function EventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const featuredId = await getFeaturedEventId();
  return <AdminShell>
    <p className="eyebrow">Editor undangan</p>
    <h1 className={styles.title}>{event.title}</h1>
    <p className={styles.eventMeta}>Dibuat {formatDate(event.created_at)}, {formatTime(event.created_at)} WIB · Terakhir disimpan {formatDate(event.updated_at)}, {formatTime(event.updated_at)} WIB</p>
    <EventNavigation event={event} current="edit" />
    <EventEditor key={event.id} event={event} />
    <DeleteEvent event={event} isFeatured={featuredId === event.id} />
  </AdminShell>;
}
