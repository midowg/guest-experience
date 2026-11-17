import "server-only";
import { inAudience } from "@/lib/pra-wam/questionnaire";
import { eventEndsAt, surveyOpen, surveyStarted, type SurveyOpen } from "@/lib/main-wam/peserta/survey";
import type { MwSession } from "@/lib/main-wam/types";
import { formAt } from "../pra-wam/questionnaire";
import { myAnswers } from "../pra-wam/questionnaire-answers";
import type { MainWamContext } from "./gate";

export type { SurveyOpen };

/*
 * Survei for one person (audit R7): the single rule that Beranda's card (agen A) and Detail sesi's
 * "Isi survei" (agen D's SessionModuleAction) both follow. Owner: agen A (shared place, so neither
 * area imports the other). The rule itself is pure (src/lib/main-wam/peserta/survey.ts).
 */

/**
 * The survey open for this person now, or null: module off, no questionnaire chosen, its session
 * not started (or, with `sessionId`, not that session), the questionnaire closed or not for them,
 * the event over, or they already sent it. Reads nothing until the session has started; the
 * questionnaire and the person's answers through WAM's own readers (formAt, myAnswers). When the
 * answers cannot be read, the survey shows (its own page then says where they are).
 */
export async function surveyFor({ viewer, settings }: MainWamContext, sessions: readonly MwSession[], now: Date, sessionId?: string): Promise<SurveyOpen | null> {
  const start = surveyStarted({
    formSlug: settings.moduleConfig.survei.formSlug, moduleOn: settings.modules.survei, sessions, now, eventEnd: eventEndsAt(settings.event.endDate), sessionId,
  });
  if (!start) return null;
  const found = await formAt(start.formSlug);
  if (!found || !inAudience(found.form, viewer.id)) return null;
  const done = await myAnswers(found.form, viewer.id).then(mine => !!mine.completedAt || mine.progress.done).catch(() => false);
  return surveyOpen(start, { form: found.form, done, now });
}
