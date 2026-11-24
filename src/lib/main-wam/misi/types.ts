import type { MissionRule } from "./rules";
import type { CheckResult } from "./verify";

/*
 * Misi, poin, and Peringkat (module `misi`, docs/main-wam/KONTRAK.md §13). The tables are mw_missions,
 * mw_mission_completions and mw_point_entries (migration 202611260001). Times are ISO instants.
 */

export const MISSION_KINDS = ["foto", "checkin", "sesi"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
/** Whether a Momen photo may be recognised as this mission's proof (detect.ts): mati, only a sure match, or a doubtful one too. */
export const AUTO_DETECT_MODES = ["mati", "cocok", "mungkin"] as const;
export type AutoDetectMode = (typeof AUTO_DETECT_MODES)[number];
/** sesi missions: who credits them (panitia by hand, or automatically from the session's absen). */
export const MISSION_CREDITS = ["panitia", "absen"] as const;
export type MissionCredit = (typeof MISSION_CREDITS)[number];
/*
 * A proof's road: dikirim (kept) → diperiksa (the rules the server can check, then the verifier) →
 * disetujui (points in) | perlu_ditinjau (the verifier doubts: panitia or admin decide) | ditolak (the
 * reason is shown, the person may send again while the limit allows). "menunggu" is the older word for
 * perlu_ditinjau (a mission with `review`, before migration 202611300001) and reads the same.
 */
export const COMPLETION_STATUSES = ["menunggu", "dikirim", "diperiksa", "perlu_ditinjau", "disetujui", "ditolak"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];
export const COMPLETION_SOURCES = ["foto", "lokasi", "absen", "panitia"] as const;
export type CompletionSource = (typeof COMPLETION_SOURCES)[number];

/** Migration that holds the tables; named in the server log and in Admin WAM only. */
export const MISSIONS_MIGRATION = "202611260001_main_wam_misi.sql";
/** The photo missions' rules, tags, statuses and the link to Momen (docs/main-wam/KONTRAK.md §13). */
export const MISSIONS_PHOTO_MIGRATION = "202611300001_main_wam_misi_foto.sql";
/** Detection of missions from Momen photos: the photo's position, what was detected, the person's switch (KONTRAK §13). */
export const MISSIONS_DETECT_MIGRATION = "202611300003_main_wam_misi_deteksi.sql";

export type MwMission = {
  id: string;
  title: string;
  description: string;
  kind: MissionKind;
  points: number;
  placeName: string;
  latitude: number | null;
  longitude: number | null;
  /** null = the default radius of the settings. */
  radiusM: number | null;
  sessionId: string | null;
  credit: MissionCredit;
  /** A proof waits for an admin before its points count. */
  review: boolean;
  opensAt: string | null;
  closesAt: string | null;
  sort: number;
  active: boolean;
  /** The TNC (rules.ts). Empty for a mission made before the rules: its columns stand in (effectiveRules). */
  rules: MissionRule[];
  /** Detection from Momen photos: null = by default (on when the rules give evidence), else the admin's choice. */
  autoDetect?: AutoDetectMode | null;
};

export type MwCompletion = {
  id: string;
  missionId: string;
  employeeId: string;
  source: CompletionSource;
  status: CompletionStatus;
  hasProof: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  distanceM: number | null;
  takenAt: string | null;
  note: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  createdAt: string;
  /** How many proofs the person has sent for this mission (a rejected one counts). */
  attempts: number;
  /** The Momen photo made from the proof (Momen's stack and Mozaik), null before it is made. */
  photoId: string | null;
  /** What the automatic checks and the verifier said; null for a completion not checked that way. */
  checkResult: CheckResult | null;
};

/** One ledger row: the balance of a person is the sum of theirs. */
export type MwPointEntry = {
  id: string;
  employeeId: string;
  points: number;
  kind: "misi" | "manual";
  missionId: string | null;
  completionId: string | null;
  note: string;
  createdBy: string | null;
  createdAt: string;
};

/** Admin WAM → Misi → Pengaturan (example values until the owner decides). */
export type MissionSettings = {
  defaultRadiusM: number;
  maxAccuracyM: number;
  /** Whether participants see the Peringkat. */
  leaderboardOpen: boolean;
};
export const DEFAULT_MISSION_SETTINGS: MissionSettings = { defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true };
