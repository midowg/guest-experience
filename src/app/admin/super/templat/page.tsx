import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { TemplatesAndEvents, type SuperEventRow } from "@/components/admin/super/TemplatesAndEvents";
import { getEnabledTemplates } from "@/lib/server/admin-settings";
import { listAdminEvents } from "@/lib/server/events";
import { hiddenEventIds } from "@/lib/server/event-visibility";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templat & acara · Super admin" };

/**
 * Super admin: per kind of event, the templates regular admins can pick in Buat acara and the
 * events they can see (6 Nov 2026: Templat and Visibilitas acara were two pages).
 */
export default async function SuperTemplatesPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [templates, events, hidden] = await Promise.all([getEnabledTemplates(), listAdminEvents(), hiddenEventIds()]);
  // Only what the page shows travels to the browser.
  const rows: SuperEventRow[] = events.map(event => ({
    id: event.id, title: event.title, slug: event.slug, status: event.status, starts_at: event.starts_at, timezone: event.timezone,
    event_kind: event.event_kind, audience: event.audience, updated_at: event.updated_at,
  }));
  return <SuperAdminFrame current="templat" wide>
    <PageHeader title="Templat & acara" subtitle="Per jenis acara: templat yang bisa dipilih admin biasa di Buat acara, dan acara yang bisa mereka lihat. Halaman tamu tidak berubah." />
    <TemplatesAndEvents events={rows} initialEnabled={templates.templates} templatesMigrated={templates.migrated} initialHidden={[...hidden.ids]} visibilityMigrated={hidden.migrated} />
  </SuperAdminFrame>;
}
