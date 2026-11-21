import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { InvitationManager } from "@/components/admin/invitations/InvitationManager";
import { PublicLinkCard } from "@/components/admin/invitations/PublicLinkCard";
import { shareUrl } from "@/lib/site-url";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { listInvitations } from "@/lib/server/invitations";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function InvitationsPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const id = await resolveEventRef((await params).ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const { invitations, migrated } = await listInvitations(id);
  return <AdminShell>
    <EventNavigation event={event} current="invitations" />
    <PublicLinkCard event={event} origin={shareUrl().origin} />
    <InvitationManager event={event} initial={invitations} migrated={migrated} origin={shareUrl().origin} />
  </AdminShell>;
}
