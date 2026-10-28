import { notFound, redirect } from "next/navigation";
import { adminEventPath } from "@/lib/routes";
import { isEventId as isId } from "@/lib/short-code";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { listDonations } from "@/lib/server/donations";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { DonationSplit } from "@/components/admin/donations/DonationSplit";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** Friday Sharing: share each received donation out to a recipient, for the handover report. */
export default async function DonationSplitPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { ref } = await params;
  const id = await resolveEventRef(ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event || event.event_kind !== "csr") notFound();
  if (!isId(ref)) redirect(adminEventPath(event, "donations-split"));
  const { donations, migrated, split } = await listDonations(id);
  return <AdminShell>
    <p className="eyebrow">Friday Sharing</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="donations-split" />
    <DonationSplit event={{ id: event.id, timezone: event.timezone, donation: event.donation }} initial={donations} ready={migrated && split} />
  </AdminShell>;
}
