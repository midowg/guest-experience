import { getFeaturedEventId, listAdminEvents } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, SetupNotice } from "@/components/admin/AdminShell";
import { EventList } from "@/components/admin/EventList";
import { FeaturedControl } from "@/components/admin/FeaturedControl";
import styles from "@/components/admin/admin.module.css";
import { currentPhase } from "@/lib/event-phase";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { disabledModulesFor } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [all, featuredId, hidden, disabledModules] = await Promise.all([listAdminEvents(), getFeaturedEventId(), hiddenEventIds(), disabledModulesFor(role)]);
  // A regular admin never receives hidden events at all, not even in the page payload.
  const events = role === "super" ? all : all.filter(event => !hidden.ids.has(event.id));
  return <AdminShell>
    <p className="eyebrow">Pengelolaan acara</p>
    <h1 className={styles.title}>Acara Anda</h1>
    <p className={styles.lead}>Buat, atur, dan pantau setiap acara dari satu tempat. Lencana berwarna menunjukkan tahap acara saat ini.</p>
    <FeaturedControl events={events} featuredId={featuredId} />
    <EventList events={events} featuredId={featuredId} phases={Object.fromEntries(events.map(event => [event.id, currentPhase(event)]))}
      superAdmin={role === "super" ? { hiddenIds: [...hidden.ids], migrated: hidden.migrated } : undefined} disabledModules={disabledModules} />
  </AdminShell>;
}
