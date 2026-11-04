import "server-only";
import { createHash, randomInt } from "node:crypto";
import {
  CARDS_MIGRATION, chooseCharacter, comboOf, drawLook, drawTier, partKinds, scoresOf,
  type ArtKind, type Character, type Look, type Part, type PartKind, type Tier,
} from "@/lib/pra-wam/cards";
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
 */

export const cardsMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /cq_(tiers|cards|card_rules|card_parts|person_cards)/.test(error.message ?? "");
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

export type Catalog = { tiers: Tier[]; characters: Character[]; parts: Part[] };

/** Levels, characters with their rules, and the look parts of a form; null before the migration. */
export async function catalogOf(formId: string): Promise<Catalog | null> {
  const client = createPrivilegedClient();
  const [tiers, cards, parts] = await Promise.all([
    client.from("cq_tiers").select("key,name,color,odds,max_cards,line,sort").eq("form_id", formId).order("sort"),
    client.from("cq_cards").select("id,number,key,name,figure,class,title,description,powers,partner_id,hidden,image_key,image_updated_at,cq_card_rules(question_key,option,weight)").eq("form_id", formId).order("number"),
    client.from("cq_card_parts").select("kind,number,name,image_key,image_updated_at").eq("form_id", formId).order("kind").order("number"),
  ]);
  for (const result of [tiers, cards, parts]) if (result.error) { if (cardsMissing(result.error)) return null; databaseError(result.error); }
  return {
    tiers: ((tiers.data ?? []) as TierRow[]).map(row => ({ key: row.key, name: row.name, color: row.color, odds: row.odds, maxCards: row.max_cards, line: row.line, sort: row.sort })),
    characters: ((cards.data ?? []) as unknown as CardRow[]).map(row => ({
      id: row.id, number: row.number, key: row.key, name: row.name, figure: row.figure, class: row.class, title: row.title, description: row.description,
      powers: row.powers ?? [], partnerId: row.partner_id, hidden: row.hidden, image: artUrl("karakter", row.id, row.image_key, row.image_updated_at), stored: !!row.image_key,
      rules: (row.cq_card_rules ?? []).map(rule => ({ questionKey: rule.question_key, option: rule.option, weight: rule.weight })),
    })),
    parts: ((parts.data ?? []) as PartRow[]).map(row => ({ kind: row.kind, number: row.number, name: row.name, image: artUrl(row.kind, row.number, row.image_key, row.image_updated_at), stored: !!row.image_key })),
  };
}

export type PersonCardRow = {
  employee_id: string; card_id: string; tier_key: string; background: number; accent: number; stickers: number[]; serial: number | null; trial: boolean;
  combo: string; dna: string; roll: Roll; drawn_at: string;
};
/** The draw's record: what the odds were, what came out, and what changed later. */
export type Roll = {
  at: string; odds: Record<string, number>; caps: Record<string, number | null>; taken: Record<string, number>;
  number: number; landed: string; passed: string[]; tier: string;
  scores: Record<string, number>; tied: string[]; character: string; look: Look;
  changes?: { at: string; from: string; to: string; kept?: "bentrok" }[];
};

export const PERSON_COLUMNS = "employee_id,card_id,tier_key,background,accent,stickers,serial,trial,combo,dna,roll,drawn_at";
const dnaOf = (combo: string) => createHash("sha256").update(`dna:${combo}`).digest("hex").slice(0, 10);

/** What a person's card shows. */
export type CardView = {
  serial: number | null; trial: boolean; dna: string; drawnAt: string;
  character: Pick<Character, "id" | "name" | "figure" | "class" | "title" | "description" | "powers" | "image"> & { partner: { name: string; class: string } | null };
  tier: Pick<Tier, "key" | "name" | "color" | "line" | "odds" | "sort">;
  background: Pick<Part, "number" | "name" | "image">; accent: Pick<Part, "number" | "name" | "image">; stickers: Pick<Part, "number" | "name" | "image">[];
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
  return {
    serial: row.serial, trial: row.trial, dna: row.dna, drawnAt: row.drawn_at,
    character: { id: character.id, name: character.name, figure: character.figure, class: character.class, title: character.title, description: character.description, powers: character.powers, image: character.image, partner: partner ? { name: partner.name, class: partner.class } : null },
    tier: { key: tier.key, name: tier.name, color: tier.color, line: tier.line, odds: tier.odds, sort: tier.sort },
    background: part("latar", row.background), accent: part("aksen", row.accent), stickers: row.stickers.map(number => part("stiker", number)),
  };
}

