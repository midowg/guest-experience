import "server-only";
import { randomUUID } from "node:crypto";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type { WbClaimResult, WbRewards, WbSaldo } from "@/lib/wellbeing/app-types";
import {
  CLAIM_STATUSES, MIGRATION_WELLBEING_REWARDS, claimActionFrom, claimActionTo,
  type ClaimDecisionInput, type ClaimRequestInput, type ClaimStatus, type RewardInput, type UploadStartInput,
} from "@/lib/wellbeing/rules";
import type { WbAdminClaim, WbAdminReward, WbRewardUpload, WbRewardsAdmin } from "@/lib/wellbeing/types";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import type { Member } from "../pra-wam/session";
import { isR2Configured, presignUpload, removeObjects, verifyUpload } from "../r2";
import type { Actor } from "./admin";
import { REWARD_PHOTO_PREFIX, REWARD_UPLOAD_SUBJECT, claimCounts, claimRefusal, isRewardPhotoKey, rewardPhotoKey, saldoFrom, toAdminClaim, toClaim, toReward } from "./rewards-rules";
import { db, missing, photoUrls, readAll, readTotals, type Row } from "./shared";
import { uploadToken, uploadTokenMatches } from "./uploads";

/*
 * Hadiah (18 Nov 2026, migration 202611180001, docs/rancangan-wellbeing.md "Hadiah"): employees trade
 * points for prizes; a claim holds points from the saldo until the admin hands the prize over (or
 * rejects it, or the employee cancels it). The board and the total points never change. Before the
 * migration every read answers `migrated: false` and every write says it waits for the migration.
 */

const REWARD_COLUMNS = "id,title,description,photos,cost,stock,per_person,active,sort,updated_at,updated_by_name";
const CLAIM_COLUMNS = "id,reward_id,employee_id,cost,reward_title,status,note,reason,decided_by_name,decided_at,delivered_by_name,delivered_at,created_at";
const HOLDING: ClaimStatus[] = ["requested", "approved", "delivered"];
const RECENT_CLAIMS = 200;

const waitingRewards = () => new ServiceError(503, `Hadiah menunggu migrasi ${MIGRATION_WELLBEING_REWARDS}. Minta pemilik menjalankannya di Supabase SQL Editor.`);
const failRewards = (error: { code?: string; message: string }): never => { if (missing(error)) throw waitingRewards(); return databaseError(error); };
const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum siap. Coba lagi nanti.");
const emptySaldo: WbSaldo = { earned: 0, held: 0, available: 0 };
/** Up to the first photo of each reward, ready to show (claims show it as their picture). */
const firstPhotos = async (rows: Row[]) => new Map(await Promise.all(rows.map(async row => [row.id as string, (await photoUrls(((row.photos as string[] | null) ?? []).slice(0, 1)))[0] ?? null] as const)));

/* ---------- the employee app ---------- */

/** My points (the board's all-time total, from wb_totals). */
async function myEarned(employeeId: string): Promise<{ migrated: boolean; earned: number }> {
  const totals = await readTotals(null, null);
  return { migrated: totals.migrated, earned: totals.rows.filter(row => row.employee_id === employeeId).reduce((sum, row) => sum + row.points, 0) };
}

async function mySaldo(employeeId: string): Promise<WbSaldo> {
  const [earned, claims] = await Promise.all([myEarned(employeeId), db().from("wb_reward_claims").select("status,cost").eq("employee_id", employeeId).in("status", HOLDING)]);
  if (claims.error) failRewards(claims.error);
  return saldoFrom(earned.earned, ((claims.data ?? []) as Row[]).map(row => ({ status: row.status as ClaimStatus, cost: Number(row.cost) })));
}

