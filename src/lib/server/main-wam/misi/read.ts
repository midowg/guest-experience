import "server-only";
import { cache } from "react";
import { demoSample } from "@/lib/main-wam/demo-sample";
import { missionItems, summarize, type MisiView, type MissionSummary } from "@/lib/main-wam/misi/missions";
import { myPlace, rankPeople, type RankPerson, type RankRow } from "@/lib/main-wam/misi/rank";
import { COMPLETION_COLUMNS, COMPLETION_COLUMNS_BASE, completionFromRow, MISSION_COLUMNS, MISSION_COLUMNS_BASE, MISSION_COLUMNS_RULES, missionFromRow, SETTINGS_COLUMNS, settingsFromRow } from "@/lib/main-wam/misi/rows";
import { sampleBoard, sampleCompletions, sampleFromPhotos, sampleMissions, sampleTaggedIn } from "@/lib/main-wam/misi/sample";
import { DEFAULT_MISSION_SETTINGS, MISSIONS_MIGRATION, type MissionSettings, type MwCompletion, type MwMission } from "@/lib/main-wam/misi/types";
import type { MainWamViewer, MwSession } from "@/lib/main-wam/types";
import { isSupabaseConfigured } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { demoOn } from "../demo";
import { mwMissing, type DbError, type Read } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAttendees, mainWamPeople } from "../people";
import { allSessions } from "../read";
import { fromMyPhotos } from "./deteksi";
import { taggedInOf } from "./tags";

/*
 * Misi's readers (docs/main-wam/KONTRAK.md §13): the missions, a person's completions, the points as a
 * ledger's sum, and the Peringkat. Before migration 202611260001 every reader answers empty with
 * `migrated: false` (the screens say "menunggu pembaruan sistem"). Mode demo: while there is no
 * mission in the table at all, the prototype's five missions and 118 made-up people stand in.
 */

const db = () => createPrivilegedClient();
const settle = <T,>(error: DbError | null, empty: T): Read<T> | null => {
  if (!error) return null;
  if (mwMissing(error)) { console.warn(`main-wam: menunggu migrasi ${MISSIONS_MIGRATION}`); return { data: empty, migrated: false }; }
  return databaseError({ message: error.message ?? "", code: error.code });
};
const notConfigured = <T,>(empty: T): Read<T> | null => (isSupabaseConfigured() ? null : { data: empty, migrated: false });

export const missionSettings = cache(async (): Promise<MissionSettings> => {
  if (!isSupabaseConfigured()) return { ...DEFAULT_MISSION_SETTINGS };
  const { data, error } = await db().from("mw_mission_settings").select(SETTINGS_COLUMNS).limit(1).maybeSingle();
  if (error) { if (mwMissing(error)) return { ...DEFAULT_MISSION_SETTINGS }; databaseError({ message: error.message ?? "", code: error.code }); }
  return settingsFromRow(data as Record<string, unknown> | null);
});

/** Every mission, active or not, in the admin's order (the caller filters for participants). */
export const allMissions = cache(async (): Promise<Read<MwMission[]>> => {
  const early = notConfigured<MwMission[]>([]);
  if (early) return early;
  const read = (columns: string) => db().from("mw_missions").select(columns).order("sort").order("created_at").limit(300);
  let { data, error } = await read(MISSION_COLUMNS);
  // Before migration 202611300003 there is no `auto_detect` column, before 202611300001 no `rules` column: read the older columns (the rules come from them).
  if (error && mwMissing(error)) ({ data, error } = await read(MISSION_COLUMNS_RULES));
  if (error && mwMissing(error)) ({ data, error } = await read(MISSION_COLUMNS_BASE));
  return settle(error, [] as MwMission[]) ?? { data: ((data ?? []) as unknown as Record<string, unknown>[]).map(row => missionFromRow(row)), migrated: true };
});

/** One person's completions (a few rows). */
export async function completionsOf(employeeId: string): Promise<Read<MwCompletion[]>> {
  const early = notConfigured<MwCompletion[]>([]);
  if (early) return early;
  const read = (columns: string) => db().from("mw_mission_completions").select(columns).eq("employee_id", employeeId).limit(500);
  let { data, error } = await read(COMPLETION_COLUMNS);
  if (error && mwMissing(error)) ({ data, error } = await read(COMPLETION_COLUMNS_BASE));
  return settle(error, [] as MwCompletion[]) ?? { data: ((data ?? []) as unknown as Record<string, unknown>[]).map(row => completionFromRow(row)), migrated: true };
}

/** Points and missions done per person (the ledger's sum), from the view. */
export async function pointTotals(): Promise<Read<Map<string, { points: number; missions: number }>>> {
  const out = new Map<string, { points: number; missions: number }>();
  const early = notConfigured(out);
  if (early) return early;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("mw_point_totals").select("employee_id,points,missions").order("employee_id").range(from, from + 999);
    const failed = settle(error, out);
    if (failed) return failed;
    for (const row of (data ?? []) as { employee_id: string; points: number; missions: number }[]) out.set(row.employee_id, { points: row.points ?? 0, missions: row.missions ?? 0 });
    if ((data?.length ?? 0) < 1000) break;
  }
  return { data: out, migrated: true };
}

