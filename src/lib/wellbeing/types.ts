import type { DimensionId, Limit, PointsMode, ReviewStatus } from "./rules";

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

export type WbSettingsView = { migrated: boolean; backdateDays: number; maxKcal: number; maxSteps: number; programStart: string; updatedBy: string | null; updatedAt: string | null };

export type WbBatchResult = { batchId: string; count: number; points: number };
