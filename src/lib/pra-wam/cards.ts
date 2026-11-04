import { z } from "zod";
import type { Answers } from "./questionnaire";

/*
 * Character cards of the questionnaire (migration 202611040013), the parts the app, the admin and
 * the server share. Like a numbered collection, without a blockchain:
 * - the character follows the answers: each card has score rules (an option of a question adds a
 *   weight), the highest score wins, a tie is drawn among the tied ones only;
 * - the level (Common … Legendary) and the look (background, corner accent, 0–2 stickers) are
 *   drawn at random once, with the odds HR sets; a level that is full falls to the one below;
 * - character + look is unique, so no two cards are the same.
 * `pick(n)` is the random source, a whole number from 0 to n − 1 (crypto on the server).
 */

export const CARDS_MIGRATION = "202611040013_wam_cards.sql";
/** Odds are kept per 10,000, so 2.5 % is exact. */
export const ODDS_TOTAL = 10_000;
export const partKinds = ["latar", "aksen", "stiker"] as const;
export type PartKind = (typeof partKinds)[number];
export const artKinds = ["karakter", ...partKinds] as const;
export type ArtKind = (typeof artKinds)[number];
export const artKindLabels: Record<ArtKind, string> = { karakter: "Karakter", latar: "Latar", aksen: "Aksen sudut", stiker: "Stiker" };
export const MAX_STICKERS = 2;

export type Random = (n: number) => number;
export type Tier = { key: string; name: string; color: string; odds: number; maxCards: number | null; line: string; sort: number };
export type CardRule = { questionKey: string; option: string; weight: number };
export type Character = {
  id: string; number: number; key: string; name: string; figure: string; class: string; title: string; description: string;
  powers: string[]; partnerId: string | null; hidden: boolean; rules: CardRule[];
  /** Where the app reads the picture, or null; `stored` says whether it is in storage. */
  image: string | null; stored: boolean;
};
export type Part = { kind: PartKind; number: number; name: string; image: string | null; stored: boolean };
export type Look = { background: number; accent: number; stickers: number[] };

const asList = (value: Answers[string] | undefined): string[] => (Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []);

/** Each character's score from the answers: every chosen option that has a rule adds its weight. */
export function scoresOf(characters: Pick<Character, "id" | "rules">[], answers: Answers): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const character of characters) {
    let score = 0;
    for (const rule of character.rules) if (asList(answers[rule.questionKey]).includes(rule.option)) score += rule.weight;
    scores[character.id] = score;
  }
  return scores;
}

/** The characters with the highest score; all of them when nobody scores. Hidden ones never. */
export function topCharacters(characters: Pick<Character, "id" | "rules" | "hidden">[], answers: Answers): string[] {
  const shown = characters.filter(character => !character.hidden);
  const scores = scoresOf(shown, answers);
  const best = Math.max(0, ...Object.values(scores));
  return best > 0 ? shown.filter(character => scores[character.id] === best).map(character => character.id) : shown.map(character => character.id);
}

/**
 * The character for these answers. The current one stays as long as it is among the best, so a
 * small change of answers, or opening the page again, does not reshuffle a tie.
 */
export function chooseCharacter(characters: Pick<Character, "id" | "rules" | "hidden">[], answers: Answers, current: string | null, pick: Random): { id: string; tied: string[] } | null {
  const top = topCharacters(characters, answers);
  if (!top.length) return null;
  if (current && top.includes(current)) return { id: current, tied: top };
  return { id: top[pick(top.length)], tied: top };
}

/**
 * Draws a level: a number from 0 to 9,999 against the odds, lowest level first. A level whose
 * cap is reached passes the draw down to the next lower one (and up from the lowest, should
 * that be full too); with every level full the lowest is used anyway.
 */
export function drawTier(tiers: Tier[], taken: Record<string, number>, pick: Random): { key: string; roll: number; landed: string; passed: string[] } {
  const ordered = [...tiers].sort((a, b) => a.sort - b.sort);
  if (!ordered.length) throw new Error("Belum ada level kartu.");
  const roll = pick(ODDS_TOTAL);
  let index = ordered.length - 1, sum = 0;
  for (let at = 0; at < ordered.length; at++) { sum += ordered[at].odds; if (roll < sum) { index = at; break; } }
  const landed = ordered[index].key;
  const full = (tier: Tier) => tier.maxCards !== null && (taken[tier.key] ?? 0) >= tier.maxCards;
  const passed: string[] = [];
  const order = [...ordered.slice(0, index + 1).reverse(), ...ordered.slice(index + 1)];
  for (const tier of order) {
    if (!full(tier)) return { key: tier.key, roll, landed, passed };
    passed.push(tier.key);
  }
  return { key: ordered[0].key, roll, landed, passed };
}

