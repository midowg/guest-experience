import { getFeaturedEventId, listAdminEvents } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, SetupNotice } from "@/components/admin/AdminShell";
import { EventList } from "@/components/admin/EventList";
import { FeaturedControl } from "@/components/admin/FeaturedControl";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [events, featuredId] = await Promise.all([listAdminEvents(), getFeaturedEventId()]);
  return <AdminShell>
    <p className="eyebrow">Pengelolaan acara</p>
    <h1 className={styles.title}>Acara Anda</h1>
    <FeaturedControl events={events} featuredId={featuredId} />
    <EventList events={events} featuredId={featuredId} />
  </AdminShell>;
}
