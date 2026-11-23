import "server-only";
import { attentionItems, kelolaTiles, requiredOpen, runningSessions, type RunningSession, silentWaitingToday, type AttentionItem, type KelolaTile } from "@/lib/main-wam/panitia/attention";
import { silentState } from "@/lib/main-wam/module-state";
import { eventDay, wibDate } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { demoAttendeeIds, samplePresence } from "@/lib/main-wam/demo-sample";
import { databaseError } from "../../http";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAttendees } from "../people";
import { allSessions, silentQuestions } from "../read";
import { demoRundown } from "../demo";
import { db } from "./common";
import { waitingCount } from "./moderation";

/*
 * The panitia hub (K01): aggregates only. Check-ins of a day are read in one query (the day's sessions at once), never per person.
 * "Orang acara" is fondasi's mainWamAttendees (every active WAM account but BOD), the same count
 * as Absen sesi and Detail sesi (audit R5).
 */

/** The people of the event; with the sample rundown in Mode demo, the sample's (so the sample's attendance adds up). */
const eventAttendees = (settings: MainWamContext["settings"]): Promise<string[]> => (settings.sampleRundown ? Promise.resolve(demoAttendeeIds()) : mainWamAttendees());

/** Who checked in at each of these sessions (one query). */
async function presentBySession(sessionIds: string[]): Promise<{ present: Map<string, Set<string>>; migrated: boolean }> {
  const present = new Map<string, Set<string>>(sessionIds.map(id => [id, new Set<string>()]));
  if (!sessionIds.length) return { present, migrated: true };
  // Mode demo with the sample rundown: the sample's check-ins (nothing real to read for its sessions).
  if (await demoRundown()) {
    for (const id of sessionIds) for (const row of samplePresence(id)) present.get(id)?.add(row.employeeId);
    return { present, migrated: true };
  }
  const { data, error } = await db().from("mw_attendance").select("session_id,employee_id").in("session_id", sessionIds).limit(20000);
  if (error) { if (mwMissing(error)) return { present, migrated: false }; databaseError(error); }
  for (const row of data ?? []) present.get(row.session_id as string)?.add(row.employee_id as string);
  return { present, migrated: true };
}

/* ── K01 Panitia (hub) ──────────────────────────────────────────────────────────────────────── */

export type PanitiaHome = { tiles: KelolaTile[]; attention: AttentionItem[]; reported: number; running: RunningSession[] };

/** Kelola, Perlu perhatian and the sessions running now, for the Panitia hub. Fails soft: a part that cannot be read is left out, never the hub. */
export async function panitiaHome(context: MainWamContext, now = new Date()): Promise<PanitiaHome> {
  const { modules, event } = context.settings;
  const [reported, sessions] = await Promise.all([waitingCount(context.viewer), allSessions().catch(() => ({ data: [] as MwSession[], migrated: false }))]);
  const required = async () => {
    if (!modules.absen) return [];
    const open = requiredOpen(sessions.data, now);
    if (!open.length) return [];
    const [expected, { present }] = await Promise.all([eventAttendees(context.settings), presentBySession(open.map(session => session.id))]);
    const everyone = new Set(expected);
    return open.map(session => ({ session, expected: everyone.size, present: [...(present.get(session.id) ?? [])].filter(id => everyone.has(id)).length }));
  };
  const silent = async () => {
    if (!modules.silent) return [];
    const { data: questions } = await silentQuestions();
    const today = wibDate(now.toISOString());
    const day = eventDay(today, event)?.day ?? 1;
    return questions.flatMap(question => {
      const session = sessions.data.find(item => item.id === question.sessionId);
      return session && silentWaitingToday(session, silentState(question, session, now), now) ? [{ session, day }] : [];
    });
  };
  const [requiredValue, silentValue] = await Promise.all([required().catch(() => []), silent().catch(() => [])]);
  return { reported, tiles: kelolaTiles(modules, reported), attention: attentionItems({ modules, reported, required: requiredValue, silent: silentValue }), running: runningSessions(sessions.data, now) };
}

