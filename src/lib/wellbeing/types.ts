import type { AppControls, ClaimStatus, DimensionId, Limit, PointsMode, ReviewStatus, RewardKind, TicketStatus } from "./rules";

/** What the Admin Wellbeing API answers with (shared by the server and the screens). */

export type WbSource = "manual" | "strava" | "import";

export type WbActivity = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNickname: string;
  department: string;
  typeCode: string;
  typeName: string;
  kind: "daily" | "sport";
  dimension: DimensionId;
  date: string;
  /** "HH:MM" (WIB) when known (17 Nov 2026). */
  time: string | null;
  source: WbSource;
  title: string;
  steps: number | null;
  kcal: number | null;
  minutes: number | null;
  distanceM: number | null;
  note: string;
  photos: string[];
  pointsClaimed: number;
  points: number;
  status: ReviewStatus;
  reason: string | null;
  checked: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type WbChampion = { employeeId: string; name: string; nickname: string; department: string; points: number };

export type WbOverview = {
  migrated: boolean;
  today: string;
  unchecked: number;
  uncheckedPreview: WbActivity[];
  todayActivities: number;
  month: { from: string; to: string; points: number; people: number; activities: number };
  lastMonth: { from: string; to: string; overall: WbChampion[]; byDimension: (WbChampion & { dimension: DimensionId })[] };
  participants: number;
};

export type WbActivityPage = { migrated: boolean; items: WbActivity[]; next: string | null; unchecked: number };

export type WbPersonRow = {
  id: string;
  name: string;
  nickname: string;
  department: string;
  active: boolean;
  points: number;
  activities: number;
  dims: Record<DimensionId, number>;
  rank: number;
};
export type WbPeople = { migrated: boolean; period: "month" | "all"; from: string | null; to: string | null; rows: WbPersonRow[]; departments: string[] };

export type WbPointEntry = { id: string; batchId: string; points: number; dimension: DimensionId | null; reason: string; date: string; by: string; createdAt: string; voided: boolean };

export type WbPersonDetail = {
  migrated: boolean;
  person: { id: string; name: string; nickname: string; department: string; position: string; active: boolean };
  total: number;
  month: number;
  dims: Record<DimensionId, number>;
  monthDims: Record<DimensionId, number>;
  activities: WbActivity[];
  entries: WbPointEntry[];
};

export type WbCatalogItem = {
  code: string;
  dimension: DimensionId;
  kind: "daily" | "sport";
  name: string;
  mode: PointsMode;
  points: number;
  limit: Limit | null;
  proofHint: string;
  active: boolean;
  sortOrder: number;
};
export type WbCatalog = { migrated: boolean; items: WbCatalogItem[] };

export type WbSettingsView = { migrated: boolean; backdateDays: number; maxKcal: number; maxSteps: number; programStart: string; updatedBy: string | null; updatedAt: string | null;
  /** Kontrol aplikasi karyawan (17 Nov 2026); appReady false before migration 202611170002 (the defaults show, saving waits). */
  app: AppControls; appReady: boolean };
/** POST /api/admin/wellbeing/activities/check: the activities whose "diperiksa" changed (the others were already so). */
export type WbCheckResult = { changed: string[] };

export type WbBatchResult = { batchId: string; count: number; points: number };

/**
 * GET /api/admin/wellbeing/strava (18 Nov 2026): the office's Strava app: keys set in Vercel, the
 * migration, the webhook subscription (one per app) and how many employees are connected.
 */
export type WbStravaAdmin = {
  configured: boolean; migrated: boolean; callbackUrl: string; connected: number; reconnect: number;
  subscription: { id: number; callbackUrl: string } | null; subscriptionError: string | null;
};

/*
 * Hadiah (18 Nov 2026, migration 202611180001). GET /api/admin/wellbeing/rewards: every reward (photos as
 * stored keys with a ready address each), the claims (all that still wait, and the latest 200 others),
 * and how many claims are in each status.
 */
export type WbAdminRewardPhoto = { key: string; url: string | null };
export type WbAdminReward = { id: string; title: string; description: string; photos: WbAdminRewardPhoto[]; cost: number; stock: number | null; perPerson: number;
  active: boolean;
  /** A prize, or a re-roll voucher (claimed at once). vouchersReady: false until migration 202611180003. */
  kind: RewardKind;
  /** Claims that hold points (requested, approved, delivered), and of those still waiting for a decision. */
  taken: number; waiting: number; updatedAt: string; updatedBy: string | null };
export type WbAdminClaim = { id: string; rewardId: string; rewardTitle: string; rewardPhoto: string | null; employeeId: string; employeeName: string; department: string;
  cost: number; status: ClaimStatus; note: string; reason: string | null; createdAt: string; decidedBy: string | null; decidedAt: string | null; deliveredBy: string | null; deliveredAt: string | null };
export type WbRewardsAdmin = { migrated: boolean; rewards: WbAdminReward[]; claims: WbAdminClaim[]; counts: Record<ClaimStatus, number>;
  /** Whether rewards may be re-roll vouchers (migration 202611180003 ran). */
  vouchersReady: boolean };

/*
 * Super admin → Voucher re-roll (18 Nov 2026): every ticket, newest first, with where it came from and
 * what it did to the card, and the Legendary quota.
 */
export type WbVoucherCard = { figure: string; tier: string };
export type WbVoucher = {
  id: string; employeeId: string; employeeName: string; department: string; legendary: boolean; status: TicketStatus; note: string; createdAt: string;
  /** From Hadiah (the claim, its title, price and status), or given by hand (givenBy). */
  claim: { id: string; title: string; cost: number; status: ClaimStatus } | null; givenBy: string | null;
  usedAt: string | null; before: WbVoucherCard | null; after: WbVoucherCard | null;
  /** The card may go back: it still shows the voucher's figure and was not put back already. */
  restorable: boolean;
  revokedAt: string | null; revokedBy: string | null; revokeReason: string | null; restoredAt: string | null; restoredBy: string | null };
export type WbVoucherPerson = { id: string; name: string; nickname: string; department: string; category: string; hasCard: boolean };
export type WbVouchersAdmin = { migrated: boolean; vouchers: WbVoucher[]; people: WbVoucherPerson[];
  /** Legendary places: the cap (null: none), cards holding it, and unused Legendary vouchers holding one. */
  legend: { name: string; cap: number | null; cards: number; reserved: number } | null };
/** POST /api/admin/wellbeing/rewards/uploads { mime, size }: where to PUT one reward photo, and its token. */
export type WbRewardUpload = { key: string; uploadUrl: string; token: string };
