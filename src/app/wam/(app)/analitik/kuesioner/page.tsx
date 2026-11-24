import { notFound } from "next/navigation";
import { BodSurveyScreen } from "@/components/pra-wam/bod-survey/BodSurvey";
import { Notice } from "@/components/ui";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { bodSurvey } from "@/lib/server/pra-wam/bod-survey";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data kuesioner · WAM", robots: { index: false } };

/** Data kuesioner for BoD (24 Nov 2026): from the card on Ringkasan and from Analitik. ?export=1 opens Export. */
export default async function BodSurveyPage({ searchParams }: { searchParams: Promise<{ export?: string }> }) {
  const member = await requireMemberPage(praWamPath.bodSurvey);
  if (!member.roles.includes("bod") && !member.roles.includes("admin")) notFound();
  const data = await bodSurvey(member).catch((error: unknown) => { if (error instanceof ServiceError) return error.message; throw error; });
  if (typeof data === "string") return <Notice tone="info">{data}</Notice>;
  return <BodSurveyScreen data={data} initialExport={(await searchParams).export === "1"} />;
}
