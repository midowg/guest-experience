import { notFound, redirect } from "next/navigation";
import { isEventId as isId } from "@/lib/short-code";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { listDonations } from "@/lib/server/donations";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { DonationBoard } from "@/components/admin/donations/DonationBoard";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";
import { absolute, adminEventPath, eventPath } from "@/lib/routes";
import { shareUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** CSR events: the donations that came in, to receive or reject, and the handover news to every donor. */
export default async function DonationsPage({ params }: { params: Promise<{ ref: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { ref } = await params;
  const id = await resolveEventRef(ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  if (event.event_kind === "csr" && !isId(ref)) redirect(adminEventPath(event, "donations"));
  if (event.event_kind !== "csr") notFound();
  const { donations, migrated } = await listDonations(id);
  return <AdminShell>
    <p className="eyebrow">Donasi</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="donations" />
    <DonationBoard event={{ id: event.id, title: event.title, timezone: event.timezone, donation: event.donation }} link={absolute(shareUrl().origin, eventPath(event))} initial={donations} migrated={migrated} />
  </AdminShell>;
}
