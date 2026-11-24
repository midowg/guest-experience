import type { Visibility } from "./questionnaire";
import type { RecapItem } from "./recap";

/*
 * Data kuesioner untuk BoD (24 Nov 2026): what the screen and the card get. See
 * src/lib/server/pra-wam/bod-survey.ts for who reads what.
 */

export type FillState = "belum" | "sedang" | "selesai";
export type BodSurveyPerson = {
  employeeId: string; name: string; department: string; state: FillState;
  sectionsDone: number; sectionsTotal: number; lastActivity: string | null;
};
export type BodSurvey = {
  formName: string; editUntil: string | null;
  counts: Record<FillState, number>;
  people: BodSurveyPerson[];
  departments: { name: string; counts: Record<FillState, number>; total: number }[];
  sections: { key: string; title: string; anonymous: boolean; items: RecapItem[] }[];
};
export type BodPersonAnswers = {
  name: string; department: string;
  sections: { title: string; answers: { prompt: string; answer: string; level: Visibility }[] }[];
};

/** Who an answer is for, as the person saw it, in a word for a badge. */
export const levelBadge: Record<Visibility, string> = {
  rekan: "Rekan", fasil: "Panitia", hr: "HR", hronly: "Rahasia", pilih: "Pilihan sendiri", anon: "Anonim",
};
export const fillLabels: Record<FillState, string> = { selesai: "Selesai", sedang: "Sedang mengisi", belum: "Belum mulai" };
export const percentOf = (value: number, of: number) => of ? Math.round((value / of) * 100) : 0;
