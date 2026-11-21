import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { QuizEditor } from "@/components/admin/wam/main-wam/kuis/QuizEditor";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { mainWamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuiz } from "@/lib/server/main-wam/kuis/admin";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kuis · Main WAM · Admin WAM" };

/** One quiz: questions, pengendali, the big screen's link, games and results with names. */
export default async function KuisAdminQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  const [quiz, settings] = await Promise.all([adminQuiz(id).catch(() => null), mainWamSettingsState()]);
  if (!quiz) notFound();
  return <WamAdminFrame current="mw-kuis">
    <PageHeader crumbs={wamCrumbs("mw-kuis", { label: "Kuis live", href: mainWamAdminPath.quizzes }, quiz.quiz.title)} title={quiz.quiz.title} subtitle="Soal, pengendali, layar besar, permainan, dan hasil." />
    <PageTabs tabs={mainWamModuleTabs} current="kuis" label="Modul acara" />
    <QuizEditor initial={quiz} moduleOn={settings.modules.kuis} />
  </WamAdminFrame>;
}
