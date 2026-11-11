import { answerLevel, type AnswerValue, type QQuestion, type Visibility } from "./questionnaire";

/*
 * "Kebutuhan peserta" for the panitia (Kelola acara): food, allergies, prayer, physical readiness,
 * what someone is not comfortable with, and shirt sizes, from the questionnaire. Who is named
 * follows each answer's own level (answerLevel): `rekan` and `fasil` answers by name; an `hr`
 * choice only as a number and an `hr` text not at all (its count only); `hronly` (health) never.
 * Pure, so the rules can be tested.
 */

/** The blocks of the page, by fixed question key, in order. A key the form lacks is left out. */
export const NEED_BLOCKS = [
  { key: "14", title: "Makanan", purpose: "Untuk panitia konsumsi." },
  { key: "14c", title: "Alergi dan makanan yang dihindari", purpose: "Untuk panitia konsumsi." },
  { key: "14b", title: "Fobia dan hal yang perlu dijauhkan", purpose: "Untuk panitia acara." },
  { key: "14d", title: "Kebutuhan khusus", purpose: "Untuk menyusun kegiatan dan memilih ruang." },
  { key: "15", title: "Ibadah", purpose: "Untuk menyiapkan waktu dan tempat ibadah." },
  { key: "35", title: "Kesiapan aktivitas fisik", purpose: "Untuk keamanan kegiatan." },
  { key: "36", title: "Aktivitas yang membuat tidak nyaman", purpose: "Untuk keamanan kegiatan." },
  { key: "38", title: "Ukuran kaos", purpose: "Untuk merchandise." },
] as const;

export type NeedPerson = { id: string; name: string; department: string };
export type NeedGroup = { label: string; people: NeedPerson[]; /** Answered under the HR label: counted, not named. */ unnamed: number; /** "Tidak ada": a number only. */ countOnly: boolean };
export type NeedEntry = { person: NeedPerson; text: string };
export type NeedBlock = {
  key: string; title: string; purpose: string; prompt: string;
  /** Choices with the people who picked them. */
  groups: NeedGroup[];
  /** Written answers by name. */
  entries: NeedEntry[];
  /** Written answers only HR reads (given under the HR label, or an HR question). */
  hrOnly: number;
  /** The question itself is HR: its people are never named here. */
  hrQuestion: boolean;
};

const named = (level: Visibility) => level === "rekan" || level === "fasil";
const nothing = (label: string) => /^tidak ada\b/i.test(label);

/**
 * One block from one question's answers. `rows` hold each person's answer and the level it was
 * given under; `people` names the active employees (others are left out).
 */
export function needBlock(
  block: { key: string; title: string; purpose: string }, question: QQuestion,
  rows: { employeeId: string; value: AnswerValue; readLevel?: string | null }[], people: Map<string, NeedPerson>,
): NeedBlock | null {
  const base: NeedBlock = { key: block.key, title: block.title, purpose: block.purpose, prompt: question.prompt, groups: [], entries: [], hrOnly: 0, hrQuestion: question.visibility === "hr" };
  if (question.visibility === "hronly") return null;
  const choices = question.kind === "single" || question.kind === "multi";
  const groups = new Map<string, NeedGroup>((choices ? question.options : []).map(label => [label, { label, people: [], unnamed: 0, countOnly: nothing(label) }]));
  for (const row of rows) {
    const person = people.get(row.employeeId);
    if (!person) continue;
    const level = answerLevel(question.visibility, row.readLevel);
    if (level === "hronly") continue;
    if (choices) {
      const picked = Array.isArray(row.value) ? row.value : typeof row.value === "string" && row.value ? [row.value] : [];
      for (const label of new Set(picked)) {
        const group = groups.get(label) ?? { label, people: [], unnamed: 0, countOnly: nothing(label) };
        groups.set(label, group);
        if (named(level)) group.people.push(person); else group.unnamed++;
      }
    } else if (typeof row.value === "string" && row.value.trim()) {
      if (named(level)) base.entries.push({ person, text: row.value.trim() }); else base.hrOnly++;
    }
  }
  const byName = (a: NeedPerson, b: NeedPerson) => a.name.localeCompare(b.name, "id");
  base.groups = [...groups.values()].map(group => ({ ...group, people: group.countOnly ? [] : group.people.sort(byName), unnamed: group.countOnly ? group.unnamed + group.people.length : group.unnamed }));
  // "Tidak ada" holds only a number: who needs nothing is not news for the panitia.
  base.entries.sort((a, b) => byName(a.person, b.person));
  return base;
}

/** How many people a group stands for. */
export const groupSize = (group: NeedGroup) => group.people.length + group.unnamed;
