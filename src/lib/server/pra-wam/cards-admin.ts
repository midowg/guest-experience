import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  artKeyFor, characterKey, topCharacters,
  type ArtKind, type ArtStart, type CharacterInput, type TiersInput,
} from "@/lib/pra-wam/cards";
import { editable, type AnswerValue, type Answers, type QuestionKind } from "@/lib/pra-wam/questionnaire";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignUpload, removeObjects, verifyUpload } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { cardsMissing, cardsWaiting, catalogOf, type Catalog, type Roll } from "./cards";
import { currentForm, formContent, questionnaireWaiting } from "./questionnaire";

/*
 * Admin WAM → Kuesioner → Kartu: HR keeps the characters (texts, score rules, picture), the
 * levels (odds adding up to 100 %, optional caps) and the look parts' pictures, and sees the
 * cards drawn so far with each draw's record. Writes are checked here. A character someone has
 * is hidden rather than deleted; at least one character stays visible.
 */

const failed = (error: { code?: string; message?: string }): never => {
  if (cardsMissing(error)) throw cardsWaiting();
  databaseError({ message: error.message ?? "", code: error.code });
};

async function formOrWait() {
  const form = await currentForm();
  if (!form) throw questionnaireWaiting();
  return form;
}

/** Questions a rule can point at: those with fixed options to pick. */
const ruleKinds: readonly QuestionKind[] = ["single", "multi"];
/** Never an anonymous, HR or HR-only answer: health and private data never pick a card (handoff 12 Nov 2026). */
const ruleVisible = (visibility: string) => !["anon", "hr", "hronly"].includes(visibility);

export type DrawnCard = {
  employeeId: string; name: string; department: string; serial: number | null; trial: boolean;
  characterId: string; tierKey: string; drawnAt: string; roll: Roll; dna: string;
  /** The tokoh card's figure (migration 202611130010), and the sentence on the card. */
  figureId: string | null; reason: string | null;
};
export type AdminCards = {
  catalog: Catalog;
  /** Questions rules may use, with their options. */
  questions: { key: string; prompt: string; options: string[] }[];
  drawn: DrawnCard[];
  /** Real cards whose character would change with the current rules and answers (before the deadline). */
  willChange: number;
  /** Whether characters still follow answers (the form is open and before its deadline). */
  following: boolean;
};

/** The catalog, the questions rules may use, and every card drawn; null before the migration. */
export async function adminCards(): Promise<AdminCards | null> {
  const form = await currentForm();
  if (!form) return null;
  const catalog = await catalogOf(form.id);
  if (!catalog) return null;
  const client = createPrivilegedClient();
  const [content, cards, people] = await Promise.all([
    formContent(form.id),
    client.from("cq_person_cards").select(`employee_id,card_id,tier_key,serial,trial,drawn_at,roll,dna${catalog.figuresReady ? ",figure_id,reason" : ""}`).eq("form_id", form.id).order("serial", { nullsFirst: false }),
    listPeople(),
  ]);
  if (cards.error) failed(cards.error);
  const byId = new Map(people.map(person => [person.id, person]));
  const rows = (cards.data ?? []) as unknown as { employee_id: string; card_id: string; tier_key: string; serial: number | null; trial: boolean; drawn_at: string; roll: Roll; dna: string; figure_id?: string | null; reason?: string | null }[];
  const drawn: DrawnCard[] = rows.map(row => ({
    employeeId: row.employee_id, name: byId.get(row.employee_id)?.fullName ?? "Tanpa nama", department: byId.get(row.employee_id)?.department ?? "",
    serial: row.serial, trial: row.trial, characterId: row.card_id, tierKey: row.tier_key, drawnAt: row.drawn_at, roll: row.roll, dna: row.dna,
    figureId: row.figure_id ?? null, reason: row.reason ?? null,
  }));

  // Who would change character: the current one is no longer among the best for their answers.
  // A tokoh card is locked once drawn: nothing follows the answers then.
  const following = editable(form) && !catalog.figures.some(figure => !figure.hidden);
  let willChange = 0;
  const real = rows.filter(row => !row.trial);
  if (following && real.length) {
    const keyOf = new Map(content.questions.map(question => [question.id, question.key]));
    const { data, error } = await client.from("cq_answers").select("employee_id,question_id,value").eq("form_id", form.id).in("employee_id", real.map(row => row.employee_id));
    if (error) failed(error);
    const answers = new Map<string, Answers>();
    for (const row of (data ?? []) as { employee_id: string; question_id: string; value: AnswerValue }[]) {
      const key = keyOf.get(row.question_id);
      if (!key) continue;
      answers.set(row.employee_id, { ...answers.get(row.employee_id), [key]: row.value });
    }
    willChange = real.filter(row => !topCharacters(catalog.characters, answers.get(row.employee_id) ?? {}).includes(row.card_id)).length;
  }

  const questions = content.questions.filter(question => ruleKinds.includes(question.kind) && !question.hidden && ruleVisible(question.visibility))
    .sort((a, b) => a.sort - b.sort).map(question => ({ key: question.key, prompt: question.prompt, options: question.options }));
  return { catalog, questions, drawn, willChange, following };
}

