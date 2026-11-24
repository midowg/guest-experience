/*
 * Data kuesioner untuk BoD (prototipe 24 Nov 2026): what the BoD card and the BoD questionnaire
 * screen show. One open questionnaire: who finished it, each question summed up, each person's
 * answers, per department, and an export. Anonymous answers are only ever summed up, never named.
 */

/** Who an answer was given for, as the person saw it next to the question. */
export type SurveyLevel = "rekan" | "fasil" | "hr" | "hronly" | "anon";
export type FillState = "selesai" | "mengisi" | "belum";

export type SurveyQuestion = { key: string; number: number; prompt: string; sectionId: string; level: SurveyLevel; answered: number } & (
  | { kind: "pilihan"; multi: boolean; options: { label: string; count: number }[] }
  | { kind: "skala"; low: string; high: string; counts: number[] }
  | { kind: "teks"; samples: string[] }
);

export type SurveyAnswer = { prompt: string; answer: string; level: SurveyLevel };
export type SurveyPerson = {
  id: string; name: string; department: string; state: FillState; sectionsDone: number; sectionsTotal: number;
  lastActivity: string | null;
  /** Named answers by section; the anonymous section is never here. */
  sections: { title: string; answers: SurveyAnswer[] }[];
};

export type SurveyData = {
  formName: string; updatedAt: string; closesAt: string | null;
  sections: { id: string; title: string; anonymous?: boolean }[];
  questions: SurveyQuestion[];
  people: SurveyPerson[];
};

export const levelLabels: Record<SurveyLevel, string> = {
  rekan: "Rekan", fasil: "Panitia", hr: "HR", hronly: "Rahasia", anon: "Anonim",
};

export const countStates = (people: readonly Pick<SurveyPerson, "state">[]) => ({
  selesai: people.filter(person => person.state === "selesai").length,
  mengisi: people.filter(person => person.state === "mengisi").length,
  belum: people.filter(person => person.state === "belum").length,
});

/** Done out of everyone, per department, most done first. */
export function byDepartment(people: readonly Pick<SurveyPerson, "department" | "state">[]) {
  const groups = new Map<string, { name: string; done: number; started: number; total: number }>();
  for (const person of people) {
    const group = groups.get(person.department) ?? { name: person.department, done: 0, started: 0, total: 0 };
    group.total += 1;
    if (person.state === "selesai") group.done += 1;
    if (person.state === "mengisi") group.started += 1;
    groups.set(person.department, group);
  }
  return [...groups.values()].sort((a, b) => b.done / b.total - a.done / a.total || a.name.localeCompare(b.name));
}

export const percent = (value: number, of: number) => of ? Math.round((value / of) * 100) : 0;
