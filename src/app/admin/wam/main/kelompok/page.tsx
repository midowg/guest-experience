import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { ActivityGroupsEditor } from "@/components/admin/wam/main-wam/isi/ActivityGroupsEditor";
import { GroupsEditor } from "@/components/admin/wam/main-wam/isi/GroupsEditor";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { eventDates } from "@/lib/main-wam/rundown";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { adminActivityGroups, adminGroups } from "@/lib/server/main-wam/admin/groups";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";
import { mainWamSettingsState, readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelompok · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Kelompok (agen E, docs/main-wam/KONTRAK.md §6): kelompok, and with
 * ?tab=kegiatan the kelompok kegiatan per session (?sesi= opens one). Any Admin WAM admin.
 */
export default async function KelompokAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; sesi?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { tab, sesi } = await searchParams;
  const [settings, people] = await Promise.all([mainWamSettingsState().catch(() => readMainWamSettings()), adminPeople()]);
  if (tab === "kegiatan") {
    const [groups, sessions] = await Promise.all([adminActivityGroups(), adminSessions({ usage: false })]);
    return <WamAdminFrame current="mw-kelompok">
      <ActivityGroupsEditor initial={groups.data} migrated={groups.migrated && settings.migrated} sessions={sessions.data} people={people} dates={eventDates(settings.event)}
        firstSession={sesi ?? null} crumbs={wamCrumbs("mw-kelompok", "Kelompok kegiatan")} title="Main WAM · Kelompok" />
    </WamAdminFrame>;
  }
  const groups = await adminGroups();
  return <WamAdminFrame current="mw-kelompok">
    <GroupsEditor initial={groups.data} migrated={groups.migrated && settings.migrated} people={people} published={settings.groupsPublished}
      crumbs={wamCrumbs("mw-kelompok")} title="Main WAM · Kelompok" />
  </WamAdminFrame>;
}
