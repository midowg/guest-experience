import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/AdminShell";
import { SuperDashboard, type SuperEventRow } from "@/components/admin/SuperDashboard";
import styles from "@/components/admin/admin.module.css";
import { isSupabaseConfigured } from "@/lib/server/config";
import { listAdminEvents } from "@/lib/server/events";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard super admin" };

/** Super admin only. For anyone else the page does not exist. */
export default async function SuperAdminPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [events, hidden] = await Promise.all([listAdminEvents(), hiddenEventIds()]);
  // Only what the dashboard shows travels to the browser.
  const rows: SuperEventRow[] = events.map(event => ({
    id: event.id, title: event.title, slug: event.slug, status: event.status, starts_at: event.starts_at, timezone: event.timezone,
    event_kind: event.event_kind, audience: event.audience, updated_at: event.updated_at,
  }));
  return <AdminShell>
    <p className="eyebrow">Super admin</p>
    <h1 className={styles.title}>Dashboard super admin</h1>
    <p className={styles.lead}>Atur acara mana yang terlihat oleh admin biasa. Acara yang disembunyikan tidak muncul di panel mereka dan tidak bisa mereka buka, ubah, atau salin. Halaman tamu tidak berubah: acara yang sudah dipublikasikan tetap bisa dibuka lewat tautannya.</p>
    <SuperDashboard events={rows} initialHidden={[...hidden.ids]} migrated={hidden.migrated} />
  </AdminShell>;
}
