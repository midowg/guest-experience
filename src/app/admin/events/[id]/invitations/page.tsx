import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/AdminShell";
import { InvitationManager } from "@/components/admin/InvitationManager";
import { getAdminEvent } from "@/lib/server/events";
import { listInvitations } from "@/lib/server/invitations";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const invitations = await listInvitations(id);
  return <AdminShell>
    <p className="eyebrow">Undangan individual</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="invitations" />
    <InvitationManager event={event} initial={invitations} />
  </AdminShell>;
}
