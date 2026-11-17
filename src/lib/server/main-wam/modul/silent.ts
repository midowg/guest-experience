import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { silentShownCount, type SilentResult } from "@/lib/main-wam/module-state";
import { MODUL_MIGRATION } from "@/lib/main-wam/modul/absen";
import {
  controlRefusal, openerMessage, pickSilent, recapReady, shuffle, SILENT_KEY_INFO, SILENT_SEND_LIMIT, SILENT_SEND_WINDOW_MS, topicCounts,
  type SilentAction, type SilentFeedbackInput, type SilentRecap, type SilentView,
} from "@/lib/main-wam/modul/silent";
import type { MainWamViewer } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwWaiting, type DbError } from "../errors";
import { trySendMainWamNote } from "../notes";
import { allSessions, silentQuestions, silentResults } from "../read";
import { limitInMemory, remainingInMemory } from "./memory-limit";

/*
 * Silent Meeting on the server (T01–T03, B05; KONTRAK §8, RISET §7; audit H1, H2, L7, L12).
 * - A send writes one feedback and nothing else (mw_silent_send, migration 202611200401): no person,
 *   no count, no time, and no other row in its transaction. Its limit per person is in this
 *   instance's memory only (memory-limit.ts).
 * - Who opened the form is a separate request when T01 loads (mw_silent_open), under an HMAC with a
 *   key of Silent Meeting's own (silentKey), once per question.
 * - No count of an open Silent Meeting leaves here: counts come from mw_silent_results, which only
 *   has closed ones, and are shown only through silentShownCount (5 feedbacks of 5 people).
 * - Closed is final: panitia's "buka" is refused once it closed, here and in the database.
 * - Nothing here logs; the database answers expected refusals with a word, not an error, so no
 *   failed statement carrying the text reaches its log.
 */

const db = () => createPrivilegedClient();
const FUNCTION_MISSING = ["42883", "PGRST202"];
const failed = (error: DbError): never => {
  if (FUNCTION_MISSING.includes(error.code ?? "")) throw mwWaiting(MODUL_MIGRATION);
  return mwFail(error, MODUL_MIGRATION);
};

/**
 * Silent Meeting's own key (audit L7): HKDF-SHA256 of MW_SILENT_SECRET when set (at least 32
 * characters; keep it for the whole event), else of WAM_SESSION_SECRET, with info "mw-silent-v1".
 * Rotating the session secret then never changes who counts as a different opener.
 */
export function silentKey(): Buffer {
  const own = process.env.MW_SILENT_SECRET?.trim() ?? "";
  if (own && own.length < 32) throw new ServiceError(503, "Silent Meeting belum disiapkan. MW_SILENT_SECRET minimal 32 karakter.");
  const secret = own || praWamSecret();
  if (!secret) throw new ServiceError(503, "Login WAM belum disiapkan.");
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), SILENT_KEY_INFO, 32));
}

/** HMAC-SHA256(silentKey, "mw-silent-open\0" + question + "\0" + person), hex 64 (KONTRAK §8). */
export function openerKey(questionId: string, employeeId: string): string {
  return createHmac("sha256", silentKey()).update(openerMessage(questionId, employeeId)).digest("hex");
}

/** The Silent Meeting a screen shows (of a session, or the open/next/last one), with its state now. */
export async function silentNow(now: Date, sessionId?: string | null): Promise<{ view: SilentView | null; migrated: boolean }> {
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  return { view: pickSilent(questions.data, sessions.data, now, sessionId), migrated: questions.migrated && sessions.migrated };
}

/** One question by id with its state. */
export async function silentById(questionId: string, now: Date): Promise<SilentView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return null;
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  const question = questions.data.find(item => item.id === questionId);
  return question ? pickSilent([question], sessions.data, now, question.sessionId) : null;
}

/** The counts of a question closed for good, or null (open, not yet, or before the migration). */
async function resultOf(questionId: string): Promise<SilentResult | null> {
  const { data } = await silentResults();
  return data.get(questionId) ?? null;
}

/** The one number anyone sees (T03, BOD): the feedbacks of a closed one with 5 feedbacks of 5 people, else null. */
export async function silentShownCountOf(view: Pick<SilentView, "state" | "question">): Promise<number | null> {
  return view.state === "tutup" ? silentShownCount(await resultOf(view.question.id)) : null;
}

const closed = () => new ServiceError(409, "Silent Meeting sudah ditutup. Tulisanmu tetap di HP ini.");
const notYet = () => new ServiceError(409, "Silent Meeting belum dibuka.");
const notFound = () => new ServiceError(404, "Silent Meeting tidak ditemukan.");
const sendScope = (questionId: string) => `silent-kirim\0${questionId}`;

/** How many more this person may send now (this instance's memory; the screen hides Tulis lagi at 0). */
export const sendsLeft = (questionId: string, viewer: Pick<MainWamViewer, "id">) => remainingInMemory(sendScope(questionId), viewer.id, SILENT_SEND_LIMIT);

/**
 * T01 loaded while open: this person opened the form (once per question; the threshold's "5
 * different people"). A separate request from any send, so no feedback shares its transaction.
 */
