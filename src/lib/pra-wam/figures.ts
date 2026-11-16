import { z } from "zod";
import type { Answers } from "./questionnaire";

/*
 * Kartu tokoh dunia (handoff "Cerita Kita WAM 2026", migration 202611130010): the card shows a toy
 * figure of a world figure. Pure, so it is tested without a server; the server draws with crypto
 * randomness and keeps the result.
 *   1. The persona: the 8 characters' score rules, as before (chooseCharacter in cards.ts).
 *   2. The figure, inside that persona: +2 for each of its hobbies chosen at 17, +2 for each of its
 *      activities chosen at 21, +1 when its energy is the answer at 20, +1 when its music genre is
 *      chosen at 37 (no answer at 37: no genre score). One person per figure (v3, 16 Nov 2026:
 *      100 figures, "1 dari 1"): only figures nobody has take part; when the persona has none
 *      left, every free figure does.
 *   3. A tie: a draw.
 *   4. The reason on the card: "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka
 *      olahraga & outdoor, paling menikmati kegiatan outdoor dan nyaman di kelompok kecil."
 * Only the answers to 17, 20, 21 and 37 are read here (34 and 35 through the persona); health,
 * HR-only and anonymous answers never.
 */

/** How many people a figure may have (v3, 16 Nov 2026): one, so every card is "1 dari 1". */
export const FIGURE_QUOTA = 1;
export const FIGURES_MIGRATION = "202611130010_wam_figures.sql";
/** The 100 figures, the one-per-figure quota and the re-roll window (16 Nov 2026). */
export const FIGURES_V3_MIGRATION = "202611160010_wam_figures_v3.sql";
/** The questions a figure is matched on, by their fixed keys. */
export const FIGURE_KEYS = { hobbies: "17", energy: "20", activities: "21", genre: "37" } as const;

export type Figure = {
  id: string; number: number; key: string; name: string; personaId: string; costume: string;
  hobbies: string[]; activities: string[]; energy: string; genre: string;
  indonesian: boolean; funny: boolean; quote: string | null; hidden: boolean;
  /** Where the app reads the picture, or null; `stored` says whether it is in storage. */
  image: string | null; stored: boolean;
  /** Its Legendary RPG form (v3, 16 Nov 2026), shipped with the app; null when there is none. */
  legendImage: string | null;
};
export type Random = (n: number) => number;

/** The persona's background on the card, light to dark (the handoff's colours). */
export const personaColors: Record<string, [string, string]> = {
  garda: ["#C2303F", "#6E1023"], penyihir: ["#F3C744", "#C9800F"], siasat: ["#3A6FBF", "#1B2C66"], penjaga: ["#5BB37C", "#256B44"],
  pemantik: ["#E0408F", "#8E1A55"], pengintai: ["#56A3EE", "#1C5797"], penyembuh: ["#F2A38A", "#B9563F"], penghibur: ["#F08A3C", "#A9461A"],
};
export const colorsOf = (personaKey: string): [string, string] => personaColors[personaKey] ?? ["#3A6FBF", "#1B2C66"];

/** The RPG class of each persona's Legendary form (Hanung, 16 Nov 2026). */
export const legendClasses: Record<string, string> = {
  garda: "Paladin", penyihir: "Archmage", siasat: "Grand Tactician", penjaga: "Guardian Monk",
  pemantik: "Blazing Champion", pengintai: "Ranger", penyembuh: "Healer Cleric", penghibur: "Minstrel Bard",
};

/** Admin WAM opens the re-roll until a moment, or closes it (null). */
export const rerollWindowSchema = z.object({ rerollUntil: z.iso.datetime({ offset: true }).nullable() });
export type RerollWindowInput = z.infer<typeof rerollWindowSchema>;
/** Admin WAM gives one person their re-roll again (16 Nov 2026). */
export const rerollResetSchema = z.object({ resetReroll: z.uuid() });

/** How many stars each rarity has on the card, Common to Legendary (handoff v3). */
export const SPARK_COUNT = [0, 2, 4, 7, 10] as const;

/** The rarity as 0 (Common) to 4 (Legendary), for the effects on the card. */
const rarityKeys = ["common", "uncommon", "rare", "epic", "legendary"];
export function rarityOf(tier: { key: string; sort: number }): 0 | 1 | 2 | 3 | 4 {
  const known = rarityKeys.indexOf(tier.key);
  return Math.max(0, Math.min(4, known >= 0 ? known : tier.sort)) as 0 | 1 | 2 | 3 | 4;
}

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

/** The shown figures nobody has yet, the persona's own first (all free ones when it has none left). */
function freeFigures(personaId: string, figures: readonly Figure[], used: Record<string, number>): Figure[] {
  const open = figures.filter(figure => !figure.hidden && (used[figure.id] ?? 0) < FIGURE_QUOTA);
  const own = open.filter(figure => figure.personaId === personaId);
  return own.length ? own : open;
}

/**
 * The figure for someone of this persona. `used` counts the people who have each figure (by id).
 * Null only when every figure is taken.
 */
export function pickFigure(personaId: string, figures: readonly Figure[], answers: Answers, used: Record<string, number>, pick: Random): { figure: Figure; score: number; why: string[]; tied: string[] } | null {
  const pool = freeFigures(personaId, figures, used);
  if (!pool.length) return null;
  const scored = pool.map(figure => ({ figure, ...figureScore(figure, answers) }));
  const best = Math.max(...scored.map(item => item.score));
  const top = scored.filter(item => item.score === best);
  const chosen = top[pick(top.length)];
  return { ...chosen, tied: top.map(item => item.figure.key) };
}

/**
 * The re-roll (once per person, v3, 16 Nov 2026): a figure drawn at random from the free ones of
 * the same persona, else from every free one; never the one held now. The answers only shape the
 * reason on the card. Null when no figure is free.
 */
export function rerollFigure(personaId: string, figures: readonly Figure[], answers: Answers, used: Record<string, number>, currentId: string, pick: Random): { figure: Figure; score: number; why: string[] } | null {
  const pool = freeFigures(personaId, figures, { ...used, [currentId]: FIGURE_QUOTA }).filter(figure => figure.id !== currentId);
  if (!pool.length) return null;
  const figure = pool[pick(pool.length)];
  return { figure, ...figureScore(figure, answers) };
}

/** "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka …, … dan …." */
export function reasonText(personaClass: string, figureName: string, why: readonly string[]): string {
  const parts = [`kamu tipe ${personaClass}`, ...why];
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} dan ${parts[parts.length - 1]}` : parts[0];
  return `Kamu dapat ${figureName} karena ${joined}.`.slice(0, 400);
}

/** What a card is called: its figure, or (a card without one) its character. */
export const cardName = (card: { figure: { name: string } | null; character: { name: string } }) => card.figure?.name ?? card.character.name;

/** Which figure a picked file is for: its key ("ki-hajar-dewantara.png") or its number ("tokoh-01.webp"). */
export function figureOfFile<T extends Pick<Figure, "key" | "number">>(name: string, figures: readonly T[]): T | null {
  const match = /^(.+)\.(webp|png|jpe?g)$/i.exec(name.trim());
  if (!match) return null;
  const base = match[1].toLowerCase();
  const numbered = /^tokoh-(\d{1,3})$/.exec(base);
  return figures.find(figure => numbered ? figure.number === Number(numbered[1]) : figure.key === base) ?? null;
}
