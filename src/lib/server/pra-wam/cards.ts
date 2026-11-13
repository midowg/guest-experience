import "server-only";
import { createHash, randomInt } from "node:crypto";
import {
  CARDS_MIGRATION, chooseCharacter, comboOf, drawLook, drawTier, partKinds, scoresOf,
  type ArtKind, type Character, type Look, type Part, type PartKind, type Tier,
} from "@/lib/pra-wam/cards";
import { colorsOf, FIGURE_KEYS, pickFigure, reasonText, type Figure } from "@/lib/pra-wam/figures";
import { editable, type Answers, type QForm } from "@/lib/pra-wam/questionnaire";
import { praWamApi } from "@/lib/routes";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Character cards (migration 202611040013), on the server: the catalog HR keeps, drawing a
 * person's card once they finish, and letting the character follow their answers until the
 * deadline. The level, the look and the number are drawn once with crypto randomness and kept;
 * nothing here ever draws them again for the same person. Before the migration there are no
 * cards, and the questionnaire works as before.
 *
 * Kartu tokoh dunia (migration 202611130010, handoff 12 Nov 2026): with figures in the catalog the
 * card shows a figure. The character is the persona, then a figure of that persona is matched to
 * the answers (lib/pra-wam/figures.ts), at most two people per figure: the database refuses a
 * third (a unique place 1 or 2), so two people finishing at once never pass the quota. The figure,
 * the level and the number are drawn once and locked; they no longer follow changed answers. A
 * card drawn before the figures gets its figure the next time it is opened, keeping its level and
 * number.
 */

export const cardsMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || (!error.code && /relation .*cq_(tiers|cards|card_rules|card_parts|person_cards).* does not exist/.test(error.message ?? ""));
const figuresMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") && /cq_figures|figure_(id|slot)|reason/.test(error.message ?? "");
export const cardsWaiting = () => new ServiceError(503, `Kartu karakter menunggu migrasi ${CARDS_MIGRATION}.`);
const failed = (error: { code?: string; message?: string }): never => {
  if (cardsMissing(error)) throw cardsWaiting();
  databaseError({ message: error.message ?? "", code: error.code });
};

/** The random source of every draw: a crypto whole number from 0 to n − 1. */
const secure = (n: number) => randomInt(n);

/**
 * Where the app reads a picture; `v` changes with the picture, so caches refresh. Without one
 * in storage there is none, except while developing (see artBytes).
 */
export const artUrl = (kind: ArtKind, ref: string | number, key: string | null, updatedAt: string | null) =>
  key || process.env.NODE_ENV === "development" ? praWamApi.cardArt(kind, String(ref), updatedAt ? String(new Date(updatedAt).getTime()) : undefined) : null;

type TierRow = { key: string; name: string; color: string; odds: number; max_cards: number | null; line: string; sort: number };
type CardRow = {
  id: string; number: number; key: string; name: string; figure: string; class: string; title: string; description: string; powers: string[];
  partner_id: string | null; hidden: boolean; image_key: string | null; image_updated_at: string | null;
  cq_card_rules: { question_key: string; option: string; weight: number }[];
};
type PartRow = { kind: PartKind; number: number; name: string; image_key: string | null; image_updated_at: string | null };
type FigureRow = {
  id: string; number: number; key: string; name: string; persona_id: string; costume: string; hobbies: string[]; activities: string[];
  energy: string; genre: string; indonesian: boolean; funny: boolean; quote: string | null; hidden: boolean; image_key: string | null; image_updated_at: string | null;
};
const FIGURE_COLUMNS = "id,number,key,name,persona_id,costume,hobbies,activities,energy,genre,indonesian,funny,quote,hidden,image_key,image_updated_at";

export type Catalog = {
  tiers: Tier[]; characters: Character[]; parts: Part[];
  /** The figures of the tokoh card; empty before migration 202611130010 (then `figuresReady` is false). */
  figures: Figure[]; figuresReady: boolean;
};

