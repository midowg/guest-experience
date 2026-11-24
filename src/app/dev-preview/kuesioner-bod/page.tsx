import { notFound } from "next/navigation";
import { BodSurveyCard } from "@/components/pra-wam/bod-survey/BodSurveyCard";
import { SAMPLE_BOD_SURVEY } from "@/components/pra-wam/bod-survey/sample";
import { WamFrame } from "@/components/pra-wam/WamFrame";
import { Preview } from "./Preview";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

/**
 * Data kuesioner untuk BoD (24 Nov 2026) with made-up data, inside the app's frame with the BoD
 * menu. ?layar=kartu: the card alone (on Ringkasan it sits under Jejak karbon, see /dev-preview/bod?bingkai=1);
 * otherwise the screen. &tab=orang|departemen, &orang=<id> (a person's sheet), &export=1, &tema=terang.
 */
export default async function DevBodSurveyPage({ searchParams }: { searchParams: Search }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, tab, orang, export: exporting, tema } = await searchParams;
  const href = "/dev-preview/kuesioner-bod";
  const { counts } = SAMPLE_BOD_SURVEY;
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <WamFrame member={{ id: "dev-bod", name: "Bima Contoh", nickname: "Bima", department: "BOD", roles: ["bod"], photo: null }} unread={0} waiting={0} phaseLabel="Pra WAM">
      {layar === "kartu"
        ? <div style={{ maxWidth: 640, margin: "0 auto" }}><BodSurveyCard name={SAMPLE_BOD_SURVEY.formName} done={counts.selesai} active={counts.selesai + counts.sedang + counts.belum} href={href} exportHref={`${href}?export=1`} /></div>
        : <Preview tab={tab === "orang" || tab === "departemen" ? tab : "ringkasan"} person={orang ?? null} exporting={exporting === "1"} />}
    </WamFrame>
  </div>;
}
