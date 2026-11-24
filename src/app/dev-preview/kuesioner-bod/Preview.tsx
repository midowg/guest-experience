"use client";

import { BodSurveyScreen } from "@/components/pra-wam/bod-survey/BodSurvey";
import { SAMPLE_BOD_SURVEY, sampleBodClient } from "@/components/pra-wam/bod-survey/sample";

/** The screen with made-up data and a stand-in server. */
export function Preview({ tab, person, exporting }: { tab: "ringkasan" | "orang" | "departemen"; person: string | null; exporting: boolean }) {
  return <BodSurveyScreen data={SAMPLE_BOD_SURVEY} client={sampleBodClient} initialTab={tab} initialPerson={person} initialExport={exporting} />;
}
