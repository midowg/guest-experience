import "server-only";
import { createHmac } from "node:crypto";
import { MODUL_MIGRATION } from "@/lib/main-wam/modul/absen";
import {
  controlPatch, participantMessage, pickSilent, recapReady, shuffle, SILENT_MAX_SENDS, topicCounts, type SilentAction, type SilentFeedbackInput, type SilentRecap, type SilentView,
} from "@/lib/main-wam/modul/silent";
import { SILENT_COLUMNS, silentFromRow } from "@/lib/main-wam/rows";
import type { MainWamViewer } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, mwWaiting } from "../errors";
import { trySendMainWamNote } from "../notes";
import { allSessions, silentQuestions } from "../read";

/*
 * Silent Meeting on the server (T01–T03, B05; KONTRAK §8, RISET §7). Feedback is written by
 * mw_silent_send (migration 202611200401): the text and the sender's count in one statement, the
 * count under an HMAC of the person, never linked to the text. Nothing here logs a feedback's text
 * with its sender. The open state is the server's (silentState); the database repeats it.
 */

const db = () => createPrivilegedClient();

/** HMAC-SHA256(WAM_SESSION_SECRET, "mw-silent\0" + question + "\0" + person), hex 64 (KONTRAK §8). */
export function participantKey(questionId: string, employeeId: string): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login WAM belum disiapkan.");
  return createHmac("sha256", secret).update(participantMessage(questionId, employeeId)).digest("hex");
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

/** How many feedbacks this person has sent to a question (0 before the migration). */
export async function mySentCount(questionId: string, employeeId: string): Promise<number> {
  const { data, error } = await db().from("mw_silent_participation").select("sent").eq("question_id", questionId).eq("participant_key", participantKey(questionId, employeeId)).maybeSingle();
  if (error) { if (mwMissing(error)) return 0; databaseError(error); }
  return (data as { sent: number } | null)?.sent ?? 0;
}

/** How many feedbacks, and from how many people. */
export async function silentCounts(questionId: string): Promise<{ count: number; people: number }> {
  const [feedback, people] = await Promise.all([
    db().from("mw_silent_feedback").select("id", { count: "exact", head: true }).eq("question_id", questionId),
    db().from("mw_silent_participation").select("participant_key", { count: "exact", head: true }).eq("question_id", questionId),
  ]);
  if (feedback.error) { if (mwMissing(feedback.error)) return { count: 0, people: 0 }; databaseError(feedback.error); }
  return { count: feedback.count ?? 0, people: people.error ? 0 : people.count ?? 0 };
}

const closed = () => new ServiceError(409, "Silent Meeting sudah ditutup. Tulisanmu tetap di HP ini.");

/** T01 → T02: one anonymous feedback. Returns how many this person has sent and may still send. */
export async function sendSilentFeedback(input: SilentFeedbackInput, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<{ sent: number; remaining: number }> {
  const view = await silentById(input.questionId, now);
  if (!view) throw new ServiceError(404, "Silent Meeting tidak ditemukan.");
  if (view.state === "belum") throw new ServiceError(409, "Silent Meeting belum dibuka.");
  if (view.state === "tutup") throw closed();
  if (input.topic && !view.question.topics.includes(input.topic)) throw new ServiceError(422, "Pilih topik dari daftar.");
  const { data, error } = await db().rpc("mw_silent_send", {
    p_question: input.questionId, p_participant: participantKey(input.questionId, viewer.id), p_topic: input.topic, p_body: input.body, p_max: SILENT_MAX_SENDS,
  });
  if (error) {
    const message = error.message ?? "";
    if (/silent_closed/.test(message)) throw closed();
    if (/silent_limit/.test(message)) throw new ServiceError(429, `Kamu sudah mengirim ${SILENT_MAX_SENDS} masukan untuk Silent Meeting ini.`);
    if (/silent_topic/.test(message)) throw new ServiceError(422, "Pilih topik dari daftar.");
    if (/silent_unknown/.test(message)) throw new ServiceError(404, "Silent Meeting tidak ditemukan.");
    if (["42883", "PGRST202"].includes(error.code ?? "")) throw mwWaiting(MODUL_MIGRATION);
    mwFail(error, MODUL_MIGRATION);
  }
  const sent = typeof data === "number" ? data : Number(data) || 1;
  return { sent, remaining: Math.max(0, SILENT_MAX_SENDS - sent) };
}

/**
 * Panitia opens or closes it by hand, or hands it back to the session's hours (K02's row, agen C,
 * calls this through mainWamApi.silentControl). Opening by hand tells everyone (the hours open it
 * without a note: that needs a scheduled job, KONTRAK §10).
 */
export async function controlSilent(questionId: string, action: SilentAction, viewer: Pick<MainWamViewer, "id">, now: Date): Promise<SilentView> {
  const before = await silentById(questionId, now);
  if (!before) throw new ServiceError(404, "Silent Meeting tidak ditemukan.");
  const { data, error } = await db().from("mw_silent_questions").update({ ...controlPatch(action, viewer.id, now), updated_at: now.toISOString() }).eq("id", questionId).select(SILENT_COLUMNS).maybeSingle();
  if (error) mwFail(error);
  if (!data) throw new ServiceError(404, "Silent Meeting tidak ditemukan.");
  const sessions = await allSessions();
  const after = pickSilent([silentFromRow(data as Record<string, unknown>)], sessions.data, now, before.session.id)!;
  if (before.state !== "buka" && after.state === "buka") {
    await trySendMainWamNote({
      kind: "silent", title: "Silent Meeting dibuka", body: `${after.question.question} Kirim masukan tanpa nama.`,
      to: { audience: { type: "semua" } }, link: mainWamPath.silentMeeting(after.session.id), by: viewer.id, tag: `sesi-${after.session.id}`, except: viewer.id,
    });
  }
  return after;
}

export type { SilentRecap };

/** B05 for the BOD: the last closed Silent Meeting (or the open one, waiting), with its recap when ready. */
export async function silentRecap(now: Date): Promise<{ recap: SilentRecap | null; migrated: boolean }> {
  const [questions, sessions] = await Promise.all([silentQuestions(), allSessions()]);
  const views = questions.data.map(question => pickSilent([question], sessions.data, now, question.sessionId)).filter((view): view is SilentView => !!view && view.state !== "belum");
  const closedViews = views.filter(view => view.state === "tutup").sort((a, b) => Date.parse(b.session.startsAt) - Date.parse(a.session.startsAt));
  const view = closedViews[0] ?? views.find(item => item.state === "buka") ?? null;
  if (!view) return { recap: null, migrated: questions.migrated };
  const { count, people } = await silentCounts(view.question.id);
  const ready = recapReady(view, count, people);
  if (!ready) return { recap: { view, count, people, ready, topics: [], items: [] }, migrated: true };
  const { data, error } = await db().from("mw_silent_feedback").select("id,topic,body").eq("question_id", view.question.id).limit(2000);
  if (error) mwFail(error);
  const items = shuffle((data ?? []) as { id: string; topic: string; body: string }[]);
  return { recap: { view, count, people, ready, topics: topicCounts(items, view.question.topics), items }, migrated: true };
}