/** The levels' names, colours, odds and caps. The keys stay; odds add up to 100 % (checked by the schema). */
export async function saveTiers(input: TiersInput): Promise<void> {
  const form = await formOrWait();
  const catalog = await catalogOf(form.id);
  if (!catalog) throw cardsWaiting();
  const known = new Set(catalog.tiers.map(tier => tier.key));
  if (input.tiers.length !== known.size || input.tiers.some(tier => !known.has(tier.key))) throw new ServiceError(409, "Daftar level berubah. Muat ulang halaman.");
  const client = createPrivilegedClient();
  for (const tier of input.tiers) {
    const { error } = await client.from("cq_tiers").update({ name: tier.name, color: tier.color.toUpperCase(), odds: tier.odds, max_cards: tier.maxCards, line: tier.line })
      .eq("form_id", form.id).eq("key", tier.key);
    if (error) failed(error);
  }
}

/** Rules may only use a shown, named question with options, and one of its options. */
async function checkRules(formId: string, input: CharacterInput) {
  const content = await formContent(formId);
  const errors: Record<string, string[]> = {};
  input.rules.forEach((rule, index) => {
    const question = content.questions.find(item => item.key === rule.questionKey);
    if (!question || !ruleKinds.includes(question.kind) || !ruleVisible(question.visibility)) errors[`rules.${index}.questionKey`] = ["Pertanyaan ini tidak bisa dipakai untuk aturan."];
    else if (!question.options.includes(rule.option)) errors[`rules.${index}.option`] = ["Jawaban ini tidak ada lagi di pertanyaan itu."];
  });
  if (Object.keys(errors).length) throw new ServiceError(422, "Ada aturan yang perlu diperbaiki.", errors);
}

async function checkPartner(formId: string, partnerId: string | null, self?: string) {
  if (!partnerId) return;
  if (partnerId === self) throw new ServiceError(422, "Partner ideal tidak bisa karakter itu sendiri.", { partnerId: ["Pilih karakter lain."] });
  const { data, error } = await createPrivilegedClient().from("cq_cards").select("id").eq("form_id", formId).eq("id", partnerId).maybeSingle();
  if (error) failed(error);
  if (!data) throw new ServiceError(422, "Partner ideal tidak ditemukan.", { partnerId: ["Pilih dari daftar."] });
}

async function writeRules(cardId: string, rules: CharacterInput["rules"]) {
  const client = createPrivilegedClient();
  const { error } = await client.from("cq_card_rules").delete().eq("card_id", cardId);
  if (error) failed(error);
  if (!rules.length) return;
  const { error: insertError } = await client.from("cq_card_rules").insert(rules.map(rule => ({ card_id: cardId, question_key: rule.questionKey, option: rule.option, weight: rule.weight })));
  if (insertError) failed(insertError);
}