async function personCard(formId: string, employeeId: string): Promise<PersonCardRow | null> {
  const { data, error } = await createPrivilegedClient().from("cq_person_cards").select(PERSON_COLUMNS).eq("form_id", formId).eq("employee_id", employeeId).maybeSingle();
  if (error) { if (cardsMissing(error)) return null; databaseError(error); }
  return data as PersonCardRow | null;
}

/** My card as it shows now; null when I have none yet, or before the migration. Never draws. */
export async function myCard(form: Pick<QForm, "id">, employeeId: string): Promise<CardView | null> {
  const [row, catalog] = await Promise.all([personCard(form.id, employeeId), catalogOf(form.id)]);
  return row && catalog ? viewOf(row, catalog) : null;
}

const counts = (catalog: Catalog): Record<PartKind, number> =>
  Object.fromEntries(partKinds.map(kind => [kind, catalog.parts.filter(part => part.kind === kind).length])) as Record<PartKind, number>;

/**
 * Draws a card for someone who finished: the character from their answers, then the level and a
 * look nobody else has, then the next number. A card drawn while the form is a draft is a trial
 * (no number, not counted). Two draws at once for the same person keep the first; two people at
 * once may not take the same number or look (unique indexes), so a clash is simply drawn again.
 */
async function draw(form: QForm, employeeId: string, answers: Answers, catalog: Catalog): Promise<PersonCardRow> {
  const client = createPrivilegedClient();
  const trial = form.status === "draf";
  const shown = catalog.characters.filter(character => !character.hidden);
  if (!shown.length || !catalog.tiers.length) throw new ServiceError(409, "Katalog kartu belum siap. Hubungi admin WAM.");
  const parts = counts(catalog);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: others, error } = await client.from("cq_person_cards").select("tier_key,combo,serial").eq("form_id", form.id).eq("trial", false);
    if (error) failed(error);
    const rows = (others ?? []) as { tier_key: string; combo: string; serial: number }[];
    const taken: Record<string, number> = {};
    for (const row of rows) taken[row.tier_key] = (taken[row.tier_key] ?? 0) + 1;
    const used = new Set(rows.map(row => row.combo));

    const chosen = chooseCharacter(shown, answers, null, secure)!;
    const tier = drawTier(catalog.tiers, trial ? {} : taken, secure);
    let look = drawLook(parts, secure);
    for (let tries = 0; tries < 200 && used.has(comboOf(chosen.id, look)); tries++) look = drawLook(parts, secure);
    const combo = comboOf(chosen.id, look);
    const serial = trial ? null : Math.max(0, ...rows.map(row => row.serial)) + 1;
    const keyOf = (id: string) => shown.find(item => item.id === id)?.key ?? id;
    const scores = Object.fromEntries(Object.entries(scoresOf(shown, answers)).map(([id, score]) => [keyOf(id), score]));
    const roll: Roll = {
      at: new Date().toISOString(),
      odds: Object.fromEntries(catalog.tiers.map(item => [item.key, item.odds])),
      caps: Object.fromEntries(catalog.tiers.map(item => [item.key, item.maxCards])),
      taken: trial ? {} : taken, number: tier.roll, landed: tier.landed, passed: tier.passed, tier: tier.key,
      scores, tied: chosen.tied.map(keyOf), character: keyOf(chosen.id), look,
    };
    const row = {
      form_id: form.id, employee_id: employeeId, card_id: chosen.id, tier_key: tier.key, background: look.background, accent: look.accent, stickers: look.stickers,
      serial, trial, combo, dna: dnaOf(combo), roll,
    };
    const { data, error: insertError } = await client.from("cq_person_cards").insert(row).select(PERSON_COLUMNS).single();
    if (!insertError) return data as PersonCardRow;
    if (insertError.code !== "23505") failed(insertError);
    // This person already has one (a second tap, another phone): keep that card.
    if (/cq_person_cards_pkey/.test(insertError.message)) {
      const existing = await personCard(form.id, employeeId);
      if (existing) return existing;
    }
    // Someone else took this number or look a moment ago: draw again.
  }
  throw new ServiceError(503, "Kartu belum dapat diundi. Coba lagi sebentar lagi.");
}

