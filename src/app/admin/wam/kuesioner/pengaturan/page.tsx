import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAccessSettings } from "@/components/admin/wam/questionnaire/HrAccessSettings";
import { QuestionnaireSettings } from "@/components/admin/wam/questionnaire/QuestionnaireSettings";
import { QuestionnaireFrame, questionnaireContent } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { QuestionnaireWaiting } from "@/components/admin/wam/questionnaire/QuestionnaireWaiting";
import { StayPurge } from "@/components/admin/wam/questionnaire/StayPurge";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrAccessSettings } from "@/lib/server/pra-wam/hr-lock";
import { purgeIfDue, purgeStatus } from "@/lib/server/pra-wam/purge";
import { audienceReady, peopleOptions } from "@/lib/server/pra-wam/questionnaire";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan kuesioner · Admin WAM" };

/** Any admin: the questionnaire's name, address, status, who it is for, texts, dates, and who has Data HR access (the super admin changes it). */
export default async function QuestionnaireSettingsPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  // Run a due deletion first, so the status below already shows its result.
  await purgeIfDue();
  const content = await questionnaireContent();
  const purge = content ? await purgeStatus(content.form).catch(() => null) : null;
  // Only the super admin gets the picker's list of people.
  const access = content ? await hrAccessSettings({ withCandidates: role === "super" }) : null;
  // Untuk siapa: the active people to choose from, and whether the audience columns exist yet.
  const [people, ready] = content ? await Promise.all([peopleOptions().catch(() => []), audienceReady()]) : [[], false];
  return <QuestionnaireFrame current="pengaturan">
    {content
      ? <div className="stack">
        <QuestionnaireSettings initial={content.form} people={people} audienceReady={ready} />
        {purge && <StayPurge status={purge} />}
        {access && <HrAccessSettings initial={access} canEdit={role === "super"} />}
      </div>
      : <QuestionnaireWaiting />}
  </QuestionnaireFrame>;
}
