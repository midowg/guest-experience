import { notFound } from "next/navigation";
import { BodSurveyCard, BodSurveyScreen } from "@/components/pra-wam/bod-survey/BodSurvey";
import { SAMPLE_SURVEY } from "@/components/pra-wam/bod-survey/sample";
import { WamFrame } from "@/components/pra-wam/WamFrame";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

/**
 * Prototipe data kuesioner untuk BoD (24 Nov 2026), inside the app's frame with the BoD menu.
 * ?layar=kartu: the card on Ringkasan; otherwise the screen. &tab=orang|departemen, &orang=p0
 * (a person's sheet), &export=1 (the Export sheet), &tema=terang.
 */
export default async function DevBodSurveyPage({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, tab, orang, export: exporting, tema } = await searchParams;
  const href = "/dev-preview/kuesioner-bod";
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <WamFrame member={{ id: "dev-bod", name: "Bima Contoh", nickname: "Bima", department: "BOD", roles: ["bod"], photo: null }} unread={0} waiting={0} phaseLabel="Pra WAM">
      {layar === "kartu"
        ? <div style={{ display: "grid", gap: 16, maxWidth: 640, margin: "0 auto" }}><BodSurveyCard data={SAMPLE_SURVEY} href={href} exportHref={`${href}?export=1`} /></div>
        : <BodSurveyScreen data={SAMPLE_SURVEY} initialTab={tab === "orang" || tab === "departemen" ? tab : "ringkasan"} initialPerson={orang ?? null} initialExport={exporting === "1"} />}
    </WamFrame>
  </div>;
}