/** A look: one background and one accent of each, and 0 to 2 different stickers. */
export function drawLook(counts: Record<PartKind, number>, pick: Random): Look {
  const pool = Array.from({ length: counts.stiker }, (_, index) => index + 1);
  const many = Math.min(pick(MAX_STICKERS + 1), pool.length);
  const stickers: number[] = [];
  for (let index = 0; index < many; index++) stickers.push(pool.splice(pick(pool.length), 1)[0]);
  return { background: pick(Math.max(1, counts.latar)) + 1, accent: pick(Math.max(1, counts.aksen)) + 1, stickers };
}

/** What must be unique between two cards: the character and the look. */
export const comboOf = (characterId: string, look: Look) => [characterId, look.background, look.accent, [...look.stickers].sort((a, b) => a - b).join("+")].join("|");

/** "45 %", "2,5 %". */
export const oddsLabel = (odds: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(odds / 100)} %`;

/** The number on a card: #001. A trial card has none. */
export const serialLabel = (serial: number | null) => serial === null ? "UJI" : `#${String(serial).padStart(3, "0")}`;

/* ---- What the admin sends ---------------------------------------------------------------- */

const text = (max: number, min = 0) => z.string().transform(value => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(min, min ? `Minimal ${min} karakter.` : undefined).max(max, `Paling panjang ${max} karakter.`));

export const tiersSchema = z.object({
  tiers: z.array(z.object({
    key: z.string().regex(/^[a-z]{2,20}$/),
    name: text(30, 2),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Warna berupa kode seperti #FFC94A."),
    odds: z.number().int().min(0).max(ODDS_TOTAL),
    maxCards: z.number().int().min(0).max(ODDS_TOTAL).nullable(),
    line: text(120),
  })).min(1).max(10),
}).superRefine((value, context) => {
  const total = value.tiers.reduce((sum, tier) => sum + tier.odds, 0);
  if (total !== ODDS_TOTAL) context.addIssue({ code: "custom", path: ["tiers"], message: `Jumlah peluang harus 100 %. Sekarang ${oddsLabel(total)}.` });
});
export type TiersInput = z.infer<typeof tiersSchema>;

export const ruleSchema = z.object({
  questionKey: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/, "Pilih pertanyaan."),
  option: z.string().min(1, "Pilih jawaban.").max(200),
  weight: z.number().int().min(1, "Bobot 1 sampai 9.").max(9, "Bobot 1 sampai 9."),
});

export const characterSchema = z.object({
  name: text(40, 2),
  figure: text(40),
  class: text(40, 2),
  title: text(120),
  description: z.string().trim().max(400, "Paling panjang 400 karakter."),
  powers: z.array(text(30, 1)).max(5, "Paling banyak 5 kekuatan."),
  partnerId: z.string().uuid().nullable(),
  hidden: z.boolean(),
  rules: z.array(ruleSchema).max(60, "Paling banyak 60 aturan."),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.rules.forEach((rule, index) => {
    const id = `${rule.questionKey}\0${rule.option}`;
    if (seen.has(id)) context.addIssue({ code: "custom", path: ["rules", index, "option"], message: "Aturan ini sudah ada." });
    seen.add(id);
  });
});
export type CharacterInput = z.infer<typeof characterSchema>;

/** A new character's key from its name: "Urban DJ" → "urban-dj". */
export const characterKey = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "") || "karakter";

/* ---- Pictures ----------------------------------------------------------------------------- */

export const artTypes = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" } as const;
export type ArtMime = keyof typeof artTypes;
export const MAX_ART_BYTES = 3 * 1024 * 1024;
export const artStartSchema = z.object({
  kind: z.enum(artKinds),
  /** A character's id, or a part's number. */
  ref: z.string().regex(/^([0-9a-f-]{36}|[0-9]{1,2})$/),
  mime: z.enum(Object.keys(artTypes) as [ArtMime, ...ArtMime[]], { message: "Pilih gambar WebP, PNG, atau JPG." }),
  size: z.number().int().min(1).max(MAX_ART_BYTES, "Gambar lebih dari 3 MB. Perkecil dulu."),
});
export type ArtStart = z.infer<typeof artStartSchema>;

/** Where a picture lives in storage; the migration's check allows only this shape. */
export const artKeyFor = (kind: ArtKind, number: number, id: string, mime: ArtMime) => `pra-wam/kartu/${kind}-${String(number).padStart(2, "0")}-${id}.${artTypes[mime]}`;

/** "karakter-01.webp", "latar-08.png": which slot a file from the mockup's folder fills, or null. */
export function slotOfFile(name: string): { kind: ArtKind; number: number } | null {
  const match = /^(karakter|latar|aksen|stiker)-(\d{1,2})\.(webp|png|jpe?g)$/i.exec(name.trim());
  if (!match) return null;
  const number = Number(match[2]);
  return number >= 1 ? { kind: match[1].toLowerCase() as ArtKind, number } : null;
}
