import { notFound } from "next/navigation";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CheckinBoard } from "@/components/admin/checkin/CheckinBoard";
import { getAdminEvent } from "@/lib/server/events";
import { listCheckins } from "@/lib/server/tickets";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const { guests, migrated } = await listCheckins(id);
  return <AdminShell>
    <p className="eyebrow">Check-in di pintu masuk</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="checkin" />
    <CheckinBoard event={event} initial={guests} migrated={migrated} />
  </AdminShell>;
}
