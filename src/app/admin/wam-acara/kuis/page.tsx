import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { QuizList } from "@/components/admin/wam-acara/kuis/QuizList";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuizzes } from "@/lib/server/main-wam/kuis/admin";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Kuis live · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2027 → Kuis live: the quizzes (docs/rancangan-kuis-wam.md §8a). */
export default async function KuisAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ quizzes, migrated }, settings] = await Promise.all([adminQuizzes(), mainWamSettingsState()]);
  return <WamAcaraFrame current="kuis">
    <PageHeader crumbs={wamAcaraCrumbs("kuis")} title="Kuis live" subtitle="Kuis pilihan ganda bersama: soal di layar besar dan HP, peserta menjawab sebagai tokohnya, juara dibuka di podium." />
    <PageTabs tabs={mainWamModuleTabs} current="kuis" label="Modul acara" />
    <QuizList initial={quizzes} migrated={migrated} moduleOn={settings.modules.kuis} />
  </WamAcaraFrame>;
}
