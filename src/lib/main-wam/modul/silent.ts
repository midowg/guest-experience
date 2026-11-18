import { z } from "zod";
import { clock as clockOf, t, type Lang } from "../i18n";
import { silentClosesAt, silentRecapReady, silentState, type SilentResult, type SilentState } from "../module-state";
import { sessionEnd, timeRange, wibDate, wibTime } from "../rundown";
import type { MwSession, MwSilentQuestion } from "../types";

/*
 * Silent Meeting (T01–T03, B05; RISET §7, KONTRAK §8): anonymous feedback during one session.
 * - Opens at its session's start and closes at its end; panitia may open it earlier and close it
 *   earlier, each once. Closed is final (silentState, fondasi; the database holds the same rule).
 * - Feedback is stored alone: no person, device or time, a random (v4) id, and no other row naming
 *   anyone in its transaction (audit H1). The limit per person lives in the server's memory only.
 * - Who opened the form while it was open is recorded by a separate request when T01 loads, under an
 *   HMAC of the person (openerMessage), once per question: the threshold's "5 different people".
 * - No count of an open Silent Meeting leaves the server (audit H2). Once closed for good: the
 *   recap (shuffled, no time) and its count, only from 5 feedbacks and 5 people who opened it.
 * Pure.
 */

export const SILENT_BODY_MAX = 1000;
/** Sends per person per question in 10 minutes, counted in the server's memory (best effort, never in the database). */
export const SILENT_SEND_LIMIT = 10;
export const SILENT_SEND_WINDOW_MS = 10 * 60_000;
/** People who opened it, and feedbacks, before anyone reads anything (Viva Glint, Culture Amp: 5). */
export const SILENT_MIN_PEOPLE = 5;

/** The info of the key derived for Silent Meeting only: HKDF-SHA256(MW_SILENT_SECRET or WAM_SESSION_SECRET, info) (audit L7). */
export const SILENT_KEY_INFO = "mw-silent-v1";
/** What the HMAC of an opener is taken of (KONTRAK §8). */
export const openerMessage = (questionId: string, employeeId: string) => `mw-silent-open\0${questionId}\0${employeeId}`;

export const silentFeedbackSchema = z.object({
  questionId: z.uuid("Silent Meeting tidak dikenali."),
  topic: z.string().trim().max(40, "Topik terlalu panjang.").default(""),
  body: z.string().trim().min(1, "Tulis masukanmu dulu.").max(SILENT_BODY_MAX, "Masukan paling banyak 1.000 karakter."),
}).strict();
export type SilentFeedbackInput = z.infer<typeof silentFeedbackSchema>;

/** T01 loaded: the question whose form this person opened. */
export const silentOpenSchema = z.object({ questionId: z.uuid("Silent Meeting tidak dikenali.") }).strict();

/** Panitia's hand (K02): "Buka sekarang" before the start, "Tutup sekarang" while open (final). */
export const SILENT_ACTIONS = ["buka", "tutup"] as const;
export type SilentAction = (typeof SILENT_ACTIONS)[number];
export const silentControlSchema = z.object({ action: z.enum(SILENT_ACTIONS, "Pilih buka atau tutup.") }).strict();

/** Why panitia's action is refused now; null when it may go ahead. Closed is final: never opened again. */
export function controlRefusal(state: SilentState, action: SilentAction): { status: number; message: string } | null {
  if (action === "buka") {
    if (state === "tutup") return { status: 409, message: "Silent Meeting yang sudah ditutup tidak bisa dibuka lagi." };
    if (state === "buka") return { status: 409, message: "Silent Meeting sudah dibuka." };
    return null;
  }
  if (state === "tutup") return { status: 409, message: "Silent Meeting sudah ditutup." };
  if (state === "belum") return { status: 409, message: "Silent Meeting belum dibuka." };
  return null;
}

/** "15.00". */

/** One question with its session and state, as the screens and APIs pass it around. */
export type SilentView = {
  question: Pick<MwSilentQuestion, "id" | "sessionId" | "question" | "topics" | "openedAt" | "closedAt">;
  session: Pick<MwSession, "id" | "title" | "place" | "startsAt" | "endsAt" | "status">;
  state: SilentState;
  /** When it closes by itself: its session's end (null once closed). */
  closesAt: string | null;
};
export function silentView(question: MwSilentQuestion, session: MwSession, now: Date): SilentView {
  return {
    question: { id: question.id, sessionId: question.sessionId, question: question.question, topics: question.topics, openedAt: question.openedAt, closedAt: question.closedAt },
    session: { id: session.id, title: session.title, place: session.place, startsAt: session.startsAt, endsAt: session.endsAt, status: session.status },
    state: silentState(question, session, now),
    closesAt: silentClosesAt(question, session),
  };
}