/** Everyone of the event, with their points: the Peringkat's people (BOD are not ranked, KONTRAK §3). */
export async function rankPool(totals: ReadonlyMap<string, { points: number; missions: number }>): Promise<RankPerson[]> {
  const [attendees, people] = await Promise.all([mainWamAttendees(), mainWamPeople()]);
  return attendees.flatMap(id => {
    const person = people.get(id);
    if (!person) return [];
    const sum = totals.get(id);
    return [{ id, name: person.name, department: person.department, points: sum?.points ?? 0, missions: sum?.missions ?? 0 }];
  });
}

/**
 * sesi missions that are credited from absen: a person who has checked in at the mission's session
 * and has no completion yet is credited now (approved, source absen). Quiet and repeatable: a race
 * with another request keeps one row (unique per person and mission).
 */
export async function creditFromAbsen(employeeId: string, missions: readonly MwMission[], completions: readonly MwCompletion[]): Promise<MwCompletion[]> {
  const done = new Set(completions.map(completion => completion.missionId));
  const wanted = missions.filter(mission => mission.active && mission.kind === "sesi" && mission.credit === "absen" && mission.sessionId && !done.has(mission.id));
  if (!wanted.length) return [];
  const { data, error } = await db().from("mw_attendance").select("session_id").eq("employee_id", employeeId).in("session_id", wanted.map(mission => mission.sessionId as string));
  if (error) return [];
  const attended = new Set((data ?? []).map(row => row.session_id as string));
  const rows = wanted.filter(mission => attended.has(mission.sessionId as string)).map(mission => ({ mission_id: mission.id, employee_id: employeeId, source: "absen", status: "disetujui" }));
  if (!rows.length) return [];
  const saved = await db().from("mw_mission_completions").upsert(rows, { onConflict: "mission_id,employee_id", ignoreDuplicates: true }).select(COMPLETION_COLUMNS);
  if (saved.error) return [];
  return (saved.data ?? []).map(row => completionFromRow(row));
}

export type MisiData = MisiView & { settings: MissionSettings };

/** Everything Beranda's card and the Misi page show for one person. */
export async function loadMisi(context: MainWamContext, now: Date): Promise<MisiData> {
  const { viewer } = context;
  const [settings, missions] = await Promise.all([missionSettings(), allMissions()]);
  const sessions = (await allSessions()).data;
  if (!missions.migrated) return empty(false, settings);
  if (!missions.data.length) {
    if (!(await demoOn())) return empty(true, settings);
    return demoData(viewer, sessions, settings, now);
  }
  const first = await completionsOf(viewer.id);
  const credited = await creditFromAbsen(viewer.id, missions.data, first.data);
  const completions = [...first.data, ...credited];
  const totals = await pointTotals();
  const board = rankPeople(await rankPool(totals.data), viewer.id);
  const items = missionItems(missions.data, completions, { sessions, settings, now });
  const mine = await fromMyPhotos(context, items).catch(() => ({ auto: false, saved: false, list: [] }));
  return {
    migrated: true, sample: false, items, summary: summarize(items), points: totals.data.get(viewer.id)?.points ?? 0, taggedIn: await taggedInOf(viewer.id).catch(() => []),
    fromPhotos: mine.list, autoDetect: mine.auto, autoDetectSaved: mine.saved,
    // While the Peringkat is closed nobody learns their place, not even from the API.
    place: settings.leaderboardOpen ? placeOf(board) : null, leaderboardOpen: settings.leaderboardOpen, settings,
  };
}

const placeOf = (board: readonly RankRow[]) => { const place = myPlace(board); return place ? { rank: place.rank, of: place.of } : null; };
const emptySummary: MissionSummary = { total: 0, done: 0, pending: 0, availablePoints: 0, earnedPoints: 0 };
const empty = (migrated: boolean, settings: MissionSettings): MisiData => ({ migrated, sample: false, items: [], summary: emptySummary, points: 0, place: null, leaderboardOpen: settings.leaderboardOpen, taggedIn: [], settings });

function demoData(viewer: MainWamViewer, sessions: readonly Pick<MwSession, "id" | "title">[], settings: MissionSettings, now: Date): MisiData {
  const missions = demoSample(sampleMissions, now);
  const items = missionItems(missions, sampleCompletions(viewer.id), { sessions, settings, now });
  const board = rankPeople(sampleBoard(viewer.id, viewer.name), viewer.id);
  const mine = board.find(row => row.me);
  return { migrated: true, sample: true, items, summary: summarize(items), points: mine?.points ?? 0, place: placeOf(board), leaderboardOpen: true, taggedIn: sampleTaggedIn, fromPhotos: sampleFromPhotos(items), autoDetect: true, autoDetectSaved: true, settings };
}

/** The Peringkat for one person: every row, and whether it is open. Sample while Mode demo stands in. */
export async function loadLeaderboard(context: MainWamContext): Promise<{ migrated: boolean; open: boolean; rows: RankRow[] }> {
  const { viewer } = context;
  const [settings, missions] = await Promise.all([missionSettings(), allMissions()]);
  if (!missions.migrated) return { migrated: false, open: false, rows: [] };
  if (!missions.data.length) {
    if (await demoOn()) return { migrated: true, open: true, rows: rankPeople(sampleBoard(viewer.id, viewer.name), viewer.id) };
    return { migrated: true, open: settings.leaderboardOpen, rows: [] };
  }
  if (!settings.leaderboardOpen) return { migrated: true, open: false, rows: [] };
  const totals = await pointTotals();
  return { migrated: true, open: true, rows: rankPeople(await rankPool(totals.data), viewer.id) };
}

