/*
 * Misi, poin, and Peringkat (module `misi`, docs/main-wam/KONTRAK.md §13). The tables are mw_missions,
 * mw_mission_completions and mw_point_entries (migration 202611260001). Times are ISO instants.
 */

export const MISSION_KINDS = ["foto", "checkin", "sesi"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
/** sesi missions: who credits them (panitia by hand, or automatically from the session's absen). */
export const MISSION_CREDITS = ["panitia", "absen"] as const;
export type MissionCredit = (typeof MISSION_CREDITS)[number];
export const COMPLETION_STATUSES = ["menunggu", "disetujui", "ditolak"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];
export const COMPLETION_SOURCES = ["foto", "lokasi", "absen", "panitia"] as const;
export type CompletionSource = (typeof COMPLETION_SOURCES)[number];

/** Migration that holds the tables; named in the server log and in Admin WAM only. */
export const MISSIONS_MIGRATION = "202611260001_main_wam_misi.sql";

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
