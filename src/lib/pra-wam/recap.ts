import { answered, baseChoice, type AnswerValue, type QQuestion, type QSection } from "./questionnaire";

/*
 * Rekap and Ekspor of the questionnaire, the parts that need no database: who may read which
 * question in a summary or a spreadsheet, and how a question's answers become a chart or a list of
 * quotes. A summary never names anyone. Pure, so the rules can be tested.
 *
 * - `rekan`, `fasil` and `pilih` answers: the admin reads them (they are panitia and facilitators).
 * - `hr`: counts of choices for any admin; open text, chosen people and every per-person value
 *   only once Data HR is open.
 * - `hronly`: only once Data HR is open.
 * - The anonymous section: only as a whole (its rows carry no person, so no department) and only
 *   from MIN_GROUP answers on, so a handful of answers cannot be traced back.
 * - A department view of `hr` counts also needs MIN_GROUP answers in that department.
 * - `pilih` (question 30 decides): a reader who is not a facilitator, BOD later, does not get the
 *   answers of people who chose "only the facilitator reads this".
 */

/** The fewest answers a summary may stand on where single people must not be guessed. */
export const MIN_GROUP = 5;

/** The three answers of the question that decides who reads a `pilih` section (question 30). */
export const SHARE_CHOICES = {
  named: "Dibagikan dengan namaku",
  unnamed: "Dibagikan tanpa nama",
  facilitator: "Hanya dibaca fasilitator",
} as const;
export type Share = keyof typeof SHARE_CHOICES;

export type Reader = {
  /** Data HR is open in this browser: every `hr` and `hronly` answer, open text and people included. */
  hrOpen: boolean;
  /** Reads `pilih` answers marked "only the facilitator" (panitia and admin; BOD not). */
  facilitator: boolean;
};
export const adminReader = (hrOpen: boolean): Reader => ({ hrOpen, facilitator: true });

const countable = new Set<QQuestion["kind"]>(["single", "multi", "consent", "matrix", "department"]);

/** How a reader may see a question in Rekap: in full, as counts only, or not at all (and why). */
export function recapAccess(question: Pick<QQuestion, "visibility" | "kind">, reader: Reader): "full" | "counts" | "needs-hr" {
  if (question.visibility === "hronly") return reader.hrOpen ? "full" : "needs-hr";
  if (question.visibility === "hr") return reader.hrOpen ? "full" : countable.has(question.kind) ? "counts" : "needs-hr";
  return "full";
}

/** Whether a question's per-person values may go in a spreadsheet for this reader. */
export const exportable = (question: Pick<QQuestion, "visibility">, reader: Reader) =>
  question.visibility === "anon" ? false : question.visibility === "hr" || question.visibility === "hronly" ? reader.hrOpen : true;

/**
 * The question of a section that decides how its `pilih` answers are shared: a single choice
 * holding the facilitator option. Null when the section has none.
 */
export function shareQuestion(questions: QQuestion[], sectionId: string): QQuestion | null {
  return questions.find(question => question.sectionId === sectionId && question.kind === "single" && question.options.includes(SHARE_CHOICES.facilitator)) ?? null;
}

/** What someone chose for their `pilih` answers; no answer counts as "without my name", the careful reading. */
export function shareOf(value: AnswerValue | undefined): Share {
  if (value === SHARE_CHOICES.named) return "named";
  if (value === SHARE_CHOICES.facilitator) return "facilitator";
  return "unnamed";
}

/* ---- One question's summary ------------------------------------------------------------------ */

export type Bar = { label: string; count: number };
export type RecapBody =
  | { type: "bars"; bars: Bar[]; /** Choices beyond the top ones (people), folded into one number. */ rest: number }
  | { type: "matrix"; scale: string[]; rows: { label: string; counts: number[] }[] }
  | { type: "quotes"; quotes: { text: string; count: number }[] }
  | { type: "needs-hr" }
  | { type: "few" }
  | { type: "none" };
export type RecapItem = {
  key: string; prompt: string; kind: QQuestion["kind"]; visibility: QQuestion["visibility"];
  /** People (or anonymous sends) with an answer. */
  answered: number;
  /** Whether more than one choice per person was allowed, so the bars add up to more than `answered`. */
  several: boolean;
  body: RecapBody;
};

