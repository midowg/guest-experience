import { z } from "zod";

/*
 * The personal questionnaire (migration 202611040011), the parts the app, the admin and the server
 * share: its shape, its address rules, who reads which answer, when a question shows, what a valid
 * answer is, and how far someone is. Pure logic, so it can be tested.
 */

export const questionKinds = ["text", "long", "single", "multi", "consent", "matrix", "department", "person"] as const;
export type QuestionKind = (typeof questionKinds)[number];
export const visibilities = ["rekan", "fasil", "hr", "hronly", "pilih", "anon"] as const;
export type Visibility = (typeof visibilities)[number];
export const formStatuses = ["draf", "buka", "tutup"] as const;
export type FormStatus = (typeof formStatuses)[number];

export type ShowIf = { question: string; any?: string[]; not?: string[] };

export type QForm = {
  id: string; name: string; slug: string; oldSlugs: string[]; status: FormStatus; intro: string; cardText: string;
  minutes: number; editUntil: string | null; stayDeleteOn: string | null;
  /** Who may open Data HR with their own WAM account (employee ids); empty before migration 202611040012. */
  hrAccess: string[];
  /** Who it is for: everyone ("semua"), or only `audienceIds` ("pilih"). "semua" before migration 202611110001. */
  audience: Audience;
  audienceIds: string[];
};
export const audiences = ["semua", "pilih"] as const;
export type Audience = (typeof audiences)[number];
export const AUDIENCE_MIGRATION = "202611110001_wam_questionnaire_audience.sql";
export const AUDIENCE_MAX = 2000;

/** Whether the questionnaire is for this person: everyone's, or theirs when people are chosen. */
export const inAudience = (form: Pick<QForm, "audience" | "audienceIds">, employeeId: string): boolean =>
  form.audience === "semua" || form.audienceIds.includes(employeeId);

/**
 * Whether this person sees the questionnaire (its page, its answers, Kartu rekan): open or closed
 * and meant for them. `manages` (Admin WAM) sees it always, a draft too, to try it out.
 */
export const seesQuestionnaire = (form: Pick<QForm, "status" | "audience" | "audienceIds">, employeeId: string, manages: boolean): boolean =>
  manages || (form.status !== "draf" && inAudience(form, employeeId));

/** Who it is for, in a few words for the admin: "Semua peserta" or "12 orang terpilih". */
export const audienceLabel = (form: Pick<QForm, "audience" | "audienceIds">): string =>
  form.audience === "semua" ? "Semua peserta" : `${form.audienceIds.length} orang terpilih`;
export type QSection = { id: string; key: string; title: string; short: string; hello: string; intro: string; tease: string; anonymous: boolean; sort: number; hidden: boolean };
export type QQuestion = {
  id: string; sectionId: string; key: string; prompt: string; kind: QuestionKind; required: boolean; visibility: Visibility;
  options: string[]; maxChoices: number | null; matrixRows: string[]; scale: string[]; placeholder: string; note: string;
  react: string; showIf: ShowIf | null; sort: number; hidden: boolean;
};
export type QContent = { form: QForm; sections: QSection[]; questions: QQuestion[] };
/** Text, a choice, several choices, a consent tick, or one choice per matrix row. */
export type AnswerValue = string | string[] | boolean | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

/**
 * Who reads an answer, in the words people see next to the question. Since 11 Nov 2026 every Admin
 * WAM sees every named answer (Rekap), so the labels say so.
 */
export const visibilityLabels: Record<Visibility, string> = {
  rekan: "Rekan bisa lihat ini",
  fasil: "Panitia, HR, dan admin WAM",
  hr: "HR, manajemen, dan admin WAM",
  hronly: "Rahasia: HR dan admin WAM",
  pilih: "Kamu yang tentukan nanti",
  anon: "Anonim",
};
/** Answers only HR may open, with the separate HR password. */
export const hrOnly = (visibility: Visibility) => visibility === "hr" || visibility === "hronly";