/**
 * Which Silent Meeting a screen opens without a session given: the open one, else the next to
 * open, else the last that closed (draft sessions never). Null when there is none.
 */
export function pickSilent(questions: readonly MwSilentQuestion[], sessions: readonly MwSession[], now: Date, sessionId?: string | null): SilentView | null {
  const byId = new Map(sessions.map(session => [session.id, session]));
  const views = questions.flatMap(question => {
    const session = byId.get(question.sessionId);
    return session && session.status !== "draf" ? [silentView(question, session, now)] : [];
  });
  if (sessionId) return views.find(view => view.session.id === sessionId) ?? null;
  const start = (view: SilentView) => Date.parse(view.session.startsAt);
  const open = views.filter(view => view.state === "buka").sort((a, b) => start(a) - start(b));
  if (open.length) return open[0];
  const later = views.filter(view => view.state === "belum").sort((a, b) => start(a) - start(b));
  if (later.length) return later[0];
  const closed = views.filter(view => view.state === "tutup").sort((a, b) => start(b) - start(a));
  return closed[0] ?? null;
}

/** T01's banner: "Dibuka · sampai 15.00". */
export const openBanner = (view: Pick<SilentView, "closesAt">, lang: Lang = "id") => (view.closesAt ? t(lang, "silent.opened", { time: clockOf(lang, wibTime(view.closesAt)) }) : t(lang, "silent.openedNoEnd"));
/** P04's pill: "Tanpa nama · sampai 15.00". */
export const openPill = (view: Pick<SilentView, "closesAt">, lang: Lang = "id") => (view.closesAt ? t(lang, "silent.pill", { time: clockOf(lang, wibTime(view.closesAt)) }) : t(lang, "silent.pillNoEnd"));
/** When it opens (T03__status "Dibuka Sel, 5 Jan · 13.00."): the session's start. */
export const opensAt = (view: Pick<SilentView, "session">) => view.session.startsAt;
/** When it closes: when panitia closed it, else its session's end. */
export const endsAt = (view: Pick<SilentView, "session" | "question">) => view.question.closedAt ?? sessionEnd(view.session);

/** "Sel, 5 Jan · 13.30–15.00" (B05's kicker). */
export function sessionWhenLabel(session: Pick<MwSession, "startsAt" | "endsAt">): string {
  const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${wibDate(session.startsAt)}T12:00:00Z`));
  return `${day} · ${timeRange(session)}`;
}

/** B05: the recap can be read (closed for good, ≥ 5 feedbacks, ≥ 5 different people who opened it). */
export function recapReady(view: Pick<SilentView, "state">, result: SilentResult | null | undefined): boolean {
  return view.state === "tutup" && !!result && silentRecapReady(result.feedback) && result.openers >= SILENT_MIN_PEOPLE;
}

/** Fisher–Yates: a new order every time it is shown, so nobody reads a sender from the order. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

export const NO_TOPIC = "Tanpa topik";
/** "Per topik": the question's topics in their order (zeros too), then any other, then Tanpa topik. */
export function topicCounts(feedback: readonly { topic: string }[], topics: readonly string[]): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of feedback) counts.set(item.topic || NO_TOPIC, (counts.get(item.topic || NO_TOPIC) ?? 0) + 1);
  const order = [...topics, ...[...counts.keys()].filter(topic => !topics.includes(topic) && topic !== NO_TOPIC).sort(), NO_TOPIC];
  return order.filter((topic, index) => order.indexOf(topic) === index)
    .map(topic => ({ topic, count: counts.get(topic) ?? 0 }))
    .filter(row => row.count > 0 || topics.includes(row.topic));
}

/** A local draft (T01 "Tulisanmu tetap di sini"), per question, on this phone only. */
export const draftKey = (questionId: string) => `mw-silent-draf:${questionId}`;
export const silentDraftSchema = z.object({ topic: z.string().max(40).default(""), body: z.string().max(SILENT_BODY_MAX * 2).default("") });
export function readDraft(raw: string | null): { topic: string; body: string } {
  if (!raw) return { topic: "", body: "" };
  try { const parsed = silentDraftSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : { topic: "", body: "" }; } catch { return { topic: "", body: "" }; }
}

/**
 * B05's data: the question and its state; only when ready (closed for good, 5 feedbacks of 5
 * people) how many, per topic, and the feedback shuffled, without time. Never a count before.
 */
export type SilentRecap = {
  view: SilentView;
  ready: boolean;
  /** Null unless ready. */
  count: number | null;
  topics: { topic: string; count: number }[];
  items: { id: string; topic: string; body: string }[];
};
