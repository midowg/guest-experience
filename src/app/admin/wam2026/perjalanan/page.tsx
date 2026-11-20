import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TripsEditor } from "@/components/admin/wam-acara/isi/TripsEditor";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { eventDates } from "@/lib/main-wam/rundown";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";
import { adminTrips } from "@/lib/server/main-wam/admin/trips";
import { mainWamSettingsState, readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Perjalanan · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2026 → Perjalanan (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM 2026 admin. */
export default async function PerjalananAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, board, sessions, people] = await Promise.all([mainWamSettingsState().catch(() => readMainWamSettings()), adminTrips(), adminSessions({ usage: false }), adminPeople()]);
  return <WamAcaraFrame current="perjalanan">
    <TripsEditor initial={{ trips: board.trips, seats: board.seats }} migrated={board.migrated && settings.migrated} sessions={sessions.data} people={people}
      dates={eventDates(settings.event)} crumbs={wamAcaraCrumbs("perjalanan")} title="Perjalanan" />
  </WamAcaraFrame>;
}