/** How closed a level is; `pilih` sits with `fasil` (its own sharing question narrows it further). */
const readRank: Record<Visibility, number> = { rekan: 0, fasil: 1, pilih: 1, hr: 2, hronly: 3, anon: 4 };
/**
 * The level one answer is read at: the stricter of its question's level now and the level the
 * answer was given under (cq_answers.read_level, migration 202611050002; null before it). So a
 * question widened later never opens what people answered under the stricter label.
 */
export function answerLevel(question: Visibility, given: string | null | undefined): Visibility {
  const stamp = given && given in readRank ? (given as Visibility) : null;
  return stamp && readRank[stamp] > readRank[question] ? stamp : question;
}

/* ---- The address ---------------------------------------------------------------------------- */

/** Pages WAM already has under /wam; a questionnaire can never take these. */
export const reservedSlugs = [
  "about", "account", "agenda", "book", "check-in", "documents", "forgot-password", "login", "manage", "manifest.webmanifest",
  "new-password", "notifications", "reset-password", "sessions", "settings", "scan", "offline", "api", "admin", "sw.js",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "icon-maskable-512.png", "appraisal", "pra-wam", "rekan", "timeline",
];

/** "Cerita Kita 2026" → "cerita-kita-2026". */
export function slugFromName(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

/** Why an address cannot be used, or null. */
export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return "Alamat 3–40 karakter: huruf kecil, angka, dan tanda hubung, tidak diawali atau diakhiri tanda hubung.";
  if (slug.includes("--")) return "Alamat tidak boleh punya dua tanda hubung berurutan.";
  if (reservedSlugs.includes(slug)) return "Alamat ini sudah dipakai halaman WAM lain. Pilih alamat lain.";
  return null;
}

/* ---- Showing and answering ------------------------------------------------------------------ */

const asList = (value: AnswerValue | undefined): string[] => (Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []);

/*
 * "Lainnya" (12 Nov 2026): a choice whose text starts with "Lainnya" lets the person write their
 * own answer. It is kept as "Lainnya: <what they wrote>" (just "Lainnya" until they write), so the
 * Rekap and Excel read it as it is, and every rule that looks at the choice sees "Lainnya".
 */
export const OTHER_LIMIT = 200;
export const isOtherOption = (option: string) => /^lainnya\b/i.test(option.trim());
/** The choice an answer is: "Lainnya: badminton" is "Lainnya"; anything else is itself. */
export const baseChoice = (value: string) => value.match(/^(lainnya[^:]*): /i)?.[1] ?? value;
/** What was written after "Lainnya: ", or "". */
export const otherText = (value: string) => (baseChoice(value) === value ? "" : value.slice(baseChoice(value).length + 2));
/** "Lainnya" with what was written, or just "Lainnya". */
export const withOther = (option: string, text: string) => (text.trim() ? `${option}: ${text.replace(/\s+/g, " ").trimStart().slice(0, OTHER_LIMIT)}` : option);
/** Whether a given choice is one of the options, "Lainnya: …" included. */
function choiceAllowed(value: string, options: readonly string[]): boolean {
  if (options.includes(value)) return true;
  const base = baseChoice(value);
  return base !== value && isOtherOption(base) && options.includes(base) && otherText(value).length <= OTHER_LIMIT;
}

/** Whether a question shows, given the answers so far (its `show_if`). */
export function shows(question: Pick<QQuestion, "showIf" | "hidden">, answers: Answers): boolean {
  if (question.hidden) return false;
  const rule = question.showIf;
  if (!rule) return true;
  const given = asList(answers[rule.question]).map(baseChoice);
  if (!given.length) return false;
  if (rule.any && !rule.any.some(option => given.includes(option))) return false;
  if (rule.not && given.some(option => rule.not!.includes(option))) return false;
  return true;
}

/** Whether a value counts as an answer (an empty text or no choice does not). */
export function answered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

/**
 * Checks one answer against its question; returns the cleaned value or a reason in plain words.
 * `known` holds what a department or person answer may be (ids or names), when the kind needs it.
 */
