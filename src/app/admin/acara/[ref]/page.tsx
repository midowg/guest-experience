import { notFound, redirect } from "next/navigation";
import { adminEventPath } from "@/lib/routes";
import { isEventId as isId } from "@/lib/short-code";
import { getAdminEvent, getFeaturedEventId, resolveEventRef } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EventEditor } from "@/components/admin/editor/EventEditor";
import { shareUrl } from "@/lib/site-url";
import { listStaff } from "@/lib/server/staff";
import { listPosterDesigns } from "@/lib/server/poster-designs";
import { DeleteEvent } from "@/components/admin/events/DeleteEvent";
import { formatDateTime } from "@/lib/format";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";
import { disabledModulesFor } from "@/lib/server/admin-settings";
import { readyPhotoCount } from "@/lib/server/gallery";
import { listInvitations } from "@/lib/server/invitations";
import type { EventRecord } from "@/lib/types";

/** Kunjungan Kantor's editor labels Foto kunjungan with the photo count and previews a personal link with the first guest's name. */
async function visitExtras(event: EventRecord): Promise<{ photoCount?: number; previewGuest?: string }> {
  if (event.event_kind !== "kunjungan") return {};
  const [photos, invitations] = await Promise.allSettled([readyPhotoCount(event.id), listInvitations(event.id)]);
  return {
    photoCount: photos.status === "fulfilled" ? photos.value : undefined,
    previewGuest: invitations.status === "fulfilled" ? invitations.value.invitations[0]?.name : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function EventEditorPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { ref } = await params;
  const id = await resolveEventRef(ref);
  if (!id) notFound();
  const role = await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  if ((event.event_kind === "csr" || event.event_kind === "panduan") && !isId(ref)) redirect(adminEventPath(event, "edit"));
  const featuredId = await getFeaturedEventId();
  return <AdminShell wide>
    <p className="eyebrow">{event.event_kind === "csr" ? "Friday Sharing" : event.event_kind === "panduan" ? "Editor panduan" : event.event_kind === "kunjungan" ? "Kunjungan Kantor" : "Editor undangan"}</p>
    <h1 className={styles.title}>{event.title}</h1>
    <p className={styles.eventMeta}>Dibuat {formatDateTime(event.created_at)} · Terakhir disimpan {formatDateTime(event.updated_at)}</p>
    <EventNavigation event={event} current="edit" />
    <EventEditor key={event.id} event={event} disabledModules={await disabledModulesFor(role)} superAdmin={role === "super"} origin={shareUrl().origin} staff={(await listStaff()).staff} posterDesigns={(await listPosterDesigns()).designs} dangerZone={<DeleteEvent event={event} isFeatured={featuredId === event.id} bare />} {...await visitExtras(event)} />
  </AdminShell>;
}
