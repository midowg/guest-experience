import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrDataScreen, type HrScreenData } from "@/components/admin/wam/questionnaire/HrData";
import { QuestionnaireFrame } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrAccessLog, hrPageState, hrPeople } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data HR · Kuesioner · Admin WAM", robots: { index: false, follow: false } };

/**
 * Any admin, then the WAM email of someone on the HR access list: the questionnaire's `hr` and
 * `hronly` answers per person, every read logged under that person. The
 * people list and the log are rendered only after the server verified this browser's HR unlock;
 * locked, the page holds no HR data at all. One person's answers come from the API (logged).
 */
export default async function WamHrDataPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const state = await hrPageState();
  let data: HrScreenData = null;
  if (state.unlocked) {
    const [people, log] = await Promise.all([hrPeople(state.unlocked), hrAccessLog(state.unlocked)]);
    data = { ...people, log };
  }
  return <QuestionnaireFrame current="data-hr" wide>
    <div className="stack">
      <h2 className="sr-only">Data HR</h2>
      {/* The key gives the screen fresh state whenever the lock opens or closes. */}
      <HrDataScreen key={state.unlocked?.expiresAt ?? "terkunci"} data={data} state={{
        migrated: state.migrated, accessReady: state.accessReady, hasAccess: state.hasAccess,
        unlockedUntil: data ? state.unlocked?.expiresAt ?? null : null, actorName: data ? state.unlocked?.actor.name ?? null : null,
        lockedUntil: state.lockedUntil, attemptsLeft: state.attemptsLeft, renderedAt: state.checkedAt,
      }} />
    </div>
  </QuestionnaireFrame>;
}