/**
 * The character follows changed answers until the deadline; the level, look and number stay.
 * The current character stays while it is still among the best. A change that would make the
 * card the same as someone else's keeps the old character (and says so in the record).
 */
async function follow(form: QForm, row: PersonCardRow, answers: Answers, catalog: Catalog): Promise<PersonCardRow> {
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
    .select(PERSON_COLUMNS).maybeSingle();
  if (error) {
    if (error.code !== "23505") failed(error);
    const kept: Roll = { ...row.roll, changes: [...(row.roll.changes ?? []), { ...change, kept: "bentrok" as const }].slice(-20) };
    await client.from("cq_person_cards").update({ roll: kept }).eq("form_id", form.id).eq("employee_id", row.employee_id);
    return row;
  }
  return (data as PersonCardRow | null) ?? row;
}

/**
 * For someone who finished: their card, drawn now if they have none. A trial card from the draft
 * gives way to a real draw once the form is open. While answers may still change, the character
 * follows them. Null before the migration.
 */
export async function ensureCard(form: QForm, employeeId: string, answers: Answers): Promise<CardView | null> {
  const catalog = await catalogOf(form.id);
  if (!catalog) return null;
  let row = await personCard(form.id, employeeId);
  if (row?.trial && form.status !== "draf") {
    const { error } = await createPrivilegedClient().from("cq_person_cards").delete().eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", true);
    if (error) failed(error);
    row = null;
  }
  if (!row) row = await draw(form, employeeId, answers, catalog);
  else if (form.status === "draf" || editable(form)) row = await follow(form, row, answers, catalog);
  return viewOf(row, catalog);
}

/** After an answer changed: an existing card's character follows it. Never draws, never fails the answer. */
export async function followAnswers(form: QForm, employeeId: string, answers: Answers): Promise<void> {
  try {
    const row = await personCard(form.id, employeeId);
    if (!row || (row.trial && form.status !== "draf")) return;
    const catalog = await catalogOf(form.id);
    if (catalog) await follow(form, row, answers, catalog);
  } catch (error) {
    console.error("Kartu karakter belum dapat mengikuti jawaban", error);
  }
}

/* ---- Pictures --------------------------------------------------------------------------------- */

/** The storage key and slot number of one picture of the current catalog, or null. */
export async function artSlot(formId: string, kind: ArtKind, ref: string): Promise<{ key: string | null; number: number } | null> {
  const client = createPrivilegedClient();
  const { data, error } = kind === "karakter"
    ? await client.from("cq_cards").select("number,image_key").eq("form_id", formId).eq("id", ref).maybeSingle()
    : await client.from("cq_card_parts").select("number,image_key").eq("form_id", formId).eq("kind", kind).eq("number", Number(ref)).maybeSingle();
  if (error) { if (cardsMissing(error) || error.code === "22P02") return null; databaseError(error); }
  const row = data as { number: number; image_key: string | null } | null;
  return row ? { key: row.image_key, number: row.number } : null;
}

const localTypes: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

/**
 * The bytes of one picture: from private storage, or, only while developing without storage,
 * from the ignored folder .card-art (karakter-01.webp, latar-01.png …) to try the cards locally.
 */
export async function artBytes(formId: string, kind: ArtKind, ref: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const slot = await artSlot(formId, kind, ref);
  if (!slot) return null;
  const { isR2Configured, readObject } = await import("../r2");
  if (slot.key && isR2Configured()) return readObject(slot.key);
  if (process.env.NODE_ENV !== "development") return null;
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  for (const ext of Object.keys(localTypes)) {
    const bytes = await readFile(join(process.cwd(), ".card-art", `${kind}-${String(slot.number).padStart(2, "0")}.${ext}`)).catch(() => null);
    if (bytes) return { bytes: new Uint8Array(bytes), type: localTypes[ext] };
  }
  return null;
}