/** Levels, characters with their rules, the look parts and the figures of a form; null before the migration. */
export async function catalogOf(formId: string): Promise<Catalog | null> {
  const client = createPrivilegedClient();
  const [tiers, cards, parts, figures] = await Promise.all([
    client.from("cq_tiers").select("key,name,color,odds,max_cards,line,sort").eq("form_id", formId).order("sort"),
    client.from("cq_cards").select("id,number,key,name,figure,class,title,description,powers,partner_id,hidden,image_key,image_updated_at,cq_card_rules(question_key,option,weight)").eq("form_id", formId).order("number"),
    client.from("cq_card_parts").select("kind,number,name,image_key,image_updated_at").eq("form_id", formId).order("kind").order("number"),
    client.from("cq_figures").select(FIGURE_COLUMNS).eq("form_id", formId).order("number"),
  ]);
  for (const result of [tiers, cards, parts]) if (result.error) { if (cardsMissing(result.error)) return null; databaseError(result.error); }
  if (figures.error && !figuresMissing(figures.error)) databaseError(figures.error);
  return {
    tiers: ((tiers.data ?? []) as TierRow[]).map(row => ({ key: row.key, name: row.name, color: row.color, odds: row.odds, maxCards: row.max_cards, line: row.line, sort: row.sort })),
    characters: ((cards.data ?? []) as unknown as CardRow[]).map(row => ({
      id: row.id, number: row.number, key: row.key, name: row.name, figure: row.figure, class: row.class, title: row.title, description: row.description,
      powers: row.powers ?? [], partnerId: row.partner_id, hidden: row.hidden, image: artUrl("karakter", row.id, row.image_key, row.image_updated_at), stored: !!row.image_key,
      rules: (row.cq_card_rules ?? []).map(rule => ({ questionKey: rule.question_key, option: rule.option, weight: rule.weight })),
    })),
    parts: ((parts.data ?? []) as PartRow[]).map(row => ({ kind: row.kind, number: row.number, name: row.name, image: artUrl(row.kind, row.number, row.image_key, row.image_updated_at), stored: !!row.image_key })),
    figures: figures.error ? [] : ((figures.data ?? []) as FigureRow[]).map(row => ({
      id: row.id, number: row.number, key: row.key, name: row.name, personaId: row.persona_id, costume: row.costume, hobbies: row.hobbies ?? [], activities: row.activities ?? [],
      energy: row.energy, genre: row.genre, indonesian: row.indonesian, funny: row.funny, quote: row.quote, hidden: row.hidden,
      // A picture uploaded in Admin WAM wins; until then the handoff's picture that ships with the app.
      image: row.image_key ? artUrl("tokoh", row.id, row.image_key, row.image_updated_at) : builtInFigure(row.key), stored: !!row.image_key,
    })),
    figuresReady: !figures.error,
  };
}

/**
 * The handoff's picture of a figure, shipped with the app in public/figur (13 Nov 2026, the owner's
 * choice: the previews of the handoff, 820 × 1024). A missing file draws the silhouette instead.
 */
const builtInFigure = (key: string) => `/figur/${encodeURIComponent(key)}.webp`;

/** Whether cards show figures: the migration ran and the catalog has a figure to give. */
const figureMode = (catalog: Catalog) => catalog.figuresReady && catalog.figures.some(figure => !figure.hidden);

export type PersonCardRow = {
  employee_id: string; card_id: string; tier_key: string; background: number; accent: number; stickers: number[]; serial: number | null; trial: boolean;
  combo: string; dna: string; roll: Roll; drawn_at: string;
  /** The figure and its place (1 or 2), and the sentence on the card (migration 202611130010). */
  figure_id?: string | null; figure_slot?: number | null; reason?: string | null;
};
/** The draw's record: what the odds were, what came out, and what changed later. */
export type Roll = {
  at: string; odds: Record<string, number>; caps: Record<string, number | null>; taken: Record<string, number>;
  number: number; landed: string; passed: string[]; tier: string;
  scores: Record<string, number>; tied: string[]; character: string; look: Look;
  changes?: { at: string; from: string; to: string; kept?: "bentrok" }[];
  /** The figure matched (its key), how it scored, and the figures tied with it. */
  figure?: { key: string; score: number; tied: string[]; at: string };
};

export const PERSON_COLUMNS = "employee_id,card_id,tier_key,background,accent,stickers,serial,trial,combo,dna,roll,drawn_at";
const FIGURE_PERSON_COLUMNS = `${PERSON_COLUMNS},figure_id,figure_slot,reason`;
/** The columns of a person card to read: with the figure once its migration ran. */
export const columnsFor = (catalog: Pick<Catalog, "figuresReady">) => catalog.figuresReady ? FIGURE_PERSON_COLUMNS : PERSON_COLUMNS;
const dnaOf = (combo: string) => createHash("sha256").update(`dna:${combo}`).digest("hex").slice(0, 10);
/** A figure card's combo: the figure and its place, so the unique combo index guards the quota too. */
const figureCombo = (figureId: string, slot: number) => `tokoh|${figureId}|${slot}`;

