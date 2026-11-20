import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { RundownEditor } from "@/components/admin/wam-acara/isi/RundownEditor";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { eventDates, wibDate } from "@/lib/main-wam/rundown";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { adminSessions } from "@/lib/server/main-wam/admin/sessions";
import { listGuides, rundownLogReal as rundownLog } from "@/lib/server/main-wam/read";
import { mainWamSettingsState, readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Rundown · ${WAM_EVENT_ADMIN_LABEL}` };

/**
 * Admin WAM 2027 → Rundown (agen E, docs/main-wam/KONTRAK.md §6): any Admin WAM 2027 admin.
 * Before the migration the page says so and nothing can be saved.
 */
export default async function RundownAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, sessions, guides, log, people] = await Promise.all([
    mainWamSettingsState().catch(() => readMainWamSettings()),
    adminSessions(),
    listGuides(true).catch(() => ({ data: [], migrated: false })),
    rundownLog(undefined, 300).catch(() => ({ data: [], migrated: false })),
    adminPeople(),
  ]);
  return <WamAcaraFrame current="isi">
    <RundownEditor initial={sessions.data} migrated={sessions.migrated && settings.migrated} dates={eventDates(settings.event)} people={people}
      guides={guides.data.map(guide => ({ id: guide.id, title: guide.title, kind: guide.kind }))} log={log.data} today={wibDate(new Date().toISOString())}
      crumbs={wamAcaraCrumbs("isi", "Rundown")} title="Rundown" />
  </WamAcaraFrame>;
}
