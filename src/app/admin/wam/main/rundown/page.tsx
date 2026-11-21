import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { RundownEditor } from "@/components/admin/wam/main-wam/isi/RundownEditor";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { eventDates, wibDate } from "@/lib/main-wam/rundown";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { adminChecklists } from "@/lib/server/main-wam/admin/ceklis";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";
import { listGuides, rundownLogReal as rundownLog } from "@/lib/server/main-wam/read";
import { mainWamSettingsState, readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rundown · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Rundown (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM admin.
 * Before the migration the page says so and nothing can be saved.
 */
export default async function RundownAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, sessions, guides, log, people, checklists] = await Promise.all([
    mainWamSettingsState().catch(() => readMainWamSettings()),
    adminSessions(),
    listGuides(true).catch(() => ({ data: [], migrated: false })),
    rundownLog(undefined, 300).catch(() => ({ data: [], migrated: false })),
    adminPeople(),
    adminChecklists().catch(() => null),
  ]);
  return <WamAdminFrame current="mw-isi">
    <RundownEditor initial={sessions.data} migrated={sessions.migrated && settings.migrated} checklistReady={checklists !== null} dates={eventDates(settings.event)} people={people}
      guides={guides.data.map(guide => ({ id: guide.id, title: guide.title, kind: guide.kind }))} log={log.data} today={wibDate(new Date().toISOString())}
      crumbs={wamCrumbs("mw-isi", "Rundown")} title="Main WAM · Rundown" />
  </WamAdminFrame>;
}
