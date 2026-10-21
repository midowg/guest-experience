import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { BeoView } from "@/components/admin/beo/BeoView";
import { loadBeo } from "@/lib/server/beo";
import { getAdminEvent } from "@/lib/server/events";
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
  const data = await loadBeo(id);
  if (!data) notFound();
  return <AdminShell>
    <p className="eyebrow">BEO hospitality</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="beo" />
    <BeoView event={event} summary={data.summary} initial={data.state} revisions={data.revisions} migrated={data.migrated} />
  </AdminShell>;
}