/** GET /api/wellbeing/rewards: my saldo, the rewards that are on, and my claims (newest first). */
export async function myRewards(member: Member): Promise<WbRewards> {
  const [rewardsRead, mineRead, holdingRead, earned] = await Promise.all([
    db().from("wb_rewards").select(REWARD_COLUMNS).eq("active", true).order("sort").order("cost").order("id"),
    db().from("wb_reward_claims").select(CLAIM_COLUMNS).eq("employee_id", member.id).order("created_at", { ascending: false }).order("id").limit(RECENT_CLAIMS),
    readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").in("status", HOLDING).order("id").range(from, to)),
    myEarned(member.id),
  ]);
  for (const read of [rewardsRead.error, mineRead.error, holdingRead.error]) if (read) { if (missing(read)) return { migrated: false, saldo: emptySaldo, rewards: [], claims: [] }; databaseError(read); }
  if (!earned.migrated) return { migrated: false, saldo: emptySaldo, rewards: [], claims: [] };
  const mine = (mineRead.data ?? []) as Row[];
  // The saldo counts every claim of mine that holds points, not only the latest shown.
  const holdingMine = mine.length < RECENT_CLAIMS ? mine : ((await db().from("wb_reward_claims").select("status,cost").eq("employee_id", member.id).in("status", HOLDING)).data ?? []) as Row[];
  const saldo = saldoFrom(earned.earned, holdingMine.map(row => ({ status: row.status as ClaimStatus, cost: Number(row.cost) })));
  const { taken } = claimCounts(holdingRead.rows as { reward_id: string; status: ClaimStatus }[]);
  const myCount = new Map<string, number>();
  for (const row of mine) if (HOLDING.includes(row.status as ClaimStatus)) myCount.set(row.reward_id as string, (myCount.get(row.reward_id as string) ?? 0) + 1);
  const rewardRows = (rewardsRead.data ?? []) as Row[];
  const rewards = await Promise.all(rewardRows.map(async row => toReward(row, await photoUrls((row.photos as string[] | null) ?? []), taken.get(row.id as string) ?? 0, myCount.get(row.id as string) ?? 0, saldo.available)));
  // A claim's picture: its reward's first photo (also for rewards that are off now).
  const missingIds = [...new Set(mine.map(row => row.reward_id as string))].filter(id => !rewardRows.some(row => row.id === id));
  const others = missingIds.length ? ((await db().from("wb_rewards").select("id,photos").in("id", missingIds)).data ?? []) as Row[] : [];
  const photoOf = await firstPhotos([...rewardRows, ...others]);
  return { migrated: true, saldo, rewards, claims: mine.map(row => toClaim(row, photoOf.get(row.reward_id as string) ?? null)) };
}

