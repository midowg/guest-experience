import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { QuizList } from "@/components/admin/wam/main-wam/kuis/QuizList";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuizzes } from "@/lib/server/main-wam/kuis/admin";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kuis live · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Kuis live: the quizzes (docs/rancangan-kuis-wam.md §8a). */
export default async function KuisAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ quizzes, migrated }, settings] = await Promise.all([adminQuizzes(), mainWamSettingsState()]);
  return <WamAdminFrame current="mw-kuis">
    <PageHeader crumbs={wamCrumbs("mw-kuis")} title="Main WAM · Kuis live" subtitle="Kuis pilihan ganda bersama: soal di layar besar dan HP, peserta menjawab sebagai tokohnya, juara dibuka di podium." />
    <PageTabs tabs={mainWamModuleTabs} current="kuis" label="Modul acara" />
    <QuizList initial={quizzes} migrated={migrated} moduleOn={settings.modules.kuis} />
  </WamAdminFrame>;
}
