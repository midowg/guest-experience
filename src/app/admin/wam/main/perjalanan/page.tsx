import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TripsEditor } from "@/components/admin/wam/main-wam/isi/TripsEditor";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { eventDates } from "@/lib/main-wam/rundown";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";
import { adminTrips } from "@/lib/server/main-wam/admin/trips";
import { mainWamSettingsState, readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perjalanan · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Perjalanan (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM admin. */
export default async function PerjalananAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, board, sessions, people] = await Promise.all([mainWamSettingsState().catch(() => readMainWamSettings()), adminTrips(), adminSessions({ usage: false }), adminPeople()]);
  return <WamAdminFrame current="mw-perjalanan">
    <TripsEditor initial={{ trips: board.trips, seats: board.seats }} migrated={board.migrated && settings.migrated} sessions={sessions.data} people={people}
      dates={eventDates(settings.event)} crumbs={wamCrumbs("mw-perjalanan")} title="Main WAM · Perjalanan" />
  </WamAdminFrame>;
}
