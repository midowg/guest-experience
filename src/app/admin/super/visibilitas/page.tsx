import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { SuperDashboard, type SuperEventRow } from "@/components/admin/super/SuperDashboard";
import { listAdminEvents } from "@/lib/server/events";
import { hiddenEventIds } from "@/lib/server/event-visibility";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visibilitas acara · Super admin" };

/** Super admin: which events regular admins can see. Guests' pages do not change. */
export default async function SuperVisibilityPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [events, hidden] = await Promise.all([listAdminEvents(), hiddenEventIds()]);
  // Only what the list shows travels to the browser.
  const rows: SuperEventRow[] = events.map(event => ({
    id: event.id, title: event.title, slug: event.slug, status: event.status, starts_at: event.starts_at, timezone: event.timezone,
    event_kind: event.event_kind, audience: event.audience, updated_at: event.updated_at,
  }));
  return <SuperAdminFrame current="visibilitas">
    <PageHeader title="Visibilitas acara" subtitle="Acara tersembunyi tidak muncul dan tidak bisa dibuka admin biasa. Halaman tamu tetap bisa dibuka lewat tautannya." />
    <SuperDashboard events={rows} initialHidden={[...hidden.ids]} migrated={hidden.migrated} />
  </SuperAdminFrame>;
}
