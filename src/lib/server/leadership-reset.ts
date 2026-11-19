import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  answersToStore, exportColumns, formState, LR_MIGRATION, looksLikeKey, newKey, normalizeContent, targetLabels, wibInstantLabel,
  type AnswerInput, type CmsView, type CoachResponse, type CoachView, type FormSave, type LrContent, type OwnAnswer, type StoredAnswer, type TargetStatus,
} from "@/lib/leadership-reset/form";
import { ServiceError } from "./config";
import { databaseError } from "./http";
import { createPrivilegedClient } from "./supabase/admin";
import { writeXlsx } from "./xlsx-write";

/*
 * Refleksi Leader (migration 202611250001): one form row (its text, open or closed, the CMS and
 * coach keys as sha256) and the answers. No sign-in: every reader proves a key. The CMS never gets
 * what a leader wrote; the coach gets everything. Before the migration the form shows its default
 * text and takes no answers, and the CMS and coach pages say they wait for it.
 */

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /lr_(form|responses)/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Refleksi Leader menunggu migrasi ${LR_MIGRATION}. Pemilik menjalankannya di Supabase SQL Editor.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

const hashOf = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");
function sameHash(key: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashOf(key), "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type FormRow = { content: unknown; is_open: boolean; admin_key_hash: string; coach_key_hash: string | null; coach_key_at: string | null; coach_seen_at: string | null };
type ResponseRow = { id: string; name: string; team: string; target_status: TargetStatus; answers: StoredAnswer[]; created_at: string; updated_at: string };

async function formRow(): Promise<FormRow | null> {
  const { data, error } = await createPrivilegedClient().from("lr_form").select("content,is_open,admin_key_hash,coach_key_hash,coach_key_at,coach_seen_at").eq("id", 1).maybeSingle();
  if (error) fail(error);
  return data as FormRow | null;
}

export type PublicForm = { migrated: boolean; content: LrContent; isOpen: boolean };

/** The form as a leader sees it. Before the migration: the default text, closed. */
export async function publicForm(): Promise<PublicForm> {
  try {
    const row = await formRow();
    if (!row) return { migrated: false, content: normalizeContent(null), isOpen: false };
    return { migrated: true, content: normalizeContent(row.content), isOpen: row.is_open };
  } catch (error) {
    if (error instanceof ServiceError && error.status === 503) return { migrated: false, content: normalizeContent(null), isOpen: false };
    throw error;
  }
}

const own = (row: ResponseRow): OwnAnswer => ({ name: row.name, team: row.team, targetStatus: row.target_status, answers: row.answers ?? [], createdAt: row.created_at, updatedAt: row.updated_at });

/** Save a leader's answer: new under their key, or changed while the form is open. */
export async function saveAnswer(input: AnswerInput): Promise<OwnAnswer> {
  const row = await formRow();
  if (!row) throw waiting();
  const content = normalizeContent(row.content);
  const state = formState(row.is_open, content.deadline);
  if (state !== "open") throw new ServiceError(409, state === "past" ? "Batas waktu pengisian sudah lewat. Jawaban tidak bisa dikirim atau diubah lagi." : "Form sedang ditutup. Jawaban tidak bisa dikirim atau diubah.");
  const { answers, missing: empty } = answersToStore(input, content.questions);
  if (empty) throw new ServiceError(422, "Ada pertanyaan wajib yang belum dijawab.", { [`answers.${empty}`]: ["Pertanyaan ini wajib dijawab."] });
  const now = new Date().toISOString();
  const { data, error } = await createPrivilegedClient().from("lr_responses")
    .upsert({ name: input.name.trim(), team: input.team.trim(), target_status: input.targetStatus, answers, own_key_hash: hashOf(input.key), updated_at: now }, { onConflict: "own_key_hash" })
    .select("id,name,team,target_status,answers,created_at,updated_at").single();
  if (error) fail(error);
  return own(data as ResponseRow);
}

/** A leader's own answer, by their key; null when there is none under it. */
export async function readOwnAnswer(key: string): Promise<OwnAnswer | null> {
  if (!looksLikeKey(key)) return null;
  const { data, error } = await createPrivilegedClient().from("lr_responses").select("id,name,team,target_status,answers,created_at,updated_at").eq("own_key_hash", hashOf(key)).maybeSingle();
  if (error) fail(error);
  return data ? own(data as ResponseRow) : null;
}

const notFound = () => new ServiceError(404, "Tautan ini tidak dikenal atau sudah diganti. Minta tautan terbaru ke panitia.");

/**
 * The form row for the CMS. Decided 19 Nov 2026: the CMS opens for anyone at /refleksi/kelola, no
 * key and no sign-in (the owner's choice; the answers themselves stay behind the coach's link).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the callers still pass the old key
async function cmsRow(_key: string | null): Promise<FormRow> {
  const row = await formRow();
  if (!row) throw waiting();
  return row;
}

/** Does `key` open the CMS? For the page: false for an unknown key, null before the migration. */
export async function opensCms(key: string): Promise<boolean | null> {
  try { await cmsRow(key); return true; } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return false;
    if (error instanceof ServiceError && error.status === 503) return null;
    throw error;
  }
}