export async function recordOpener(questionId: string, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<void> {
  const view = await silentById(questionId, now);
  if (!view) throw notFound();
  if (view.state === "belum") throw notYet();
  if (view.state === "tutup") throw closed();
  limitInMemory("silent-buka", `${questionId}\0${viewer.id}`, 30, SILENT_SEND_WINDOW_MS, now.getTime());
  const { data, error } = await db().rpc("mw_silent_open", { p_question: questionId, p_opener: openerKey(questionId, viewer.id) });
  if (error) failed(error);
  if (data === "closed") throw closed();
  if (data === "unknown") throw notFound();
  if (data !== "ok") throw new ServiceError(503, "Belum berhasil. Coba lagi sebentar.");
}

/** T01 → T02: one anonymous feedback. Returns how many more this person may send now. */
export async function sendSilentFeedback(input: SilentFeedbackInput, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<{ remaining: number }> {
  const view = await silentById(input.questionId, now);
  if (!view) throw notFound();
  if (view.state === "belum") throw notYet();
  if (view.state === "tutup") throw closed();
  if (input.topic && !view.question.topics.includes(input.topic)) throw new ServiceError(422, "Pilih topik dari daftar.");
  const { remaining } = limitInMemory(sendScope(input.questionId), viewer.id, SILENT_SEND_LIMIT, SILENT_SEND_WINDOW_MS, now.getTime());
  const { data, error } = await db().rpc("mw_silent_send", { p_question: input.questionId, p_topic: input.topic, p_body: input.body });
  if (error) failed(error);
  switch (data) {
    case "ok": return { remaining };
    case "closed": throw closed();
    case "topic": throw new ServiceError(422, "Pilih topik dari daftar.");
    case "invalid": throw new ServiceError(422, "Tulis masukanmu dulu, paling banyak 1.000 karakter.");
    case "unknown": throw notFound();
    case "full": throw new ServiceError(409, "Silent Meeting ini sudah menerima masukan terbanyak.");
    default: throw new ServiceError(503, "Belum berhasil. Coba lagi sebentar.");
  }
}

/**
 * Panitia's hand (K02's row, agen C, through mainWamApi.silentControl): "buka" before the start
 * (once; everyone is told, at most once per question), "tutup" while open (final, then counted and
 * shuffled). A closed one never opens again. Answers its state, and a count only once closed with
 * 5 feedbacks of 5 people.
 */
export async function controlSilent(questionId: string, action: SilentAction, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<{ view: SilentView; count: number | null }> {
  const before = await silentById(questionId, now);
  if (!before) throw notFound();
  const refused = controlRefusal(before.state, action);
  if (refused) throw new ServiceError(refused.status, refused.message);
  const { data, error } = await db().rpc("mw_silent_control", { p_question: questionId, p_action: action, p_by: viewer.id });
  if (error) failed(error);
  if (data === "unknown") throw notFound();
  if (data === "final") throw new ServiceError(409, action === "buka" ? "Silent Meeting yang sudah ditutup tidak bisa dibuka lagi." : "Silent Meeting sudah ditutup.");
  if (data === "already_open") throw new ServiceError(409, "Silent Meeting sudah dibuka.");
  if (data === "not_open") throw notYet();
  if (data !== "opened" && data !== "closed") throw new ServiceError(503, "Belum berhasil. Coba lagi sebentar.");
  const after = (await silentById(questionId, now)) ?? before;
  // Only the one transition from not opened to opened tells everyone: at most once per question.
  if (data === "opened") {
    await trySendMainWamNote({
      kind: "silent", title: "Silent Meeting dibuka", body: `${after.question.question} Kirim masukan tanpa nama.`,
      to: { audience: { type: "semua" } }, link: mainWamPath.silentMeeting(after.session.id), by: viewer.id, tag: `sesi-${after.session.id}`, except: viewer.id,
    });
  }
  return { view: after, count: data === "closed" ? await silentShownCountOf(after) : null };
}

export type { SilentRecap };

/**
 * B05 for the BOD: the last closed Silent Meeting (or the open one, waiting). Its feedback, shuffled
 * and without time, and its count only once closed for good with 5 feedbacks of 5 people.
 */
export async function silentRecap(now: Date): Promise<{ recap: SilentRecap | null; migrated: boolean }> {
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  const views = questions.data.map(question => pickSilent([question], sessions.data, now, question.sessionId)).filter((view): view is SilentView => !!view && view.state !== "belum");
  const closedViews = views.filter(view => view.state === "tutup").sort((a, b) => Date.parse(b.session.startsAt) - Date.parse(a.session.startsAt));
  const view = closedViews[0] ?? views.find(item => item.state === "buka") ?? null;
  if (!view) return { recap: null, migrated: questions.migrated };
  const waiting: SilentRecap = { view, ready: false, count: null, topics: [], items: [] };
  if (view.state !== "tutup") return { recap: waiting, migrated: true };
  const result = await resultOf(view.question.id);
  if (!result || !recapReady(view, result)) return { recap: waiting, migrated: true };
  const { data, error } = await db().from("mw_silent_feedback").select("id,topic,body").eq("question_id", view.question.id).limit(2000);
  if (error) failed(error);
  const items = shuffle((data ?? []) as { id: string; topic: string; body: string }[]);
  return { recap: { view, ready: true, count: result.feedback, topics: topicCounts(items, view.question.topics), items }, migrated: true };
}
