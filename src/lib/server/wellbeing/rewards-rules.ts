import type { WbClaim, WbReward, WbSaldo } from "@/lib/wellbeing/app-types";
import { claimHolds, rewardState, type ClaimStatus, type PhotoMime } from "@/lib/wellbeing/rules";
import type { WbAdminClaim } from "@/lib/wellbeing/types";

/*
 * Hadiah (18 Nov 2026): the pure pieces of rewards.ts, tested without a database: reward photo keys,
 * the claim function's refusals in words, and rows into what the screens get.
 */

type Row = Record<string, unknown>;

/** Reward photos live in storage under wellbeing/hadiah/ (signed to show like proof photos). */
export const REWARD_PHOTO_PREFIX = "wellbeing/hadiah/";
const extensions: Record<PhotoMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = new RegExp(`^wellbeing/hadiah/${UUID}\\.(jpg|png|webp)$`);
export const rewardPhotoKey = (id: string, mime: PhotoMime) => `${REWARD_PHOTO_PREFIX}${id}.${extensions[mime]}`;
/** A key the server made for a reward photo of this type (nobody attaches another file). */
export const isRewardPhotoKey = (key: string, mime: PhotoMime) => KEY.test(key) && key.endsWith(`.${extensions[mime]}`);
/** The upload token's subject for reward photos (uploads.ts signs it in place of an employee). */
export const REWARD_UPLOAD_SUBJECT = "hadiah";

export type ClaimRefusal = { code: "balance" | "sold_out" | "limit" | "unavailable"; message: string };
/** wb_request_reward's refusals (raise exception 'reward_…') in words for the employee; null for any other error. */
export function claimRefusal(message: string | undefined): ClaimRefusal | null {
  const text = message ?? "";
  if (text.includes("reward_balance")) return { code: "balance", message: "Saldo poinmu belum cukup untuk hadiah ini." };
  if (text.includes("reward_sold_out")) return { code: "sold_out", message: "Hadiah ini sudah habis diklaim." };
  if (text.includes("reward_limit")) return { code: "limit", message: "Kamu sudah mengklaim hadiah ini sebanyak batasnya." };
  if (text.includes("reward_unavailable")) return { code: "unavailable", message: "Hadiah ini sudah tidak tersedia. Muat ulang daftarnya." };
  return null;
}

/** My saldo from my points (the board's total) and my claims. */
export function saldoFrom(earned: number, claims: readonly { status: ClaimStatus; cost: number }[]): WbSaldo {
  const held = claims.filter(claim => claimHolds(claim.status)).reduce((sum, claim) => sum + claim.cost, 0);
  return { earned, held, available: earned - held };
}

/** A reward for the employee app: what is left, how many I hold, and what I can do. */
export function toReward(row: Row, photos: string[], taken: number, mine: number, available: number): WbReward {
  const stock = row.stock === null || row.stock === undefined ? null : Number(row.stock);
  const cost = Number(row.cost), perPerson = Number(row.per_person);
  return {
    id: row.id as string, title: row.title as string, description: (row.description as string) ?? "", photos, cost,
    left: stock === null ? null : Math.max(0, stock - taken), perPerson, mine,
    state: rewardState({ cost, stock, taken, perPerson, mine, available }),
  };
}

export function toClaim(row: Row, photo: string | null): WbClaim {
  return {
    id: row.id as string, rewardId: row.reward_id as string, title: row.reward_title as string, photo, cost: Number(row.cost), status: row.status as ClaimStatus,
    note: (row.note as string) ?? "", reason: (row.reason as string | null) ?? null, createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string | null) ?? null, deliveredAt: (row.delivered_at as string | null) ?? null,
  };
}

export function toAdminClaim(row: Row, photo: string | null): WbAdminClaim {
  const person = (row.person ?? {}) as Row;
  return {
    id: row.id as string, rewardId: row.reward_id as string, rewardTitle: row.reward_title as string, rewardPhoto: photo,
    employeeId: row.employee_id as string, employeeName: ((person.nickname as string) || (person.full_name as string)) ?? "", department: (person.department as string) ?? "",
    cost: Number(row.cost), status: row.status as ClaimStatus, note: (row.note as string) ?? "", reason: (row.reason as string | null) ?? null, createdAt: row.created_at as string,
    decidedBy: (row.decided_by_name as string | null) ?? null, decidedAt: (row.decided_at as string | null) ?? null,
    deliveredBy: (row.delivered_by_name as string | null) ?? null, deliveredAt: (row.delivered_at as string | null) ?? null,
  };
}

/** Per reward: claims that hold points, and of those, the ones still waiting for a decision. */
export function claimCounts(rows: readonly { reward_id: string; status: ClaimStatus }[]) {
  const taken = new Map<string, number>(), waiting = new Map<string, number>();
  for (const row of rows) {
    if (claimHolds(row.status)) taken.set(row.reward_id, (taken.get(row.reward_id) ?? 0) + 1);
    if (row.status === "requested" || row.status === "approved") waiting.set(row.reward_id, (waiting.get(row.reward_id) ?? 0) + 1);
  }
  return { taken, waiting };
}