const fields = (input: CharacterInput) => ({
  name: input.name, figure: input.figure, class: input.class, title: input.title, description: input.description.trim(),
  powers: input.powers, partner_id: input.partnerId, hidden: input.hidden,
});

/** Keeps at least one character people can get. */
async function checkOneVisible(formId: string, leaving: string) {
  const { data, error } = await createPrivilegedClient().from("cq_cards").select("id").eq("form_id", formId).eq("hidden", false).neq("id", leaving).limit(1);
  if (error) failed(error);
  if (!data?.length) throw new ServiceError(409, "Minimal satu karakter harus tampil.");
}

/** A new character at the end, with the next picture number. */
export async function createCharacter(input: CharacterInput): Promise<{ id: string }> {
  const form = await formOrWait();
  await Promise.all([checkRules(form.id, input), checkPartner(form.id, input.partnerId)]);
  const client = createPrivilegedClient();
  const { data, error } = await client.from("cq_cards").select("number,key").eq("form_id", form.id);
  if (error) failed(error);
  const rows = (data ?? []) as { number: number; key: string }[];
  const number = Math.max(0, ...rows.map(row => row.number)) + 1;
  if (number > 99) throw new ServiceError(409, "Katalog sudah 99 karakter.");
  const taken = new Set(rows.map(row => row.key));
  const base = characterKey(input.name);
  let key = base;
  for (let suffix = 2; taken.has(key); suffix++) key = `${base.slice(0, 26)}-${suffix}`;
  const { data: created, error: insertError } = await client.from("cq_cards").insert({ form_id: form.id, number, key, ...fields(input) }).select("id").single();
  if (insertError) failed(insertError);
  const id = (created as { id: string }).id;
  await writeRules(id, input.rules);
  return { id };
}

/** One character's texts, rules, partner and visibility. */
export async function updateCharacter(id: string, input: CharacterInput): Promise<void> {
  const form = await formOrWait();
  await Promise.all([checkRules(form.id, input), checkPartner(form.id, input.partnerId, id)]);
  if (input.hidden) await checkOneVisible(form.id, id);
  const { data, error } = await createPrivilegedClient().from("cq_cards").update({ ...fields(input), updated_at: new Date().toISOString() }).eq("form_id", form.id).eq("id", id).select("id").maybeSingle();
  if (error) failed(error);
  if (!data) throw new ServiceError(404, "Karakter tidak ditemukan.");
  await writeRules(id, input.rules);
}

/** Deletes a character nobody has (with its picture); one someone has is hidden instead. */
export async function removeCharacter(id: string): Promise<{ hidden: boolean }> {
  const form = await formOrWait();
  await checkOneVisible(form.id, id);
  const client = createPrivilegedClient();
  // Since the tokoh card (13 Nov 2026) a character is a persona: its figures belong to it, and
  // hiding it would leave them out of the match. It stays; its old picture can go.
  const figures = await client.from("cq_figures").select("id", { count: "exact", head: true }).eq("form_id", form.id).eq("persona_id", id);
  if (!figures.error && figures.count) throw new ServiceError(409, `Karakter ini sekarang persona untuk ${figures.count} tokoh kartu, jadi tidak bisa dihapus atau disembunyikan. Gambar animenya bisa dihapus lewat Hapus gambar karakter lama.`);
  const { count, error } = await client.from("cq_person_cards").select("employee_id", { count: "exact", head: true }).eq("form_id", form.id).eq("card_id", id);
  if (error) failed(error);
  if (count) {
    const { error: hideError } = await client.from("cq_cards").update({ hidden: true, updated_at: new Date().toISOString() }).eq("form_id", form.id).eq("id", id);
    if (hideError) failed(hideError);
    return { hidden: true };
  }
  const { data, error: deleteError } = await client.from("cq_cards").delete().eq("form_id", form.id).eq("id", id).select("image_key").maybeSingle();
  if (deleteError) failed(deleteError);
  const key = (data as { image_key: string | null } | null)?.image_key;
  if (key && isR2Configured()) await removeObjects([key]).catch(() => undefined);
  return { hidden: false };
}