/** What a person's card shows. */
export type CardView = {
  serial: number | null; trial: boolean; dna: string; drawnAt: string;
  character: Pick<Character, "id" | "key" | "name" | "figure" | "class" | "title" | "description" | "powers" | "image"> & { partner: { name: string; class: string } | null };
  tier: Pick<Tier, "key" | "name" | "color" | "line" | "odds" | "sort">;
  background: Pick<Part, "number" | "name" | "image">; accent: Pick<Part, "number" | "name" | "image">; stickers: Pick<Part, "number" | "name" | "image">[];
  /** The tokoh card's figure (null for a card without one), the reason, and the persona's colours. */
  figure: Pick<Figure, "id" | "key" | "name" | "costume" | "quote" | "image"> | null;
  reason: string | null;
  colors: [string, string];
};

export function viewOf(row: PersonCardRow, catalog: Catalog): CardView | null {
  const character = catalog.characters.find(item => item.id === row.card_id);
  const tier = catalog.tiers.find(item => item.key === row.tier_key);
  if (!character || !tier) return null;
  const part = (kind: PartKind, number: number) => {
    const found = catalog.parts.find(item => item.kind === kind && item.number === number);
    return { number, name: found?.name ?? `${kind} ${number}`, image: found?.image ?? null };
  };
  const partner = character.partnerId ? catalog.characters.find(item => item.id === character.partnerId) : undefined;
  const figure = row.figure_id ? catalog.figures.find(item => item.id === row.figure_id) : undefined;
  return {
    serial: row.serial, trial: row.trial, dna: row.dna, drawnAt: row.drawn_at,
    character: { id: character.id, key: character.key, name: character.name, figure: character.figure, class: character.class, title: character.title, description: character.description, powers: character.powers, image: character.image, partner: partner ? { name: partner.name, class: partner.class } : null },
    tier: { key: tier.key, name: tier.name, color: tier.color, line: tier.line, odds: tier.odds, sort: tier.sort },
    background: part("latar", row.background), accent: part("aksen", row.accent), stickers: row.stickers.map(number => part("stiker", number)),
    figure: figure ? { id: figure.id, key: figure.key, name: figure.name, costume: figure.costume, quote: figure.quote, image: figure.image } : null,
    reason: figure ? row.reason ?? null : null,
    colors: colorsOf(character.key),
  };
}

async function personCard(formId: string, employeeId: string, catalog: Pick<Catalog, "figuresReady">): Promise<PersonCardRow | null> {
  const { data, error } = await createPrivilegedClient().from("cq_person_cards").select(columnsFor(catalog)).eq("form_id", formId).eq("employee_id", employeeId).maybeSingle();
  if (error) { if (cardsMissing(error)) return null; databaseError(error); }
  return data as PersonCardRow | null;
}

/** The answers a figure is matched on (17, 20, 21, 37), by question key: nothing else is read. */
async function figureAnswers(formId: string, employeeIds: readonly string[]): Promise<Map<string, Answers>> {
  const out = new Map<string, Answers>();
  if (!employeeIds.length) return out;
  const client = createPrivilegedClient();
  const { data: questions, error } = await client.from("cq_questions").select("id,key").eq("form_id", formId).in("key", Object.values(FIGURE_KEYS));
  if (error) failed(error);
  const keyOf = new Map(((questions ?? []) as { id: string; key: string }[]).map(question => [question.id, question.key]));
  if (!keyOf.size) return out;
  const { data, error: answerError } = await client.from("cq_answers").select("employee_id,question_id,value")
    .eq("form_id", formId).in("employee_id", [...employeeIds]).in("question_id", [...keyOf.keys()]);
  if (answerError) failed(answerError);
  for (const row of (data ?? []) as { employee_id: string; question_id: string; value: Answers[string] }[]) {
    const key = keyOf.get(row.question_id);
    if (key) out.set(row.employee_id, { ...out.get(row.employee_id), [key]: row.value });
  }
  return out;
}

/**
 * Cards drawn before the figures (anime characters) get their figure now, matched to their own
 * answers, keeping level and number: on any page that shows them (the questionnaire, Beranda, the
 * gallery), not only when the card is drawn. Cards that have one come back as they are.
 */