export async function cmsView(key: string | null): Promise<CmsView> {
  const row = await cmsRow(key);
  const { data, error } = await createPrivilegedClient().from("lr_responses").select("id,name,team,target_status,created_at,updated_at").order("created_at", { ascending: false }).limit(2000);
  if (error) fail(error);
  const content = normalizeContent(row.content);
  return {
    migrated: true, content, isOpen: row.is_open, state: formState(row.is_open, content.deadline),
    coach: { linked: !!row.coach_key_hash, createdAt: row.coach_key_at, seenAt: row.coach_seen_at },
    responses: (data as Omit<ResponseRow, "answers">[]).map(item => ({ id: item.id, name: item.name, team: item.team, targetStatus: item.target_status, createdAt: item.created_at, updatedAt: item.updated_at })),
  };
}

export async function saveForm(key: string | null, input: FormSave): Promise<CmsView> {
  await cmsRow(key);
  const { error } = await createPrivilegedClient().from("lr_form").update({ content: input.content, is_open: input.isOpen, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) fail(error);
  return cmsView(key);
}

/** A new coach link (the old one stops working). The key is returned once; only its hash is kept. */
export async function newCoachKey(key: string | null): Promise<{ coachKey: string; view: CmsView }> {
  await cmsRow(key);
  const coachKey = newKey();
  const { error } = await createPrivilegedClient().from("lr_form").update({ coach_key_hash: hashOf(coachKey), coach_key_at: new Date().toISOString(), coach_seen_at: null }).eq("id", 1);
  if (error) fail(error);
  return { coachKey, view: await cmsView(key) };
}

/** A new CMS link (the old one stops working at once). */
export async function newCmsKey(key: string | null): Promise<{ cmsKey: string }> {
  await cmsRow(key);
  const cmsKey = newKey();
  const { error } = await createPrivilegedClient().from("lr_form").update({ admin_key_hash: hashOf(cmsKey), updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) fail(error);
  return { cmsKey };
}

export async function deleteResponse(key: string | null, id: string): Promise<CmsView> {
  await cmsRow(key);
  const { error } = await createPrivilegedClient().from("lr_responses").delete().eq("id", id);
  if (error) fail(error);
  return cmsView(key);
}

/* --- The coach --- */

async function coachRow(key: string | null): Promise<FormRow> {
  if (!looksLikeKey(key)) throw notFound();
  const row = await formRow();
  if (!row) throw waiting();
  if (!sameHash(key, row.coach_key_hash)) throw notFound();
  return row;
}

/** Does `key` open the coach's page? null before the migration. */
export async function opensCoach(key: string): Promise<boolean | null> {
  try { await coachRow(key); return true; } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return false;
    if (error instanceof ServiceError && error.status === 503) return null;
    throw error;
  }
}

/** Every answer, newest first; the CMS sees when the coach last opened them. */
export async function coachView(key: string | null): Promise<CoachView> {
  const row = await coachRow(key);
  const client = createPrivilegedClient();
  const [{ data, error }] = await Promise.all([
    client.from("lr_responses").select("id,name,team,target_status,answers,created_at,updated_at").order("created_at", { ascending: false }).limit(2000),
    client.from("lr_form").update({ coach_seen_at: new Date().toISOString() }).eq("id", 1),
  ]);
  if (error) fail(error);
  const responses: CoachResponse[] = (data as ResponseRow[]).map(item => ({ id: item.id, name: item.name, team: item.team, targetStatus: item.target_status, answers: item.answers ?? [], createdAt: item.created_at, updatedAt: item.updated_at }));
  return { content: normalizeContent(row.content), responses };
}

/** The answers as an Excel file: one row per leader, one column per question. */
export async function coachExcel(key: string | null): Promise<Buffer> {
  const { content, responses } = await coachView(key);
  const columns = exportColumns(content.questions, responses);
  const rows = [
    ["Nama", "Tim / divisi", "Capaian target", "Dikirim", "Diperbarui", ...columns.map(column => column.label)],
    ...[...responses].sort((a, b) => a.name.localeCompare(b.name, "id")).map(response => [
      response.name, response.team, targetLabels[response.targetStatus], wibInstantLabel(response.createdAt), wibInstantLabel(response.updatedAt),
      ...columns.map(column => response.answers.find(answer => answer.id === column.id)?.text ?? ""),
    ]),
  ];
  return writeXlsx([{ name: "Refleksi", rows, widths: [24, 22, 18, 20, 20, ...columns.map(() => 60)] }]);
}
