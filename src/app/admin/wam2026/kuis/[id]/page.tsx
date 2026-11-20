import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { QuizEditor } from "@/components/admin/wam-acara/kuis/QuizEditor";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { mainWamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminQuiz } from "@/lib/server/main-wam/kuis/admin";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Kuis · ${WAM_EVENT_ADMIN_LABEL}` };

/** One quiz: questions, pengendali, the big screen's link, games and results with names. */
export default async function KuisAdminQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  const [quiz, settings] = await Promise.all([adminQuiz(id).catch(() => null), mainWamSettingsState()]);
  if (!quiz) notFound();
  return <WamAcaraFrame current="kuis">
    <PageHeader crumbs={wamAcaraCrumbs("kuis", { label: "Kuis live", href: mainWamAdminPath.quizzes }, quiz.quiz.title)} title={quiz.quiz.title} subtitle="Soal, pengendali, layar besar, permainan, dan hasil." />
    <PageTabs tabs={mainWamModuleTabs} current="kuis" label="Modul acara" />
    <QuizEditor initial={quiz} moduleOn={settings.modules.kuis} />
  </WamAcaraFrame>;
}
