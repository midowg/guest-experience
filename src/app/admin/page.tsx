import { getFeaturedEventId, listAdminEvents } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EventList } from "@/components/admin/events/EventList";
import { currentPhase } from "@/lib/event-phase";
import { currentAdmin, requireAdminPage } from "@/lib/server/admin-session";
import { actorHasApp, eventsFor } from "@/lib/server/admin-actor";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { disabledModulesFor, templatesFor } from "@/lib/server/admin-settings";
import { listStaff } from "@/lib/server/staff";
import { standaloneApps } from "@/lib/server/standalone-apps";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [all, featuredId, hidden, disabledModules, templates, team, apps, actor] = await Promise.all([listAdminEvents(), getFeaturedEventId(), hiddenEventIds(), disabledModulesFor(role), templatesFor(role), listStaff(), standaloneApps(), currentAdmin()]);
  // An admin never receives events they may not open, not even in the page payload: hidden ones,
  // and for a personal admin (13 Nov 2026) everything outside their grant.
  const events = actor ? eventsFor(actor, all, hidden.ids) : [];
  // Apps they were not given are not shown; Booking Kantor has its own access (Admin Booking).
  const shown = apps.filter(app => !actor || app.key === "booking" || actorHasApp(actor, app.key === "wam" ? "wam" : "tv"));
  return <AdminShell>
    <EventList events={events} featuredId={featuredId} phases={Object.fromEntries(events.map(event => [event.id, currentPhase(event)]))}
      superAdmin={role === "super" ? { hiddenIds: [...hidden.ids], migrated: hidden.migrated } : undefined} disabledModules={disabledModules} templates={templates} staff={team.staff} apps={shown}
      canCreate={!actor || actorHasApp(actor, "acara")} />
  </AdminShell>;
}
