import type { ClaimStatus, DimensionId, Limit, PointsMode, RewardKind, RewardState, ReviewStatus, TicketStatus } from "./rules";

/*
 * Wellbeing for employees (/wellbeing, 17 Nov 2026): what /api/wellbeing/* answers with. Shared by
 * the server (src/lib/server/wellbeing/member.ts, src/app/api/wellbeing/**) and the client app
 * (src/components/wellbeing/**), so the two sides are built against one contract.
 *
 * Every answer is the usual Journey envelope: { ok: true, data, message } or { ok: false, message, fieldErrors? }.
 * Dates are YYYY-MM-DD in WIB; points are whole numbers.
 */

/** `photo`: the WAM account's profile photo (its app address), or null for initials (18 Nov 2026). */
export type WbMe = { id: string; name: string; nickname: string; department: string; position: string; photo?: string | null };

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
  /** "HH:MM" (WIB) when known, else null (17 Nov 2026). */
  time: string | null;
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

/**
 * What Admin Wellbeing → Aplikasi karyawan sets (17 Nov 2026): an announcement on Beranda (only while
 * on and not past its day), this month's prize, reading proof photos on the phone, and Catat paused
 * (with the admin's message). Defaults before migration 202611170002.
 */
export type WbAppControls = { announcement: { title: string; message: string } | null; prize: string | null; photoReading: boolean; pausedMessage: string | null };

/** GET /api/wellbeing/home */
export type WbHome = {
  controls: WbAppControls;
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
  blocked: string | null;
  /** Days (within the backdate window and this month) it is already logged and counted: one per day, so the app warns before any upload. */
  loggedOn: string[] };
export type WbCatalogSport = { code: string; name: string; proofHint: string };
export type WbAppCatalog = { migrated: boolean; daily: WbCatalogDaily[]; sports: WbCatalogSport[]; rules: WbRules; today: string; controls: WbAppControls };

/** GET /api/wellbeing/activities?filter=all|daily|sport|strava&before=<the previous page's `next`> (20 per page, newest first) */
export type WbMyActivityFilter = "all" | "daily" | "sport" | "strava";
export type WbMyActivityPage = { migrated: boolean; items: WbMyActivity[]; next: string | null };

/** POST /api/wellbeing/uploads { mime, size } → where to PUT one proof photo (ten minutes), and a token to send it with. */
export type WbUploadStart = { key: string; uploadUrl: string; token: string };
export type WbUploadedPhoto = { key: string; mime: string; size: number; token: string };

/**
 * POST /api/wellbeing/activities. `steps` for a steps type, `kcal` (and optional `minutes`) for a sport.
 * 409 with fieldErrors.code = ["limit" | "same_day" | "strava_twin"]; "strava_twin" may be sent again with force: true.
 */
export type WbLogInput = { code: string; date: string; time?: string | null; steps?: number | null; kcal?: number | null; minutes?: number | null; note: string; photos: WbUploadedPhoto[]; force?: boolean };
export type WbLogResult = { activity: WbMyActivity; totals: WbHome["totals"] };

/** GET /api/wellbeing/leaderboard?period=month|all&dim=all|<dimension> */
/** `photo`: the person's WAM profile photo, or null for initials (18 Nov 2026). */
export type WbBoardRow = { rank: number; employeeId: string; name: string; department: string; points: number; me: boolean; photo?: string | null };
export type WbBoard = { migrated: boolean; period: "month" | "all"; dim: DimensionId | "all";
  /** Everyone with points (the top 30 before 18 Nov 2026). */
  items: WbBoardRow[]; me: WbBoardRow | null; of: number; lastMonthChampion: WbBoardRow | null;
  /** Around me (two above, two below; also past the top 30), and the nearest person with more points (18 Nov 2026). Empty / null when I have no points. */
  near: WbBoardRow[]; ahead: WbBoardRow | null };

/** GET /api/wellbeing/ledger: every point that counts for me, newest first (activities and admin points). */
export type WbLedgerItem = { date: string; title: string; sub: string; points: number; kind: "activity" | "admin" | "import"; dimension: DimensionId | null };
export type WbLedger = { migrated: boolean; items: WbLedgerItem[]; total: number };

/*
 * Hadiah (18 Nov 2026, migration 202611180001). GET /api/wellbeing/rewards: the saldo (points that count,
 * minus what my open and handed-over claims hold; the board never changes), the rewards that are on,
 * and my claims, newest first. Photos are ready-to-show addresses (signed, ~1 hour).
 * POST /api/wellbeing/rewards/claims { rewardId, note } asks for one (409 with fieldErrors.code
 * ["balance" | "sold_out" | "limit" | "unavailable"]); POST /api/wellbeing/rewards/claims/<id> cancels mine while it waits.
 */
export type WbSaldo = { earned: number; held: number; available: number };
export type WbReward = { id: string; title: string; description: string; photos: string[]; cost: number;
  /** A prize, or a voucher that re-rolls the tokoh card (claimed at once, 18 Nov 2026). */
  kind: RewardKind;
  /** null: no limit; otherwise how many are still there. */
  left: number | null; perPerson: number;
  /** My claims of it that hold points. */
  mine: number; state: RewardState };
export type WbClaim = { id: string; rewardId: string; title: string; photo: string | null; cost: number; status: ClaimStatus; note: string;
  /** The admin's reason when rejected. */
  reason: string | null; createdAt: string; decidedAt: string | null; deliveredAt: string | null;
  /** A voucher's re-roll ticket: Legendary or not, and whether it is used (null for a prize). */
  voucher: { legendary: boolean; status: TicketStatus } | null };
/** cardUrl: where my tokoh card is (the WAM questionnaire), to use a voucher; null when there is none. */
export type WbRewards = { migrated: boolean; saldo: WbSaldo; rewards: WbReward[]; claims: WbClaim[]; cardUrl: string | null };
export type WbClaimResult = { claim: WbClaim; saldo: WbSaldo };

/*
 * Client app entry points (agreed names, so pages and components meet):
 *   src/components/wellbeing/WellbeingApp.tsx   export function WellbeingApp(props: { me: WbMe; api?: WellbeingApi })
 *   src/components/wellbeing/WellbeingLogin.tsx export function WellbeingLogin(props: { next: string | null })
 *   src/components/wellbeing/api.ts             export type WellbeingApi (one method per endpoint) + realApi
 * The `api` prop lets /dev-preview/wellbeing run the whole app on sample data without a session.
 */
export const WELLBEING_SECTIONS = ["beranda", "riwayat", "peringkat", "profil"] as const;
export type WellbeingSection = (typeof WELLBEING_SECTIONS)[number];

/**
 * GET /api/wellbeing/strava (18 Nov 2026): my Strava connection. `ready` false while the office's Strava
 * app or the migration is missing; `status` "reconnect" when Strava refused the tokens; `private` when
 * "Only you" activities are counted too.
 */
export type WbStrava = {
  ready: boolean; connected: boolean; status: "ok" | "reconnect" | null; athleteName: string;
  connectedAt: string | null; lastSyncAt: string | null; lastError: string | null; private: boolean;
};
/** POST /api/wellbeing/strava/sync: activities newly counted, of those Strava listed since the month began. */
export type WbStravaSync = { added: number; seen: number };