export async function withFigures(form: Pick<QForm, "id">, rows: PersonCardRow[], catalog: Catalog): Promise<PersonCardRow[]> {
  if (!figureMode(catalog)) return rows;
  const bare = rows.filter(row => !row.figure_id);
  if (!bare.length) return rows;
  const answers = await figureAnswers(form.id, bare.map(row => row.employee_id));
  const given = new Map<string, PersonCardRow>();
  for (const row of bare) given.set(row.employee_id, await giveFigure(form, row, answers.get(row.employee_id) ?? {}, catalog));
  return rows.map(row => given.get(row.employee_id) ?? row);
}

/** My card as it shows now; null when I have none yet, or before the migration. Never draws (a card from before the figures gets its figure). */
export async function myCard(form: Pick<QForm, "id">, employeeId: string): Promise<CardView | null> {
  const catalog = await catalogOf(form.id);
  if (!catalog) return null;
  const row = await personCard(form.id, employeeId, catalog);
  if (!row) return null;
  const [shown] = await withFigures(form, [row], catalog);
  return viewOf(shown, catalog);
}

const counts = (catalog: Catalog): Record<PartKind, number> =>
  Object.fromEntries(partKinds.map(kind => [kind, catalog.parts.filter(part => part.kind === kind).length])) as Record<PartKind, number>;

/** How many people have each figure now (real cards only), and the places they take. */
async function figuresTaken(formId: string): Promise<{ used: Record<string, number>; places: Set<string> }> {
  const { data, error } = await createPrivilegedClient().from("cq_person_cards").select("figure_id,figure_slot").eq("form_id", formId).eq("trial", false).not("figure_id", "is", null);
  if (error) failed(error);
  const used: Record<string, number> = {};
  const places = new Set<string>();
  for (const row of (data ?? []) as { figure_id: string; figure_slot: number }[]) {
    used[row.figure_id] = (used[row.figure_id] ?? 0) + 1;
    places.add(`${row.figure_id}|${row.figure_slot}`);
  }
  return { used, places };
}

/** A figure for someone of this persona, with its free place, or null when every figure is taken three times. */
async function matchFigure(formId: string, catalog: Catalog, personaId: string, answers: Answers, trial: boolean) {
  const { used, places } = trial ? { used: {}, places: new Set<string>() } : await figuresTaken(formId);
  const persona = catalog.characters.find(item => item.id === personaId);
  const match = pickFigure(personaId, catalog.figures, answers, used, secure);
  if (!match) return null;
  // The first free place, 1 to 3 (the database refuses a taken one, so a clash draws again).
  const slot = [1, 2, 3].find(place => !places.has(`${match.figure.id}|${place}`)) ?? 3;
  return {
    figure: match.figure, slot, reason: reasonText(persona?.class ?? "", match.figure.name, match.why),
    record: { key: match.figure.key, score: match.score, tied: match.tied, at: new Date().toISOString() },
  };
}

/**
 * Draws a card for someone who finished: the character from their answers, then the level and a
 * look nobody else has (or, with figures, a figure with a place left), then the next number. A
 * card drawn while the form is a draft is a trial (no number, not counted). Two draws at once for
 * the same person keep the first; two people at once may not take the same number, look or
 * figure place (unique indexes), so a clash is simply drawn again.
 */