export function cleanAnswer(question: QQuestion, raw: unknown, known: { departments?: string[]; people?: string[] } = {}): { value: AnswerValue } | { problem: string } {
  const text = z.string().max(question.kind === "long" ? 3000 : 300);
  switch (question.kind) {
    case "text": case "long": {
      const parsed = text.safeParse(raw);
      return parsed.success ? { value: parsed.data.trim() } : { problem: question.kind === "long" ? "Jawaban paling panjang 3.000 karakter." : "Jawaban paling panjang 300 karakter." };
    }
    case "consent":
      return typeof raw === "boolean" ? { value: raw } : { problem: "Centang untuk menyetujui." };
    case "single": case "department": {
      if (typeof raw !== "string") return { problem: "Pilih satu jawaban." };
      const allowed = question.kind === "department" ? known.departments : question.options;
      if (raw && allowed && !(question.kind === "single" ? choiceAllowed(raw, allowed) : allowed.includes(raw))) return { problem: "Pilihan ini tidak ada di daftar." };
      return { value: question.kind === "single" && baseChoice(raw) !== raw ? raw.trim() : raw };
    }
    case "multi": case "person": {
      if (!Array.isArray(raw) || raw.some(item => typeof item !== "string")) return { problem: "Pilih dari daftar." };
      const list = [...new Set(raw as string[])];
      const allowed = question.kind === "person" ? known.people : question.options;
      if (allowed && list.some(item => !(question.kind === "multi" ? choiceAllowed(item, allowed) : allowed.includes(item)))) return { problem: "Ada pilihan yang tidak ada di daftar." };
      if (question.maxChoices && list.length > question.maxChoices) return { problem: `Pilih paling banyak ${question.maxChoices}.` };
      return { value: list };
    }
    case "matrix": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { problem: "Isi setiap baris." };
      const value: Record<string, string> = {};
      for (const [row, choice] of Object.entries(raw as Record<string, unknown>)) {
        if (!question.matrixRows.includes(row) || typeof choice !== "string" || !question.scale.includes(choice)) return { problem: "Ada baris yang pilihannya tidak dikenal." };
        value[row] = choice;
      }
      return { value };
    }
  }
}

/** A required question is done only when every matrix row has a choice. */
export function complete(question: QQuestion, value: AnswerValue | undefined): boolean {
  if (!answered(value)) return false;
  if (question.kind === "matrix") return question.matrixRows.every(row => typeof value === "object" && !Array.isArray(value) && row in (value as Record<string, string>));
  if (question.kind === "consent") return value === true;
  return true;
}

/** The sections and questions someone actually sees, in order. */
export function visibleContent(content: Pick<QContent, "sections" | "questions">, answers: Answers) {
  return content.sections.filter(section => !section.hidden).sort((a, b) => a.sort - b.sort).map(section => ({
    section,
    questions: content.questions.filter(question => question.sectionId === section.id && shows(question, answers)).sort((a, b) => a.sort - b.sort),
  }));
}

export type Progress = { sectionsDone: number; sectionsTotal: number; requiredLeft: number; done: boolean };

/**
 * How far someone is. A section is done when its required, shown questions are answered; the
 * anonymous section counts as done once its receipt exists (its answers are not kept with them).
 */
export function progressOf(content: Pick<QContent, "sections" | "questions">, answers: Answers, anonymousSent: boolean): Progress {
  const parts = visibleContent(content, answers);
  let sectionsDone = 0, requiredLeft = 0;
  for (const { section, questions } of parts) {
    if (section.anonymous) { if (anonymousSent) sectionsDone++; else requiredLeft += questions.filter(question => question.required).length; continue; }
    const left = questions.filter(question => question.required && !complete(question, answers[question.key])).length;
    requiredLeft += left;
    if (!left) sectionsDone++;
  }
  return { sectionsDone, sectionsTotal: parts.length, requiredLeft, done: parts.length > 0 && sectionsDone === parts.length };
}

/** "Siapa yang boleh mengubah jawaban": open, and before the deadline if there is one. */
export function editable(form: Pick<QForm, "status" | "editUntil">, now = new Date()): boolean {
  return form.status === "buka" && (!form.editUntil || new Date(form.editUntil) > now);
}
