import { editable, type QForm } from "@/lib/pra-wam/questionnaire";
import { isLive } from "../rundown";
import type { MwSession } from "../types";

/*
 * Survei (module survei): one rule for Beranda's card and Detail sesi's "Isi survei" (audit R7).
 * It opens when the session that carries it starts and stays open until the questionnaire closes
 * (Admin WAM → Kuesioner: no longer open, or its edit time has passed) or the event is over (the
 * last day, 23.59 WIB), and it is gone for someone who already sent it. The server's surveyFor
 * (src/lib/server/main-wam/survey.ts) reads the questionnaire and the person's answers; this file
 * decides. Two steps, so nothing is read before the survey's session has started. Pure.
 */

/** The questionnaire, as the rule needs it (cq_forms). */
export type SurveyForm = Pick<QForm, "slug" | "status" | "editUntil" | "minutes">;

/** The survey has started (no reads yet): its questionnaire, the session that opened it, the event's end. */
export type SurveyStart = { formSlug: string; sessionId: string; startsAt: string; eventEnd: string | null };

/** The survey is open for this person: until when (null = no end to tell), and how long it takes. */
export type SurveyOpen = { formSlug: string; sessionId: string; until: string | null; minutes: number | null };

/** The event is over at the end of its last day (23.59 WIB); null without a date. */
export function eventEndsAt(endDate: string | null | undefined): string | null {
  return endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:00+07:00` : null;
}

/**
 * Step 1: the module is on, a questionnaire is chosen, the survei session has started and the event
 * is not over. `sessionId` asks about one session (Detail sesi); without it, the first survei
 * session that has started (Beranda). A cancelled or draft session never opens it.
 */
export function surveyStarted({ formSlug, moduleOn, sessions, now, eventEnd, sessionId }: {
  formSlug: string | null;
  moduleOn: boolean;
  sessions: readonly MwSession[];
  now: Date;
  eventEnd: string | null;
  sessionId?: string;
}): SurveyStart | null {
  if (!moduleOn || !formSlug) return null;
  if (eventEnd && now.getTime() >= Date.parse(eventEnd)) return null;
  const started = sessions.filter(isLive)
    .filter(session => session.module === "survei" && (!sessionId || session.id === sessionId) && Date.parse(session.startsAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.sort - b.sort)[0];
  return started ? { formSlug, sessionId: started.id, startsAt: started.startsAt, eventEnd } : null;
}

/**
 * Step 2: the questionnaire at that address is still open and the person has not sent it. "Until"
 * is the earlier of its edit time and the event's end.
 */
export function surveyOpen(start: SurveyStart | null, { form, done, now }: { form: SurveyForm | null; done: boolean; now: Date }): SurveyOpen | null {
  if (!start || !form || done || !editable(form, now)) return null;
  const ends = [form.editUntil, start.eventEnd].filter((iso): iso is string => !!iso && !Number.isNaN(Date.parse(iso)));
  const until = ends.length ? ends.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null;
  return { formSlug: start.formSlug, sessionId: start.sessionId, until, minutes: form.minutes > 0 ? form.minutes : null };
}