async function draw(form: QForm, employeeId: string, answers: Answers, catalog: Catalog): Promise<PersonCardRow> {
  const client = createPrivilegedClient();
  const trial = form.status === "draf";
  const shown = catalog.characters.filter(character => !character.hidden);
  if (!shown.length || !catalog.tiers.length) throw new ServiceError(409, "Katalog kartu belum siap. Hubungi admin WAM.");
  const parts = counts(catalog);
  const figures = figureMode(catalog);

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: others, error } = await client.from("cq_person_cards").select("tier_key,combo,serial").eq("form_id", form.id).eq("trial", false);
    if (error) failed(error);
    const rows = (others ?? []) as { tier_key: string; combo: string; serial: number }[];
    const taken: Record<string, number> = {};
    for (const row of rows) taken[row.tier_key] = (taken[row.tier_key] ?? 0) + 1;
    const used = new Set(rows.map(row => row.combo));

    const chosen = chooseCharacter(shown, answers, null, secure)!;
    const tier = drawTier(catalog.tiers, trial ? {} : taken, secure);
    const match = figures ? await matchFigure(form.id, catalog, chosen.id, answers, trial) : null;
    if (figures && !match) throw new ServiceError(409, "Semua tokoh sudah dipakai tiga orang. Hubungi admin WAM untuk menambah tokoh.");
    let look: Look = { background: 1, accent: 1, stickers: [] };
    if (!match) {
      look = drawLook(parts, secure);
      for (let tries = 0; tries < 200 && used.has(comboOf(chosen.id, look)); tries++) look = drawLook(parts, secure);
    }
    const combo = match ? (trial ? `uji|${employeeId}` : figureCombo(match.figure.id, match.slot)) : comboOf(chosen.id, look);
    const serial = trial ? null : Math.max(0, ...rows.map(row => row.serial)) + 1;
    const keyOf = (id: string) => shown.find(item => item.id === id)?.key ?? id;
    const scores = Object.fromEntries(Object.entries(scoresOf(shown, answers)).map(([id, score]) => [keyOf(id), score]));
    const roll: Roll = {
      at: new Date().toISOString(),
      odds: Object.fromEntries(catalog.tiers.map(item => [item.key, item.odds])),
      caps: Object.fromEntries(catalog.tiers.map(item => [item.key, item.maxCards])),
      taken: trial ? {} : taken, number: tier.roll, landed: tier.landed, passed: tier.passed, tier: tier.key,
      scores, tied: chosen.tied.map(keyOf), character: keyOf(chosen.id), look,
      ...(match ? { figure: match.record } : {}),
    };
    const row = {
      form_id: form.id, employee_id: employeeId, card_id: chosen.id, tier_key: tier.key, background: look.background, accent: look.accent, stickers: look.stickers,
      serial, trial, combo, dna: dnaOf(combo), roll,
      ...(match ? { figure_id: match.figure.id, figure_slot: match.slot, reason: match.reason } : {}),
    };
    const { data, error: insertError } = await client.from("cq_person_cards").insert(row).select(columnsFor(catalog)).single();
    if (!insertError) return data as unknown as PersonCardRow;
    if (insertError.code !== "23505") failed(insertError);
    // This person already has one (a second tap, another phone): keep that card.
    if (/cq_person_cards_pkey/.test(insertError.message)) {
      const existing = await personCard(form.id, employeeId, catalog);
      if (existing) return existing;
    }
    // Someone else took this number, look or figure place a moment ago: draw again.
  }
  throw new ServiceError(503, "Kartu belum dapat diundi. Coba lagi sebentar lagi.");
}

/**
 * A card drawn before the figures (an anime character) gets a figure of its persona now, matched
 * to the answers; its level and number stay. A clash with someone taking the same place a moment
 * ago is matched again.
 */
async function giveFigure(form: Pick<QForm, "id">, row: PersonCardRow, answers: Answers, catalog: Catalog): Promise<PersonCardRow> {
  const client = createPrivilegedClient();
  for (let attempt = 0; attempt < 6; attempt++) {
    const match = await matchFigure(form.id, catalog, row.card_id, answers, row.trial);
    if (!match) return row;
    const combo = row.trial ? `uji|${row.employee_id}` : figureCombo(match.figure.id, match.slot);
    const roll: Roll = { ...row.roll, figure: match.record };
    const { data, error } = await client.from("cq_person_cards")
      .update({ figure_id: match.figure.id, figure_slot: match.slot, reason: match.reason, combo, dna: dnaOf(combo), roll, updated_at: new Date().toISOString() })
      .eq("form_id", form.id).eq("employee_id", row.employee_id).is("figure_id", null)
      .select(columnsFor(catalog)).maybeSingle();
    if (!error) return (data as unknown as PersonCardRow | null) ?? (await personCard(form.id, row.employee_id, catalog)) ?? row;
    if (error.code !== "23505") failed(error);
  }
  return row;
}

/**
 * The character follows changed answers until the deadline; the level, look and number stay.
 * The current character stays while it is still among the best. A change that would make the
 * card the same as someone else's keeps the old character (and says so in the record). A card
 * with a figure is locked and never follows.
 */