const TOP_PEOPLE = 10;

/** A stable order that is not the order answers came in: quotes must not line up with a list of names or times. */
function scatter(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

const asList = (value: AnswerValue): string[] => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []);

/**
 * One question's answers as a chart or quotes. `values` holds one answer per person (or per
 * anonymous send); `names` turns person ids into names; `small` says the group is too small for
 * this question's level (see MIN_GROUP), which keeps the numbers back.
 */
export function summarize(question: QQuestion, values: AnswerValue[], { access, names, small }: { access: "full" | "counts" | "needs-hr"; names: Map<string, string>; small: boolean }): RecapItem {
  const given = values.filter(value => answered(value));
  const base = { key: question.key, prompt: question.prompt, kind: question.kind, visibility: question.visibility, answered: given.length, several: question.kind === "multi" || question.kind === "person" || question.kind === "department" && (question.maxChoices ?? 1) > 1 };
  if (access === "needs-hr") return { ...base, body: { type: "needs-hr" } };
  if (!given.length) return { ...base, body: { type: "none" } };
  if (small) return { ...base, body: { type: "few" } };

  switch (question.kind) {
    case "text": case "long": {
      const groups = new Map<string, { text: string; count: number }>();
      for (const value of given) {
        const text = String(value).trim().replace(/\s+/g, " ");
        const key = text.toLocaleLowerCase("id");
        const group = groups.get(key);
        if (group) group.count++; else groups.set(key, { text, count: 1 });
      }
      const quotes = [...groups.values()].sort((a, b) => b.count - a.count || scatter(a.text) - scatter(b.text));
      return { ...base, body: { type: "quotes", quotes } };
    }
    case "matrix": {
      const rows = question.matrixRows.map(label => ({ label, counts: question.scale.map(() => 0) }));
      for (const value of given) {
        if (typeof value !== "object" || Array.isArray(value)) continue;
        for (const row of rows) {
          const at = question.scale.indexOf((value as Record<string, string>)[row.label]);
          if (at >= 0) row.counts[at]++;
        }
      }
      return { ...base, body: { type: "matrix", scale: question.scale, rows } };
    }
    case "consent": {
      const yes = given.filter(value => value === true).length;
      return { ...base, body: { type: "bars", bars: [{ label: "Setuju", count: yes }], rest: 0 } };
    }
    default: {
      const counts = new Map<string, number>();
      // A written-in "Lainnya: …" counts as Lainnya (its text is in Rekap and Excel).
      for (const value of given) for (const item of new Set(asList(value).map(entry => question.kind === "person" ? entry : baseChoice(entry)))) counts.set(item, (counts.get(item) ?? 0) + 1);
      const label = (item: string) => (question.kind === "person" ? names.get(item) ?? "Tanpa nama" : item);
      if (question.kind === "single") {
        // In the question's own order (often a scale), zeros included; old choices no longer listed go last.
        const listed = question.options.map(option => ({ label: option, count: counts.get(option) ?? 0 }));
        const others = [...counts].filter(([item]) => !question.options.includes(item)).map(([item, count]) => ({ label: item, count })).sort((a, b) => b.count - a.count);
        return { ...base, body: { type: "bars", bars: [...listed, ...others], rest: 0 } };
      }
      const bars = [...counts].map(([item, count]) => ({ label: label(item), count }))
        .concat(question.kind === "multi" ? question.options.filter(option => !counts.has(option)).map(option => ({ label: option, count: 0 })) : [])
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "id"));
      if (question.kind !== "person" || bars.length <= TOP_PEOPLE) return { ...base, body: { type: "bars", bars, rest: 0 } };
      return { ...base, body: { type: "bars", bars: bars.slice(0, TOP_PEOPLE), rest: bars.length - TOP_PEOPLE } };
    }
  }
}

/** The sections Rekap and Ekspor go through: shown ones, in order. */
export const orderedSections = (sections: QSection[]) => sections.filter(section => !section.hidden).sort((a, b) => a.sort - b.sort);
/** A section's shown questions, in order. */
export const sectionQuestions = (questions: QQuestion[], sectionId: string) =>
  questions.filter(question => question.sectionId === sectionId && !question.hidden).sort((a, b) => a.sort - b.sort);