/**
 * The characters' old anime pictures (13 Nov 2026): the tokoh card never shows them, so Admin WAM
 * can clear them. The personas stay. Returns how many pictures went.
 */
export async function removeCharacterArt(): Promise<number> {
  const form = await formOrWait();
  const client = createPrivilegedClient();
  const { data, error } = await client.from("cq_cards").select("id,image_key").eq("form_id", form.id).not("image_key", "is", null);
  if (error) failed(error);
  const rows = (data ?? []) as { id: string; image_key: string }[];
  if (!rows.length) return 0;
  const { error: clearError } = await client.from("cq_cards").update({ image_key: null, image_updated_at: new Date().toISOString() }).eq("form_id", form.id).in("id", rows.map(row => row.id));
  if (clearError) failed(clearError);
  if (isR2Configured()) await removeObjects(rows.map(row => row.image_key)).catch(() => undefined);
  return rows.length;
}

/** Removes the trial cards Admin WAM drew while trying the draft. */
export async function removeTrials(): Promise<number> {
  const form = await formOrWait();
  const { data, error } = await createPrivilegedClient().from("cq_person_cards").delete().eq("form_id", form.id).eq("trial", true).select("employee_id");
  if (error) failed(error);
  return data?.length ?? 0;
}

/* ---- Pictures, in two steps like profile photos ------------------------------------------------ */

const TOKEN_SECONDS = 15 * 60;
const notReady = () => new ServiceError(503, "Penyimpanan gambar belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");

function signature(key: string, input: ArtStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`kartu\0${key}\0${input.kind}\0${input.ref}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}

/** The slot a picture fills: a character or a figure (by id) or a look part (by number), with its picture number. */
async function slotOf(formId: string, kind: ArtKind, ref: string): Promise<{ number: number; key: string | null }> {
  const client = createPrivilegedClient();
  const { data, error } = kind === "karakter" || kind === "tokoh"
    ? await client.from(kind === "karakter" ? "cq_cards" : "cq_figures").select("number,image_key").eq("form_id", formId).eq("id", ref).maybeSingle()
    : await client.from("cq_card_parts").select("number,image_key").eq("form_id", formId).eq("kind", kind).eq("number", Number(ref)).maybeSingle();
  if (error) failed(error);
  if (!data) throw new ServiceError(404, "Tempat gambar ini tidak ditemukan. Muat ulang halaman.");
  const row = data as { number: number; image_key: string | null };
  return { number: row.number, key: row.image_key };
}

/** Step one: where to put the picture, and a token to confirm it with. */
export async function startArtUpload(input: ArtStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  const form = await formOrWait();
  const slot = await slotOf(form.id, input.kind, input.ref);
  const key = artKeyFor(input.kind, slot.number, randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, expires)}` };
}

export function artTokenMatches(token: string, key: string, input: ArtStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, expires), "hex"));
}

/** Step two: the picture is there with the agreed size and is WebP, PNG or JPEG; then it fills the slot. */
export async function confirmArtUpload(input: ArtStart & { key: string; token: string }): Promise<void> {
  if (!isR2Configured()) throw notReady();
  if (!input.key.startsWith("pra-wam/kartu/") || !artTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try { await verifyUpload(input.key, input.size, ["webp", "png", "jpeg"]); } catch (error) { await discard(); throw error; }
  const form = await formOrWait();
  const slot = await slotOf(form.id, input.kind, input.ref);
  const now = new Date().toISOString();
  const client = createPrivilegedClient();
  const { error } = input.kind === "karakter" || input.kind === "tokoh"
    ? await client.from(input.kind === "karakter" ? "cq_cards" : "cq_figures").update({ image_key: input.key, image_updated_at: now }).eq("form_id", form.id).eq("id", input.ref)
    : await client.from("cq_card_parts").update({ image_key: input.key, image_updated_at: now }).eq("form_id", form.id).eq("kind", input.kind).eq("number", Number(input.ref));
  if (error) { await discard(); failed(error); }
  if (slot.key && slot.key !== input.key) await removeObjects([slot.key]).catch(() => undefined);
}