async function follow(form: QForm, row: PersonCardRow, answers: Answers, catalog: Catalog): Promise<PersonCardRow> {
  if (row.figure_id || figureMode(catalog)) return row;
  const chosen = chooseCharacter(catalog.characters, answers, row.card_id, secure);
  if (!chosen || chosen.id === row.card_id) return row;
  const keyOf = (id: string) => catalog.characters.find(item => item.id === id)?.key ?? id;
  const look = { background: row.background, accent: row.accent, stickers: row.stickers };
  const combo = comboOf(chosen.id, look);
  const change = { at: new Date().toISOString(), from: keyOf(row.card_id), to: keyOf(chosen.id) };
  const roll: Roll = { ...row.roll, changes: [...(row.roll.changes ?? []), change].slice(-20) };
  const client = createPrivilegedClient();
  const { data, error } = await client.from("cq_person_cards")
    .update({ card_id: chosen.id, combo, dna: dnaOf(combo), roll, updated_at: change.at })
    .eq("form_id", form.id).eq("employee_id", row.employee_id).eq("card_id", row.card_id)
    .select(columnsFor(catalog)).maybeSingle();
  if (error) {
    if (error.code !== "23505") failed(error);
    const kept: Roll = { ...row.roll, changes: [...(row.roll.changes ?? []), { ...change, kept: "bentrok" as const }].slice(-20) };
    await client.from("cq_person_cards").update({ roll: kept }).eq("form_id", form.id).eq("employee_id", row.employee_id);
    return row;
  }
  return (data as unknown as PersonCardRow | null) ?? row;
}

/**
 * For someone who finished: their card, drawn now if they have none. A trial card from the draft
 * gives way to a real draw once the form is open. While answers may still change, the character
 * follows them (not a figure card: that is locked). A card from before the figures gets its
 * figure. Null before the migration.
 */
export async function ensureCard(form: QForm, employeeId: string, answers: Answers): Promise<CardView | null> {
  const catalog = await catalogOf(form.id);
  if (!catalog) return null;
  let row = await personCard(form.id, employeeId, catalog);
  if (row?.trial && form.status !== "draf") {
    const { error } = await createPrivilegedClient().from("cq_person_cards").delete().eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", true);
    if (error) failed(error);
    row = null;
  }
  if (!row) row = await draw(form, employeeId, answers, catalog);
  else if (figureMode(catalog) && !row.figure_id) row = await giveFigure(form, row, answers, catalog);
  else if (form.status === "draf" || editable(form)) row = await follow(form, row, answers, catalog);
  return viewOf(row, catalog);
}

/** After an answer changed: an existing card's character follows it. Never draws, never fails the answer. */
export async function followAnswers(form: QForm, employeeId: string, answers: Answers): Promise<void> {
  try {
    const catalog = await catalogOf(form.id);
    if (!catalog || figureMode(catalog)) return;
    const row = await personCard(form.id, employeeId, catalog);
    if (!row || (row.trial && form.status !== "draf")) return;
    await follow(form, row, answers, catalog);
  } catch (error) {
    console.error("Kartu karakter belum dapat mengikuti jawaban", error);
  }
}

/* ---- Pictures --------------------------------------------------------------------------------- */

/** The storage key, slot number and (for a figure) key of one picture of the current catalog, or null. */
export async function artSlot(formId: string, kind: ArtKind, ref: string): Promise<{ key: string | null; number: number; name?: string } | null> {
  const client = createPrivilegedClient();
  const { data, error } = kind === "karakter"
    ? await client.from("cq_cards").select("number,image_key").eq("form_id", formId).eq("id", ref).maybeSingle()
    : kind === "tokoh"
      ? await client.from("cq_figures").select("number,image_key,key").eq("form_id", formId).eq("id", ref).maybeSingle()
      : await client.from("cq_card_parts").select("number,image_key").eq("form_id", formId).eq("kind", kind).eq("number", Number(ref)).maybeSingle();
  if (error) { if (cardsMissing(error) || figuresMissing(error) || error.code === "22P02") return null; databaseError(error); }
  const row = data as { number: number; image_key: string | null; key?: string } | null;
  return row ? { key: row.image_key, number: row.number, name: row.key } : null;
}

const localTypes: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

/**
 * The bytes of one picture: from private storage, or, only while developing without storage,
 * from the ignored folder .card-art (karakter-01.webp, latar-01.png, tokoh-01.png or the figure's
 * own key, ki-hajar-dewantara.webp …) to try the cards locally.
 */
export async function artBytes(formId: string, kind: ArtKind, ref: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const slot = await artSlot(formId, kind, ref);
  if (!slot) return null;
  const { isR2Configured, readObject } = await import("../r2");
  if (slot.key && isR2Configured()) return readObject(slot.key);
  if (process.env.NODE_ENV !== "development") return null;
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const names = [`${kind}-${String(slot.number).padStart(2, "0")}`, ...(slot.name ? [slot.name] : [])];
  for (const name of names) for (const ext of Object.keys(localTypes)) {
    const bytes = await readFile(join(process.cwd(), ".card-art", `${name}.${ext}`)).catch(() => null);
    if (bytes) return { bytes: new Uint8Array(bytes), type: localTypes[ext] };
  }
  return null;
}
