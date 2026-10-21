import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/AdminShell";
import { InvitationManager } from "@/components/admin/InvitationManager";
import { PublicLinkCard } from "@/components/admin/PublicLinkCard";
import { siteUrl } from "@/lib/site-url";
import { getAdminEvent } from "@/lib/server/events";
import { listInvitations } from "@/lib/server/invitations";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const { invitations, migrated } = await listInvitations(id);
  return <AdminShell>
    <p className="eyebrow">Undangan individual</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="invitations" />
    <PublicLinkCard event={event} origin={siteUrl().origin} />
    <InvitationManager event={event} initial={invitations} migrated={migrated} />
  </AdminShell>;
}
