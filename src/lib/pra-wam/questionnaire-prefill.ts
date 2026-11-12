import type { JobPost } from "@/lib/employees";
import { genderLabels } from "./call-name";
import { answered, type Answers, type QQuestion } from "./questionnaire";

/*
 * Answers that come from Data karyawan (11 Nov 2026, owner's decision): the name, department,
 * position, phone and gender are already known, so the questionnaire shows them filled in and the
 * person checks or changes them. They are saved only when the person moves on from the card. A
 * question someone already answered keeps their answer. Pure, so it can be tested.
 */

/** The fixed keys of the questions Data karyawan can answer. */
export const PREFILL_KEYS = { name: "1", department: "2", position: "3", phone: "5", gender: "33" } as const;

/** Data karyawan's posts as the position question's options (migration 202611110004). */
export const postAnswers: Record<JobPost, string> = { staf: "Staf", lead: "Lead", hod: "HOD", gm: "GM" };
const rank: Record<JobPost, number> = { staf: 0, lead: 1, hod: 2, gm: 3 };
/**
 * What each post may be called in the position question's options: HR may rename them in Admin WAM
 * (12 Nov 2026 the options read "Staff", "Leader", "HOD", " GM"), and the post still fills in.
 */
const postNames: Record<JobPost, string[]> = {
  staf: ["staf", "staff"], lead: ["lead", "leader", "team lead", "team leader", "supervisor", "supervisor / lead"],
  hod: ["hod", "head of department", "kepala departemen"], gm: ["gm", "general manager"],
};
const plain = (text: string) => text.trim().toLocaleLowerCase("id").replace(/\s+/g, " ");
/** The option of the position question that is this post, as HR wrote it; null when none is. */
export const postOption = (options: readonly string[], post: JobPost): string | null => options.find(option => postNames[post].includes(plain(option))) ?? null;

/** The highest post among a person's jobs (a Staf who also leads a team is a Lead); null without jobs. */
export const highestPost = (posts: JobPost[]): JobPost | null =>
  posts.length ? posts.reduce((best, post) => (rank[post] > rank[best] ? post : best)) : null;

export type PrefillPerson = {
  fullName: string; nickname: string; phone: string; gender: string; department: string;
  /** Null when the position should not be guessed (no jobs yet, or BOD, which no option fits). */
  post: JobPost | null;
};

/** "SATU DUA" (an HR sheet in capitals) as "Satu Dua"; a name already in mixed case stays as written. */
export function tidyName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean !== clean.toUpperCase()) return clean;
  return clean.toLocaleLowerCase("id").replace(/(^|[\s'-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase("id"));
}

/** "Dewi Lestari (Dewi)", as the name question asks; just the name when the nickname is the same or missing. */
export function nameAnswer(fullName: string, nickname: string): string {
  const full = tidyName(fullName);
  const call = tidyName(nickname);
  return call && call.toLocaleLowerCase("id") !== full.toLocaleLowerCase("id") ? `${full} (${call})` : full;
}

/**
 * What Data karyawan fills in for this person: only questions that are shown, not answered yet,
 * and whose kind and options still fit (HR may have changed them), so a prefilled answer is always
 * one the server accepts.
 */
export function prefillAnswers(questions: QQuestion[], answers: Answers, person: PrefillPerson, departments: string[]): Answers {
  const out: Answers = {};
  const at = (key: string) => questions.find(question => question.key === key && !answered(answers[key]));
  const name = at(PREFILL_KEYS.name);
  const fullName = person.fullName.trim();
  if (name?.kind === "text" && fullName) out[name.key] = nameAnswer(fullName, person.nickname).slice(0, 300);
  const department = at(PREFILL_KEYS.department);
  if (department?.kind === "department" && departments.includes(person.department.trim())) out[department.key] = person.department.trim();
  const position = at(PREFILL_KEYS.position);
  const post = position?.kind === "single" && person.post ? postOption(position.options, person.post) : null;
  if (position && post) out[position.key] = post;
  const phone = at(PREFILL_KEYS.phone);
  if (phone?.kind === "text" && person.phone.trim()) out[phone.key] = person.phone.trim().slice(0, 300);
  const gender = at(PREFILL_KEYS.gender);
  const genderLabel = person.gender === "L" || person.gender === "P" ? genderLabels[person.gender] : "";
  if (gender?.kind === "single" && genderLabel && gender.options.includes(genderLabel)) out[gender.key] = genderLabel;
  return out;
}
