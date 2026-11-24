import { notFound } from "next/navigation";
import { BodSummary } from "@/components/pra-wam/BodSummary";
import { Notice } from "@/components/ui";
import { greeting } from "@/lib/pra-wam/bod";
import { seesAllSessions } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { bodInsights } from "@/lib/server/pra-wam/bod-insights";
import { bodSummary } from "@/lib/server/pra-wam/dashboard";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { participationOf } from "@/lib/server/pra-wam/recap";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import { viewerZone } from "@/lib/server/pra-wam/zone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analitik · WAM", robots: { index: false } };

const longDate = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(now);

/** The open questionnaire's participation; null before it opens, and never in the way of the page. */
async function questionnaireSurvey() {
  const form = await currentForm().catch(() => null);
  if (!form || form.status === "draf") return null;
  const participation = await participationOf(form).catch(() => null);
  return participation ? { name: form.name, participation } : null;
}

/**
 * Analitik for BOD (24 Nov 2026, its own menu): every figure and chart that used to fill Ringkasan
 * (attendance per forum and department, rooms, app use, check-in ways, agenda, requests, survey,
 * announcements, documents, business units), so Ringkasan keeps only what matters. Read only.
 */
export default async function AnalyticsPage() {
  const member = await requireMemberPage(praWamPath.analytics);
  if (!seesAllSessions(member)) notFound();
  const now = new Date();
  const [summary, insights, survey, zone] = await Promise.all([bodSummary(member, now), bodInsights(member, now), questionnaireSurvey(), viewerZone()]);
  return <>
    {!summary.migrated && <Notice tone="warning">Sesi menunggu migrasi 202611040004_pra_wam_sessions.sql.</Notice>}
    <BodSummary view="analitik" zone={zone} data={summary} greeting={greeting(now)} date={longDate(now)} insights={insights} survey={survey} />
  </>;
}
