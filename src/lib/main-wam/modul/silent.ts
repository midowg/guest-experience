import { z } from "zod";
import { silentClosesAt, silentRecapReady, silentState, type SilentState } from "../module-state";
import { sessionEnd, timeRange, wibDate, wibTime } from "../rundown";
import type { MwSession, MwSilentQuestion } from "../types";

/*
 * Silent Meeting (T01–T03, B05; RISET §7, KONTRAK §8): anonymous feedback during one session.
 * - Opens and closes with its session's hours unless panitia overrides (silentState, fondasi); the
 *   database holds the same rule when feedback is saved, by the server's clock.
 * - Feedback is stored without a person, a device or a time, under a random (v4) id.
 * - Who has sent is counted apart, under an HMAC of the person (participantMessage), never linked
 *   to what they sent. One person may send more than once (T02 "Tulis lagi"), up to SILENT_MAX_SENDS.
 * - The BOD read the recap once it is closed and has ≥ 5 feedbacks from ≥ 5 people, shuffled.
 * Pure.
 */

export const SILENT_BODY_MAX = 1000;
/** Per person per question (RISET §11: "Silent Meeting 10 kiriman / sesi"). The database caps it too. */
export const SILENT_MAX_SENDS = 10;
/** People and feedbacks before the BOD read anything (Viva Glint, Culture Amp: 5). */
export const SILENT_MIN_PEOPLE = 5;

/** What HMAC-SHA256(WAM_SESSION_SECRET, …) is taken of for a person's participation (KONTRAK §8). */
export const participantMessage = (questionId: string, employeeId: string) => `mw-silent\0${questionId}\0${employeeId}`;

export const silentFeedbackSchema = z.object({
  questionId: z.uuid("Silent Meeting tidak dikenali."),
  topic: z.string().trim().max(40, "Topik terlalu panjang.").default(""),
  body: z.string().trim().min(1, "Tulis masukanmu dulu.").max(SILENT_BODY_MAX, "Masukan paling banyak 1.000 karakter."),
}).strict();
export type SilentFeedbackInput = z.infer<typeof silentFeedbackSchema>;

export const SILENT_ACTIONS = ["buka", "tutup", "otomatis"] as const;
export type SilentAction = (typeof SILENT_ACTIONS)[number];
export const silentControlSchema = z.object({ action: z.enum(SILENT_ACTIONS, "Pilih buka, tutup, atau otomatis.") }).strict();

/** The override a control action writes: "otomatis" hands it back to the session's hours. */
export function controlPatch(action: SilentAction, by: string, now: Date): { override: "buka" | "tutup" | null; override_at: string | null; override_by: string | null } {
  if (action === "otomatis") return { override: null, override_at: null, override_by: null };
  return { override: action, override_at: now.toISOString(), override_by: by };
}

/** "15.00". */
const clock = (iso: string) => wibTime(iso).replace(":", ".");

/** One question with its session and state, as the screens and APIs pass it around. */
export type SilentView = {
  question: Pick<MwSilentQuestion, "id" | "sessionId" | "question" | "topics" | "override" | "autoClose">;
  session: Pick<MwSession, "id" | "title" | "place" | "startsAt" | "endsAt" | "status">;
  state: SilentState;
  /** When it closes by itself (null: panitia closes it). */
  closesAt: string | null;
};
export function silentView(question: MwSilentQuestion, session: MwSession, now: Date): SilentView {
  return {
    question: { id: question.id, sessionId: question.sessionId, question: question.question, topics: question.topics, override: question.override, autoClose: question.autoClose },
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

/** T01's banner: "Dibuka · sampai 15.00", or "Dibuka" when only panitia closes it. */
export const openBanner = (view: Pick<SilentView, "closesAt">) => (view.closesAt ? `Dibuka · sampai ${clock(view.closesAt)}` : "Dibuka");
/** P04's pill: "Tanpa nama · sampai 15.00". */
export const openPill = (view: Pick<SilentView, "closesAt">) => (view.closesAt ? `Tanpa nama · sampai ${clock(view.closesAt)}` : "Tanpa nama");
/** When it opens (T03__status "Dibuka Sel, 5 Jan · 13.00."): the session's start. */
export const opensAt = (view: Pick<SilentView, "session">) => view.session.startsAt;
/** When it closed or closes: its session's end (the server's override time is not kept per close). */
export const endsAt = (view: Pick<SilentView, "session">) => sessionEnd(view.session);

/** "Sel, 5 Jan · 13.30–15.00" (B05's kicker). */
export function sessionWhenLabel(session: Pick<MwSession, "startsAt" | "endsAt">): string {
  const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${wibDate(session.startsAt)}T12:00:00Z`));
  return `${day} · ${timeRange(session)}`;
}

/** B05: the recap can be read (closed, ≥ 5 feedbacks, ≥ 5 people). */
export function recapReady(view: Pick<SilentView, "state">, count: number, people: number): boolean {
  return view.state === "tutup" && silentRecapReady(count) && people >= SILENT_MIN_PEOPLE;
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

/** B05's data: the question, how many and from how many people, and (only when ready) the feedback shuffled, without time. */
export type SilentRecap = {
  view: SilentView;
  count: number;
  people: number;
  ready: boolean;
  topics: { topic: string; count: number }[];
  items: { id: string; topic: string; body: string }[];
};