/** POST /api/wellbeing/rewards/claims: ask for a reward; the points are held at once (409 with the reason when it cannot be). */
export async function requestReward(member: Member, input: ClaimRequestInput): Promise<WbClaimResult> {
  const { data, error } = await db().rpc("wb_request_reward", { p_employee: member.id, p_reward: input.rewardId, p_note: input.note });
  if (error) {
    if (missing(error) || /wb_request_reward/.test(error.message ?? "")) throw waitingRewards();
    const refusal = claimRefusal(error.message);
    if (refusal) throw new ServiceError(409, refusal.message, { code: [refusal.code] });
    databaseError(error);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row;
  const reward = await db().from("wb_rewards").select("id,photos").eq("id", input.rewardId).maybeSingle();
  const photo = reward.data ? (await firstPhotos([reward.data as Row])).get(input.rewardId) ?? null : null;
  return { claim: toClaim(row, photo), saldo: await mySaldo(member.id) };
}

/** POST /api/wellbeing/rewards/claims/<id>: cancel my claim while it still waits (the points come back). */
export async function cancelClaim(member: Member, id: string): Promise<WbClaimResult> {
  const { data, error } = await db().from("wb_reward_claims").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("employee_id", member.id).eq("status", "requested").select(CLAIM_COLUMNS);
  if (error) failRewards(error);
  if (!data?.length) {
    const { data: found } = await db().from("wb_reward_claims").select("status").eq("id", id).eq("employee_id", member.id).maybeSingle();
    if (!found) throw new ServiceError(404, "Klaim tidak ditemukan.");
    throw new ServiceError(409, "Klaim ini sudah diproses admin, jadi tidak bisa dibatalkan lagi.");
  }
  const row = data[0] as Row;
  const reward = await db().from("wb_rewards").select("id,photos").eq("id", row.reward_id as string).maybeSingle();
  const photo = reward.data ? (await firstPhotos([reward.data as Row])).get(row.reward_id as string) ?? null : null;
  return { claim: toClaim(row, photo), saldo: await mySaldo(member.id) };
}

/* ---------- Admin Wellbeing → Hadiah ---------- */

const ADMIN_CLAIM_COLUMNS = `${CLAIM_COLUMNS},person:employees!wb_reward_claims_employee_id_fkey(full_name,nickname,department)`;

async function adminRewardOf(row: Row, counts: ReturnType<typeof claimCounts>): Promise<WbAdminReward> {
  const keys = (row.photos as string[] | null) ?? [];
  const urls = await Promise.all(keys.map(async key => (await photoUrls([key]))[0] ?? null));
  return {
    id: row.id as string, title: row.title as string, description: (row.description as string) ?? "", photos: keys.map((key, index) => ({ key, url: urls[index] })),
    cost: Number(row.cost), stock: row.stock === null || row.stock === undefined ? null : Number(row.stock), perPerson: Number(row.per_person), active: row.active as boolean,
    taken: counts.taken.get(row.id as string) ?? 0, waiting: counts.waiting.get(row.id as string) ?? 0,
    updatedAt: row.updated_at as string, updatedBy: (row.updated_by_name as string | null) ?? null,
  };
}

const emptyCounts = (): Record<ClaimStatus, number> => Object.fromEntries(CLAIM_STATUSES.map(status => [status, 0])) as Record<ClaimStatus, number>;

/** GET /api/admin/wellbeing/rewards: every reward, the claims (all still waiting, and the latest others), and how many in each status. */
export async function adminRewards(): Promise<WbRewardsAdmin> {
  const [rewardsRead, statusRead, openRead, latestRead] = await Promise.all([
    db().from("wb_rewards").select(REWARD_COLUMNS).order("active", { ascending: false }).order("sort").order("cost").order("id"),
    readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").order("id").range(from, to)),
    readAll((from, to) => db().from("wb_reward_claims").select(ADMIN_CLAIM_COLUMNS).in("status", ["requested", "approved"]).order("created_at").order("id").range(from, to)),
    db().from("wb_reward_claims").select(ADMIN_CLAIM_COLUMNS).in("status", ["delivered", "rejected", "cancelled"]).order("updated_at", { ascending: false }).order("id").limit(RECENT_CLAIMS),
  ]);
  for (const read of [rewardsRead.error, statusRead.error, openRead.error, latestRead.error]) if (read) { if (missing(read)) return { migrated: false, rewards: [], claims: [], counts: emptyCounts() }; databaseError(read); }
  const statuses = statusRead.rows as { reward_id: string; status: ClaimStatus }[];
  const counts = claimCounts(statuses);
  const byStatus = emptyCounts();
  for (const row of statuses) byStatus[row.status] += 1;
  const rewardRows = (rewardsRead.data ?? []) as Row[];
  const photoOf = await firstPhotos(rewardRows);
  const claims = [...openRead.rows, ...((latestRead.data ?? []) as Row[])].map(row => toAdminClaim(row, photoOf.get(row.reward_id as string) ?? null));
  return { migrated: true, rewards: await Promise.all(rewardRows.map(row => adminRewardOf(row, counts))), claims, counts: byStatus };
}

/** POST /api/admin/wellbeing/rewards/uploads: a key of the server's choosing for one reward photo, its upload address (ten minutes) and token. */
export async function startRewardUpload(input: UploadStartInput, now = new Date()): Promise<WbRewardUpload> {
  if (!isR2Configured()) throw storageNotReady();
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Unggah foto belum disiapkan. Isi WAM_SESSION_SECRET pada server.");
  const photo = { key: rewardPhotoKey(randomUUID(), input.mime), mime: input.mime, size: input.size };
  return { key: photo.key, uploadUrl: await presignUpload(photo.key, photo.mime, photo.size), token: uploadToken(secret, photo, REWARD_UPLOAD_SUBJECT, now.getTime()) };
}

const refused = (field: string, message: string) => new ServiceError(422, message, { [field]: [message] });

/**
 * The photos to store: the ones the reward already has (in any order), and photos uploaded just now
 * (a key the server made, its token, and the file really a photo of that size). Anything else is refused.
 */
async function checkedPhotos(input: RewardInput, kept: readonly string[], now: Date): Promise<string[]> {
  const secret = praWamSecret();
  for (const photo of input.photos) {
    if (!photo.upload) { if (!kept.includes(photo.key)) throw refused("photos", "Foto tidak dikenali. Unggah ulang fotonya."); continue; }
    const file = { key: photo.key, mime: photo.upload.mime, size: photo.upload.size };
    if (!isRewardPhotoKey(photo.key, photo.upload.mime) || !uploadTokenMatches(secret, photo.upload.token, file, REWARD_UPLOAD_SUBJECT, now.getTime())) {
      throw refused("photos", "Foto tidak dikenali atau sudah kedaluwarsa. Unggah ulang fotonya.");
    }
    if (!isR2Configured()) throw storageNotReady();
    try { await verifyUpload(photo.key, photo.upload.size, ["jpeg", "png", "webp"]); }
    catch (error) { await removeObjects([photo.key]).catch(() => undefined); throw error; }
  }
  return input.photos.map(photo => photo.key);
}

const rowOf = (input: RewardInput, photos: string[], actor: Actor) => ({
  title: input.title, description: input.description, photos, cost: input.cost, stock: input.stock, per_person: input.perPerson, active: input.active,
  updated_at: new Date().toISOString(), updated_by_name: actor.name.slice(0, 150),
});
/** Only our own reward photos are ever deleted from storage (links of prizes from the old app are left alone). */
const ownKeys = (keys: readonly string[]) => keys.filter(key => key.startsWith(REWARD_PHOTO_PREFIX));

async function viewOf(row: Row): Promise<WbAdminReward> {
  const { rows, error } = await readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").eq("reward_id", row.id as string).order("id").range(from, to));
  if (error) failRewards(error);
  return adminRewardOf(row, claimCounts(rows as { reward_id: string; status: ClaimStatus }[]));
}

export async function createReward(input: RewardInput, actor: Actor, now = new Date()): Promise<WbAdminReward> {
  const photos = await checkedPhotos(input, [], now);
  const { data, error } = await db().from("wb_rewards").insert(rowOf(input, photos, actor)).select(REWARD_COLUMNS).single();
  if (error) { await removeObjects(ownKeys(photos)).catch(() => undefined); failRewards(error); }
  return viewOf(data as Row);
}

export async function updateReward(id: string, input: RewardInput, actor: Actor, now = new Date()): Promise<WbAdminReward> {
  const current = await db().from("wb_rewards").select("id,photos").eq("id", id).maybeSingle();
  if (current.error) failRewards(current.error);
  if (!current.data) throw new ServiceError(404, "Hadiah tidak ditemukan.");
  const before = ((current.data as Row).photos as string[] | null) ?? [];
  const photos = await checkedPhotos(input, before, now);
  const { data, error } = await db().from("wb_rewards").update(rowOf(input, photos, actor)).eq("id", id).select(REWARD_COLUMNS).single();
  if (error) failRewards(error);
  // Photos taken off the reward: removed from storage once the reward no longer points at them.
  await removeObjects(ownKeys(before.filter(key => !photos.includes(key)))).catch(() => undefined);
  return viewOf(data as Row);
}

/** DELETE: only a reward nobody ever claimed (a claimed one is switched off instead, so its history stays). */
export async function deleteReward(id: string): Promise<void> {
  const claimed = await db().from("wb_reward_claims").select("id").eq("reward_id", id).limit(1);
  if (claimed.error) failRewards(claimed.error);
  if (claimed.data?.length) throw new ServiceError(409, "Hadiah ini sudah pernah diklaim. Matikan Aktif saja supaya tidak tampil lagi; riwayat klaimnya tetap ada.");
  const { data, error } = await db().from("wb_rewards").delete().eq("id", id).select("photos");
  if (error) failRewards(error);
  if (!data?.length) throw new ServiceError(404, "Hadiah tidak ditemukan.");
  await removeObjects(ownKeys(((data[0] as Row).photos as string[] | null) ?? [])).catch(() => undefined);
}

/**
 * POST /api/admin/wellbeing/rewards/claims/<id>: approve a request, mark it handed over, or reject it
 * with a reason (the points go back). Only from the statuses that allow it, so two admins never
 * decide the same claim twice (409 when it changed in between).
 */
export async function decideClaim(id: string, input: ClaimDecisionInput, actor: Actor): Promise<WbAdminClaim> {
  const at = new Date().toISOString(), name = actor.name.slice(0, 150);
  const changes: Row = { status: claimActionTo[input.action], updated_at: at };
  if (input.action === "deliver") Object.assign(changes, { delivered_by_name: name, delivered_at: at });
  else Object.assign(changes, { decided_by_name: name, decided_at: at, ...(input.action === "reject" ? { reason: input.reason } : {}) });
  const { data, error } = await db().from("wb_reward_claims").update(changes).eq("id", id).in("status", claimActionFrom[input.action]).select(ADMIN_CLAIM_COLUMNS);
  if (error) failRewards(error);
  if (!data?.length) {
    const { data: found } = await db().from("wb_reward_claims").select("id").eq("id", id).maybeSingle();
    if (!found) throw new ServiceError(404, "Klaim tidak ditemukan.");
    throw new ServiceError(409, "Status klaim ini sudah berubah. Muat ulang daftarnya.");
  }
  const row = data[0] as Row;
  const reward = await db().from("wb_rewards").select("id,photos").eq("id", row.reward_id as string).maybeSingle();
  return toAdminClaim(row, reward.data ? (await firstPhotos([reward.data as Row])).get(row.reward_id as string) ?? null : null);
}
