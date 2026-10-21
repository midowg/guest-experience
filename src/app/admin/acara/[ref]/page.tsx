import { notFound } from "next/navigation";
import { getAdminEvent, getFeaturedEventId, resolveEventRef } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { siteUrl } from "@/lib/site-url";
import { listStaff } from "@/lib/server/staff";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";
import { disabledModulesFor } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";

export default async function EventEditorPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const id = await resolveEventRef((await params).ref);
  if (!id) notFound();
  const role = await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const featuredId = await getFeaturedEventId();
  return <AdminShell wide>
    <p className="eyebrow">Editor undangan</p>
    <h1 className={styles.title}>{event.title}</h1>
    <p className={styles.eventMeta}>Dibuat {formatDateTime(event.created_at)} · Terakhir disimpan {formatDateTime(event.updated_at)}</p>
    <EventNavigation event={event} current="edit" />
    <EventEditor key={event.id} event={event} disabledModules={await disabledModulesFor(role)} superAdmin={role === "super"} origin={siteUrl().origin} staff={(await listStaff()).staff} />
    <DeleteEvent event={event} isFeatured={featuredId === event.id} />
  </AdminShell>;
}
