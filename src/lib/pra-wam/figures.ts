import type { Answers } from "./questionnaire";

/*
 * Kartu tokoh dunia (handoff "Cerita Kita WAM 2026", migration 202611130010): the card shows a toy
 * figure of a world figure. Pure, so it is tested without a server; the server draws with crypto
 * randomness and keeps the result.
 *   1. The persona: the 8 characters' score rules, as before (chooseCharacter in cards.ts).
 *   2. The figure, inside that persona: +2 for each of its hobbies chosen at 17, +2 for each of its
 *      activities chosen at 21, +1 when its energy is the answer at 20, +1 when its music genre is
 *      chosen at 37. Only figures with a place left (two people each) take part; when the persona
 *      has none left, every figure with a place does.
 *   3. A tie: a figure nobody has yet goes first, then a draw.
 *   4. The reason on the card: "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka
 *      olahraga & outdoor, paling menikmati kegiatan outdoor dan nyaman di kelompok kecil."
 * Only the answers to 17, 20, 21 and 37 are read here (34 and 35 through the persona); health,
 * HR-only and anonymous answers never.
 */

export const FIGURE_QUOTA = 2;
export const FIGURES_MIGRATION = "202611130010_wam_figures.sql";
/** The questions a figure is matched on, by their fixed keys. */
export const FIGURE_KEYS = { hobbies: "17", energy: "20", activities: "21", genre: "37" } as const;

export type Figure = {
  id: string; number: number; key: string; name: string; personaId: string; costume: string;
  hobbies: string[]; activities: string[]; energy: string; genre: string;
  indonesian: boolean; funny: boolean; quote: string | null; hidden: boolean;
  /** Where the app reads the picture, or null; `stored` says whether it is in storage. */
  image: string | null; stored: boolean;
};
export type Random = (n: number) => number;

/** The persona's background on the card, light to dark (the handoff's colours). */
export const personaColors: Record<string, [string, string]> = {
  garda: ["#C2303F", "#6E1023"], penyihir: ["#F3C744", "#C9800F"], siasat: ["#3A6FBF", "#1B2C66"], penjaga: ["#5BB37C", "#256B44"],
  pemantik: ["#E0408F", "#8E1A55"], pengintai: ["#56A3EE", "#1C5797"], penyembuh: ["#F2A38A", "#B9563F"], penghibur: ["#F08A3C", "#A9461A"],
};
export const colorsOf = (personaKey: string): [string, string] => personaColors[personaKey] ?? ["#3A6FBF", "#1B2C66"];

const activityPhrases: Record<string, string> = {
  "outdoor": "kegiatan outdoor", "games kompetitif": "games kompetitif", "diskusi": "diskusi", "kreatif / seni": "kegiatan kreatif",
  "musik / karaoke": "musik atau karaoke", "kuliner": "wisata kuliner", "santai tanpa agenda": "santai tanpa agenda",
};
const energyPhrases: Record<string, string> = {
  "kelompok besar": "hidup di keramaian", "kelompok kecil": "nyaman di kelompok kecil", "ngobrol berdua": "paling nyambung saat ngobrol berdua",
  "tergantung, tapi butuh waktu sendiri buat recharge": "butuh waktu sendiri buat recharge",
};

/** Options compared loosely: HR may have changed a space or a capital ("Dangdut/ Koplo"). */
const plain = (text: string) => text.toLocaleLowerCase("id").replace(/\s+/g, "").replace(/^lainnya:.*/, "");
const listOf = (value: Answers[string] | undefined): string[] => (Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []);
const has = (answer: Answers[string] | undefined, option: string) => !!option && listOf(answer).some(given => plain(given) === plain(option));
const phrase = (map: Record<string, string>, option: string) => map[option.toLocaleLowerCase("id").replace(/\s+/g, " ").trim()] ?? option.toLocaleLowerCase("id");

/** A figure's score for these answers, and what matched, in words for the reason. */
export function figureScore(figure: Pick<Figure, "hobbies" | "activities" | "energy" | "genre">, answers: Answers): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  for (const hobby of figure.hobbies) if (has(answers[FIGURE_KEYS.hobbies], hobby)) { score += 2; why.push(`suka ${hobby.toLocaleLowerCase("id")}`); }
  for (const activity of figure.activities) if (has(answers[FIGURE_KEYS.activities], activity)) { score += 2; why.push(`paling menikmati ${phrase(activityPhrases, activity)}`); }
  if (figure.energy && has(answers[FIGURE_KEYS.energy], figure.energy)) { score += 1; why.push(phrase(energyPhrases, figure.energy)); }
  if (figure.genre && has(answers[FIGURE_KEYS.genre], figure.genre)) { score += 1; why.push(`suka musik ${figure.genre.toLocaleLowerCase("id")}`); }
  return { score, why };
}

/**
 * The figure for someone of this persona. `used` counts the people who have each figure (by id).
 * Null only when every figure is taken twice.
 */
export function pickFigure(personaId: string, figures: readonly Figure[], answers: Answers, used: Record<string, number>, pick: Random): { figure: Figure; score: number; why: string[]; tied: string[] } | null {
  const open = figures.filter(figure => !figure.hidden && (used[figure.id] ?? 0) < FIGURE_QUOTA);
  const own = open.filter(figure => figure.personaId === personaId);
  const pool = own.length ? own : open;
  if (!pool.length) return null;
  const scored = pool.map(figure => ({ figure, ...figureScore(figure, answers) }));
  const best = Math.max(...scored.map(item => item.score));
  let top = scored.filter(item => item.score === best);
  const free = top.filter(item => !used[item.figure.id]);
  if (free.length) top = free;
  const chosen = top[pick(top.length)];
  return { ...chosen, tied: top.map(item => item.figure.key) };
}

/** "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka …, … dan …." */
export function reasonText(personaClass: string, figureName: string, why: readonly string[]): string {
  const parts = [`kamu tipe ${personaClass}`, ...why];
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} dan ${parts[parts.length - 1]}` : parts[0];
  return `Kamu dapat ${figureName} karena ${joined}.`.slice(0, 400);
}

/** Which figure a picked file is for: its key ("ki-hajar-dewantara.png") or its number ("tokoh-01.webp"). */
export function figureOfFile<T extends Pick<Figure, "key" | "number">>(name: string, figures: readonly T[]): T | null {
  const match = /^(.+)\.(webp|png|jpe?g)$/i.exec(name.trim());
  if (!match) return null;
  const base = match[1].toLowerCase();
  const numbered = /^tokoh-(\d{1,2})$/.exec(base);
  return figures.find(figure => numbered ? figure.number === Number(numbered[1]) : figure.key === base) ?? null;
}
