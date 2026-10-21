import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/AdminShell";
import { BeoView } from "@/components/admin/BeoView";
import { beoSummary } from "@/lib/beo";
import { getBeo } from "@/lib/server/beo";
import { getAdminEvent } from "@/lib/server/events";
import { listAllRsvps } from "@/lib/server/responses";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function BeoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const [beo, rsvps] = await Promise.all([getBeo(id), listAllRsvps(id)]);
  return <AdminShell>
    <p className="eyebrow">BEO hospitality</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="beo" />
    <BeoView event={event} summary={beoSummary(event, rsvps, beo.state.locked_at)} initial={beo.state} revisions={beo.revisions} migrated={beo.migrated} />
  </AdminShell>;
}
