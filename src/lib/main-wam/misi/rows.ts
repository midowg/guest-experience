import { parseRules } from "./rules";
import type { CheckResult } from "./verify";
import { AUTO_DETECT_MODES, COMPLETION_SOURCES, COMPLETION_STATUSES, DEFAULT_MISSION_SETTINGS, MISSION_CREDITS, MISSION_KINDS, type MissionSettings, type MwCompletion, type MwMission, type MwPointEntry } from "./types";

/*
 * Database rows → the Misi types. A column that is missing or odd never stops a screen: it falls back
 * (the readers also fall back when a whole table is not there yet, migration 202611260001).
 */

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? value as T : fallback);

/** The columns before migration 202611300001; a reader falls back to these while the newer ones are not there. */
export const MISSION_COLUMNS_BASE = "id,title,description,kind,points,place_name,latitude,longitude,radius_m,session_id,credit,review,opens_at,closes_at,sort,active";
/** With the rules (migration 202611300001); a reader falls back to the base when they are not there. */
export const MISSION_COLUMNS_RULES = `${MISSION_COLUMNS_BASE},rules`;
/** With the detection mode too (migration 202611300003). */
export const MISSION_COLUMNS = `${MISSION_COLUMNS_RULES},auto_detect`;
export function missionFromRow(row: Row): MwMission {
  return {
    id: text(row.id), title: text(row.title), description: text(row.description), kind: oneOf(MISSION_KINDS, row.kind, "foto"), points: num(row.points),
    placeName: text(row.place_name), latitude: numOrNull(row.latitude), longitude: numOrNull(row.longitude), radiusM: numOrNull(row.radius_m),
    sessionId: textOrNull(row.session_id), credit: oneOf(MISSION_CREDITS, row.credit, "panitia"), review: row.review === true,
    opensAt: textOrNull(row.opens_at), closesAt: textOrNull(row.closes_at), sort: num(row.sort), active: row.active === true,
    rules: parseRules(row.rules), autoDetect: AUTO_DETECT_MODES.find(mode => mode === row.auto_detect) ?? null,
  };
}

export const COMPLETION_COLUMNS_BASE = "id,mission_id,employee_id,source,status,proof_key,proof_thumb_key,latitude,longitude,accuracy_m,distance_m,taken_at,note,reviewed_by,reviewed_at,review_note,created_at";
export const COMPLETION_COLUMNS = `${COMPLETION_COLUMNS_BASE},attempts,photo_id,check_result`;

/** check_result (jsonb) → the typed result; anything odd is null. */
export function checkResultFromJson(value: unknown): CheckResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.checks)) return null;
  return value as CheckResult;
}
export function completionFromRow(row: Row): MwCompletion {
  return {
    id: text(row.id), missionId: text(row.mission_id), employeeId: text(row.employee_id), source: oneOf(COMPLETION_SOURCES, row.source, "panitia"),
    status: oneOf(COMPLETION_STATUSES, row.status, "menunggu"), hasProof: !!textOrNull(row.proof_key),
    latitude: numOrNull(row.latitude), longitude: numOrNull(row.longitude), accuracyM: numOrNull(row.accuracy_m), distanceM: numOrNull(row.distance_m),
    takenAt: textOrNull(row.taken_at), note: text(row.note), reviewedBy: textOrNull(row.reviewed_by), reviewedAt: textOrNull(row.reviewed_at),
    reviewNote: text(row.review_note), createdAt: text(row.created_at),
    attempts: Math.max(1, num(row.attempts, 1)), photoId: textOrNull(row.photo_id), checkResult: checkResultFromJson(row.check_result),
  };
}

export const ENTRY_COLUMNS = "id,employee_id,points,kind,mission_id,completion_id,note,created_by,created_at";
export function entryFromRow(row: Row): MwPointEntry {
  return {
    id: text(row.id), employeeId: text(row.employee_id), points: num(row.points), kind: row.kind === "manual" ? "manual" : "misi",
    missionId: textOrNull(row.mission_id), completionId: textOrNull(row.completion_id), note: text(row.note), createdBy: textOrNull(row.created_by), createdAt: text(row.created_at),
  };
}

export const SETTINGS_COLUMNS = "default_radius_m,max_accuracy_m,leaderboard_open";
export function settingsFromRow(row: Row | null | undefined): MissionSettings {
  if (!row) return { ...DEFAULT_MISSION_SETTINGS };
  const between = (value: unknown, low: number, high: number, fallback: number) => { const n = num(value, fallback); return n >= low && n <= high ? Math.round(n) : fallback; };
  return {
    defaultRadiusM: between(row.default_radius_m, 10, 1000, DEFAULT_MISSION_SETTINGS.defaultRadiusM),
    maxAccuracyM: between(row.max_accuracy_m, 10, 1000, DEFAULT_MISSION_SETTINGS.maxAccuracyM),
    leaderboardOpen: row.leaderboard_open !== false,
  };
}
