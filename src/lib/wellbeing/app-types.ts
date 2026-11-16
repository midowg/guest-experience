import type { DimensionId, Limit, PointsMode, ReviewStatus } from "./rules";

/*
 * Wellbeing for employees (/wellbeing, 17 Nov 2026): what /api/wellbeing/* answers with. Shared by
 * the server (src/lib/server/wellbeing/member.ts, src/app/api/wellbeing/**) and the client app
 * (src/components/wellbeing/**), so the two sides are built against one contract.
 *
 * Every answer is the usual Journey envelope: { ok: true, data, message } or { ok: false, message, fieldErrors? }.
 * Dates are YYYY-MM-DD in WIB; points are whole numbers.
 */

export type WbMe = { id: string; name: string; nickname: string; department: string; position: string };

/** Programme rules the screens need (from wb_settings). */
export type WbRules = { backdateDays: number; maxKcal: number; maxSteps: number; maxPhotos: number };

/** One of my activities (only ever the signed-in person's own). Photos are ready-to-show URLs (signed, ~1 hour). */
export type WbMyActivity = {
  id: string;
  typeCode: string;
  typeName: string;
  kind: "daily" | "sport";
  dimension: DimensionId;
  date: string;
  source: "manual" | "strava" | "import";
  title: string;
  steps: number | null;
  kcal: number | null;
  minutes: number | null;
  distanceM: number | null;
  note: string;
  photos: string[];
  pointsClaimed: number;
  /** What it counts now (0 when rejected). */
  points: number;
  status: ReviewStatus;
  /** The admin's reason when changed or rejected (shown to the employee). */
  reason: string | null;
  createdAt: string;
};

/** GET /api/wellbeing/home */
export type WbHome = {
  migrated: boolean;
  me: WbMe;
  today: string;
  totals: {
    /** All time. */
    points: number;
    /** This month (WIB). */
    monthPoints: number;
    /** Place this month among active employees (ties share a place); null with 0 points. */
    rank: number | null;
    of: number;
    /** Days in a row with at least one counted activity, ending today or yesterday. */
    streak: number;
    /** The last 7 days, oldest first, today last. */
    week: { date: string; points: number }[];
  };
  /** This month's points per dimension. */
  dims: Record<DimensionId, number>;
  recent: WbMyActivity[];
  rules: WbRules;
};

/** GET /api/wellbeing/catalog */
export type WbCatalogDaily = { code: string; dimension: DimensionId; name: string; mode: Exclude<PointsMode, "kcal">; points: number; limit: Limit | null; proofHint: string;
  /** Why it cannot be logged today (limit reached), or null. */
  blocked: string | null };
export type WbCatalogSport = { code: string; name: string; proofHint: string };
export type WbAppCatalog = { migrated: boolean; daily: WbCatalogDaily[]; sports: WbCatalogSport[]; rules: WbRules; today: string };

/** GET /api/wellbeing/activities?filter=all|daily|sport|strava&before=<createdAt> (20 per page, newest first) */
export type WbMyActivityFilter = "all" | "daily" | "sport" | "strava";
export type WbMyActivityPage = { migrated: boolean; items: WbMyActivity[]; next: string | null };

/** POST /api/wellbeing/uploads { mime, size } → where to PUT one proof photo (ten minutes), and a token to send it with. */
export type WbUploadStart = { key: string; uploadUrl: string; token: string };
export type WbUploadedPhoto = { key: string; mime: string; size: number; token: string };

/**
 * POST /api/wellbeing/activities. `steps` for a steps type, `kcal` (and optional `minutes`) for a sport.
 * 409 with fieldErrors.code = ["limit" | "same_day" | "strava_twin"]; "strava_twin" may be sent again with force: true.
 */
export type WbLogInput = { code: string; date: string; steps?: number | null; kcal?: number | null; minutes?: number | null; note: string; photos: WbUploadedPhoto[]; force?: boolean };
export type WbLogResult = { activity: WbMyActivity; totals: WbHome["totals"] };

/** GET /api/wellbeing/leaderboard?period=month|all&dim=all|<dimension> */
export type WbBoardRow = { rank: number; employeeId: string; name: string; department: string; points: number; me: boolean };
export type WbBoard = { migrated: boolean; period: "month" | "all"; dim: DimensionId | "all"; items: WbBoardRow[]; me: WbBoardRow | null; of: number; lastMonthChampion: WbBoardRow | null };

/** GET /api/wellbeing/ledger: every point that counts for me, newest first (activities and admin points). */
export type WbLedgerItem = { date: string; title: string; sub: string; points: number; kind: "activity" | "admin" | "import"; dimension: DimensionId | null };
export type WbLedger = { migrated: boolean; items: WbLedgerItem[]; total: number };

/*
 * Client app entry points (agreed names, so pages and components meet):
 *   src/components/wellbeing/WellbeingApp.tsx   export function WellbeingApp(props: { me: WbMe; api?: WellbeingApi })
 *   src/components/wellbeing/WellbeingLogin.tsx export function WellbeingLogin(props: { next: string | null })
 *   src/components/wellbeing/api.ts             export type WellbeingApi (one method per endpoint) + realApi
 * The `api` prop lets /dev-preview/wellbeing run the whole app on sample data without a session.
 */
export const WELLBEING_SECTIONS = ["beranda", "riwayat", "peringkat", "profil"] as const;
export type WellbeingSection = (typeof WELLBEING_SECTIONS)[number];
