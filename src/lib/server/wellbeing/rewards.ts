import "server-only";
import { randomUUID } from "node:crypto";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type { WbClaimResult, WbRewards, WbSaldo } from "@/lib/wellbeing/app-types";
import {
  CLAIM_STATUSES, MIGRATION_WELLBEING_REWARD_TYPES, MIGRATION_WELLBEING_REWARDS, MIGRATION_WELLBEING_VOUCHERS, claimActionFrom, claimActionTo, codeLines, isReroll,
  needsRewardTypes, rewardEnded, rewardShape, wibToday,
  type ClaimDecisionInput, type ClaimRequestInput, type ClaimStatus, type CodeMode, type Delivery, type RewardInput, type RewardKind, type UploadStartInput,
} from "@/lib/wellbeing/rules";
import type { WbAdminClaim, WbAdminReward, WbRewardCodes, WbRewardUpload, WbRewardsAdmin } from "@/lib/wellbeing/types";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import type { Member } from "../pra-wam/session";
import { isR2Configured, presignUpload, removeObjects, verifyUpload } from "../r2";
import type { Actor } from "./admin";
import { REWARD_PHOTO_PREFIX, REWARD_UPLOAD_SUBJECT, claimCounts, claimRefusal, claimRewardOf, isRewardPhotoKey, rewardPhotoKey, saldoFrom, toAdminClaim, toClaim, toReward, type ClaimReward } from "./rewards-rules";
import { db, missing, photoUrls, readAll, readTotals, type Row } from "./shared";
import { uploadToken, uploadTokenMatches } from "./uploads";
import { claimVoucherRow, ticketsOfClaims, voucherContext, vouchersReady, type VoucherContext } from "./vouchers";

/*
 * Hadiah (18 Nov 2026, migration 202611180001, docs/rancangan-wellbeing.md "Hadiah"): employees trade
 * points for prizes; a claim holds points from the saldo until the admin hands the prize over (or
 * rejects it, or the employee cancels it). The board and the total points never change. Before the
 * migration every read answers `migrated: false` and every write says it waits for the migration.
 *
 * Jenis hadiah dan voucher kode (18 Nov 2026, migration 202611180004): Uang, Voucher (a code or a link)
 * and Lainnya, the delivery per reward, and a voucher's codes. Before that migration a reward is a prize
 * or a re-roll voucher, as before.
 */

const REWARD_COLUMNS = "id,title,description,photos,cost,stock,per_person,active,sort,updated_at,updated_by_name";
const TYPE_COLUMNS = "delivery,code_mode,shared_code,valid_until,how_to";
/** With the reward's kind once the voucher migration ran (202611180003), and its delivery and codes once 202611180004 ran. */
const rewardColumns = (vouchers: boolean, types: boolean) => [REWARD_COLUMNS, vouchers ? "kind" : "", types ? TYPE_COLUMNS : ""].filter(Boolean).join(",");
/** What a claim needs of its reward: the first photo, the kind, and a voucher's code mode, last day and how to use it. */
const infoColumns = (vouchers: boolean, types: boolean) => ["id,photos", vouchers ? "kind" : "", types ? "code_mode,valid_until,how_to" : ""].filter(Boolean).join(",");
const kindOf = (row: Row): RewardKind => (row.kind as RewardKind | undefined) ?? "barang";
const CLAIM_COLUMNS = "id,reward_id,employee_id,cost,reward_title,status,note,reason,decided_by_name,decided_at,delivered_by_name,delivered_at,created_at";
const claimColumns = (types: boolean) => types ? `${CLAIM_COLUMNS},code` : CLAIM_COLUMNS;
const HOLDING: ClaimStatus[] = ["requested", "approved", "delivered"];
const RECENT_CLAIMS = 200;

const waitingRewards = () => new ServiceError(503, `Hadiah menunggu migrasi ${MIGRATION_WELLBEING_REWARDS}. Minta pemilik menjalankannya di Supabase SQL Editor.`);
const failRewards = (error: { code?: string; message: string }): never => { if (missing(error)) throw waitingRewards(); return databaseError(error); };
const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum siap. Coba lagi nanti.");
const emptySaldo: WbSaldo = { earned: 0, held: 0, available: 0 };
/** Up to the first photo of each reward, ready to show (claims show it as their picture). */
const firstPhotos = async (rows: Row[]) => new Map(await Promise.all(rows.map(async row => [row.id as string, (await photoUrls(((row.photos as string[] | null) ?? []).slice(0, 1)))[0] ?? null] as const)));
const infoOf = (rows: Row[]) => new Map<string, ClaimReward>(rows.map(row => [row.id as string, claimRewardOf(row)]));

const waitingTypes = () => new ServiceError(503, `Jenis Uang, Voucher kode, dan Lainnya menunggu migrasi ${MIGRATION_WELLBEING_REWARD_TYPES}. Minta pemilik menjalankannya di Supabase SQL Editor.`);
let typesAt = 0, typesNow = false;
/** Whether migration 202611180004 ran (the codes' table is there); asked again at most every 30 seconds. */
export async function rewardTypesReady(): Promise<boolean> {
  if (Date.now() - typesAt < 30_000) return typesNow;
  const { error } = await db().from("wb_reward_codes").select("id").limit(1);
  if (error && !missing(error)) databaseError(error);
  typesNow = !error; typesAt = Date.now();
  return typesNow;
}
/** For tests: forget the last answer. */
export const forgetRewardTypesReady = () => { typesAt = 0; };

/** A voucher's unique codes per reward: how many there are, and how many are not given yet. */
async function codeCounts(rewardIds: readonly string[]): Promise<Map<string, { total: number; free: number }>> {
  const out = new Map<string, { total: number; free: number }>();
  if (!rewardIds.length) return out;
  const { rows, error } = await readAll((from, to) => db().from("wb_reward_codes").select("reward_id,claim_id").in("reward_id", [...rewardIds]).order("id").range(from, to), 60);
  if (error) failRewards(error);
  for (const id of rewardIds) out.set(id, { total: 0, free: 0 });
  for (const row of rows) { const count = out.get(row.reward_id as string)!; count.total += 1; if (!row.claim_id) count.free += 1; }
  return out;
}
const poolIds = (rows: Row[]) => rows.filter(row => row.kind === "voucher" && row.code_mode === "pool").map(row => row.id as string);

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

/** A voucher's state for me: no card yet, or (Legendary) no Legendary place left; null when it may be claimed. */
const blockedFor = (kind: RewardKind, context: VoucherContext | null) => !isReroll(kind) ? null
  : !context?.hasCard ? "no_card" as const : kind === "reroll_legendary" && context.legendFull ? "legend_full" as const : null;

/** GET /api/wellbeing/rewards: my saldo, the rewards that are on (a voucher past its last day left out), and my claims (newest first). */
export async function myRewards(member: Member): Promise<WbRewards> {
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const [rewardsRead, mineRead, holdingRead, earned] = await Promise.all([
    db().from("wb_rewards").select(rewardColumns(vouchers, types)).eq("active", true).order("sort").order("cost").order("id"),
    db().from("wb_reward_claims").select(claimColumns(types)).eq("employee_id", member.id).order("created_at", { ascending: false }).order("id").limit(RECENT_CLAIMS),
    readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").in("status", HOLDING).order("id").range(from, to)),
    myEarned(member.id),
  ]);
  const notYet: WbRewards = { migrated: false, saldo: emptySaldo, rewards: [], claims: [], cardUrl: null };
  for (const read of [rewardsRead.error, mineRead.error, holdingRead.error]) if (read) { if (missing(read)) return notYet; databaseError(read); }
  if (!earned.migrated) return notYet;
  const mine = (mineRead.data ?? []) as unknown as Row[];
  // The saldo counts every claim of mine that holds points, not only the latest shown.
  const holdingMine = mine.length < RECENT_CLAIMS ? mine : ((await db().from("wb_reward_claims").select("status,cost").eq("employee_id", member.id).in("status", HOLDING)).data ?? []) as Row[];
  const saldo = saldoFrom(earned.earned, holdingMine.map(row => ({ status: row.status as ClaimStatus, cost: Number(row.cost) })));
  const { taken } = claimCounts(holdingRead.rows as { reward_id: string; status: ClaimStatus }[]);
  const myCount = new Map<string, number>();
  for (const row of mine) if (HOLDING.includes(row.status as ClaimStatus)) myCount.set(row.reward_id as string, (myCount.get(row.reward_id as string) ?? 0) + 1);
  const activeRows = (rewardsRead.data ?? []) as unknown as Row[];
  const today = wibToday();
  const rewardRows = activeRows.filter(row => !rewardEnded((row.valid_until as string | null | undefined) ?? null, today));
  // Vouchers: whether my card is out and a Legendary place is left, and each voucher claim's ticket; unique codes not given yet.
  const [tickets, codes] = await Promise.all([ticketsOfClaims(mine.map(row => row.id as string)), types ? codeCounts(poolIds(rewardRows)) : Promise.resolve(new Map<string, { total: number; free: number }>())]);
  const context = vouchers && (rewardRows.some(row => isReroll(kindOf(row))) || tickets.size) ? await voucherContext(member.id) : null;
  const rewards = await Promise.all(rewardRows.map(async row => toReward(row, await photoUrls((row.photos as string[] | null) ?? []), taken.get(row.id as string) ?? 0,
    myCount.get(row.id as string) ?? 0, saldo.available, blockedFor(kindOf(row), context), codes.get(row.id as string)?.free ?? null)));
  // A claim's picture and voucher details: its reward's (also for rewards that are off or over now).
  const missingIds = [...new Set(mine.map(row => row.reward_id as string))].filter(id => !activeRows.some(row => row.id === id));
  const others = missingIds.length ? ((await db().from("wb_rewards").select(infoColumns(vouchers, types)).in("id", missingIds)).data ?? []) as unknown as Row[] : [];
  const photoOf = await firstPhotos([...activeRows, ...others]);
  const info = infoOf([...activeRows, ...others]);
  return {
    migrated: true, saldo, rewards, cardUrl: context?.cardUrl ?? null,
    claims: mine.map(row => toClaim(row, photoOf.get(row.reward_id as string) ?? null, tickets.get(row.id as string) ?? null, info.get(row.reward_id as string) ?? null)),
  };
}

/** A refusal raised by wb_request_reward or wb_claim_reroll, in words (409), or a database error. */
function refuse(error: { code?: string; message: string }): never {
  const refusal = claimRefusal(error.message);
  if (refusal) throw new ServiceError(409, refusal.message, { code: [refusal.code] });
  return databaseError(error);
}

/**
 * POST /api/wellbeing/rewards/claims: ask for a reward; the points are held at once (409 with the reason
 * when it cannot be). As the reward's delivery says, the claim waits for the admin, is approved at once,
 * or is handed over at once (a code voucher's code shows then).
 */
export async function requestReward(member: Member, input: ClaimRequestInput): Promise<WbClaimResult> {
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const found = await db().from("wb_rewards").select(infoColumns(vouchers, types)).eq("id", input.rewardId).maybeSingle();
  if (found.error) failRewards(found.error);
  const reward = found.data as unknown as Row | null;
  let row: Row;
  // A re-roll voucher (18 Nov 2026): handed over at once with its ticket, no admin.
  if (reward && isReroll(kindOf(reward))) {
    try { row = await claimVoucherRow(member.id, input.rewardId); }
    catch (error) { if (error instanceof ServiceError) throw error; refuse(error as { code?: string; message: string }); }
  } else {
    const { data, error } = await db().rpc("wb_request_reward", { p_employee: member.id, p_reward: input.rewardId, p_note: input.note });
    if (error) {
      if (missing(error) || /wb_request_reward/.test(error.message ?? "")) throw waitingRewards();
      refuse(error);
    }
    row = (Array.isArray(data) ? data[0] : data) as Row;
  }
  const photo = reward ? (await firstPhotos([reward])).get(input.rewardId) ?? null : null;
  const voucher = reward && isReroll(kindOf(reward)) ? { legendary: kindOf(reward) === "reroll_legendary", status: "open" as const } : null;
  return { claim: toClaim(row, photo, voucher, reward ? claimRewardOf(reward) : null), saldo: await mySaldo(member.id) };
}

/** POST /api/wellbeing/rewards/claims/<id>: cancel my claim while it still waits (the points come back, and a held code goes back). */
export async function cancelClaim(member: Member, id: string): Promise<WbClaimResult> {
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const { data, error } = await db().from("wb_reward_claims").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("employee_id", member.id).eq("status", "requested").select(claimColumns(types));
  if (error) failRewards(error);
  if (!data?.length) {
    const { data: found } = await db().from("wb_reward_claims").select("status").eq("id", id).eq("employee_id", member.id).maybeSingle();
    if (!found) throw new ServiceError(404, "Klaim tidak ditemukan.");
    throw new ServiceError(409, "Klaim ini sudah diproses admin, jadi tidak bisa dibatalkan lagi.");
  }
  const row = data[0] as unknown as Row;
  const reward = await db().from("wb_rewards").select(infoColumns(vouchers, types)).eq("id", row.reward_id as string).maybeSingle();
  const rewardRow = reward.data as unknown as Row | null;
  const photo = rewardRow ? (await firstPhotos([rewardRow])).get(row.reward_id as string) ?? null : null;
  return { claim: toClaim(row, photo, null, rewardRow ? claimRewardOf(rewardRow) : null), saldo: await mySaldo(member.id) };
}

/* ---------- Admin Wellbeing → Hadiah ---------- */

const adminClaimColumns = (types: boolean) => `${claimColumns(types)},person:employees!wb_reward_claims_employee_id_fkey(full_name,nickname,department)`;

async function adminRewardOf(row: Row, counts: ReturnType<typeof claimCounts>, codes: Map<string, { total: number; free: number }>): Promise<WbAdminReward> {
  const keys = (row.photos as string[] | null) ?? [];
  const urls = await Promise.all(keys.map(async key => (await photoUrls([key]))[0] ?? null));
  const kind = kindOf(row), codeMode = (row.code_mode as CodeMode | null | undefined) ?? null;
  return {
    id: row.id as string, title: row.title as string, description: (row.description as string) ?? "", photos: keys.map((key, index) => ({ key, url: urls[index] })),
    cost: Number(row.cost), stock: row.stock === null || row.stock === undefined ? null : Number(row.stock), perPerson: Number(row.per_person), active: row.active as boolean, kind,
    delivery: (row.delivery as Delivery | undefined) ?? (isReroll(kind) ? "auto" : "admin"), codeMode, sharedCode: (row.shared_code as string | null | undefined) ?? null,
    validUntil: (row.valid_until as string | null | undefined) ?? null, howTo: (row.how_to as string | undefined) ?? "",
    codes: kind === "voucher" && codeMode === "pool" ? codes.get(row.id as string) ?? { total: 0, free: 0 } : null,
    taken: counts.taken.get(row.id as string) ?? 0, waiting: counts.waiting.get(row.id as string) ?? 0,
    updatedAt: row.updated_at as string, updatedBy: (row.updated_by_name as string | null) ?? null,
  };
}

const emptyCounts = (): Record<ClaimStatus, number> => Object.fromEntries(CLAIM_STATUSES.map(status => [status, 0])) as Record<ClaimStatus, number>;

/** GET /api/admin/wellbeing/rewards: every reward, the claims (all still waiting, and the latest others), and how many in each status. */
export async function adminRewards(): Promise<WbRewardsAdmin> {
  const [vouchersOn, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const [rewardsRead, statusRead, openRead, latestRead] = await Promise.all([
    db().from("wb_rewards").select(rewardColumns(vouchersOn, types)).order("active", { ascending: false }).order("sort").order("cost").order("id"),
    readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").order("id").range(from, to)),
    readAll((from, to) => db().from("wb_reward_claims").select(adminClaimColumns(types)).in("status", ["requested", "approved"]).order("created_at").order("id").range(from, to)),
    db().from("wb_reward_claims").select(adminClaimColumns(types)).in("status", ["delivered", "rejected", "cancelled"]).order("updated_at", { ascending: false }).order("id").limit(RECENT_CLAIMS),
  ]);
  for (const read of [rewardsRead.error, statusRead.error, openRead.error, latestRead.error]) if (read) {
    if (missing(read)) return { migrated: false, rewards: [], claims: [], counts: emptyCounts(), vouchersReady: false, typesReady: false };
    databaseError(read);
  }
  const statuses = statusRead.rows as { reward_id: string; status: ClaimStatus }[];
  const counts = claimCounts(statuses);
  const byStatus = emptyCounts();
  for (const row of statuses) byStatus[row.status] += 1;
  const rewardRows = (rewardsRead.data ?? []) as unknown as Row[];
  const [photoOf, codes] = await Promise.all([firstPhotos(rewardRows), types ? codeCounts(poolIds(rewardRows)) : Promise.resolve(new Map<string, { total: number; free: number }>())]);
  const info = infoOf(rewardRows);
  const claims = [...openRead.rows, ...((latestRead.data ?? []) as unknown as Row[])].map(row => toAdminClaim(row, photoOf.get(row.reward_id as string) ?? null, info.get(row.reward_id as string) ?? null));
  return { migrated: true, rewards: await Promise.all(rewardRows.map(row => adminRewardOf(row, counts, codes))), claims, counts: byStatus, vouchersReady: vouchersOn, typesReady: types };
}

/** GET /api/admin/wellbeing/rewards/<id>/codes: a voucher's unique codes, oldest first, and who got each. */
export async function rewardCodes(id: string): Promise<WbRewardCodes> {
  if (!(await rewardTypesReady())) throw waitingTypes();
  const { rows, error } = await readAll((from, to) => db().from("wb_reward_codes")
    .select("id,code,claim_id,given_at,created_at,claim:wb_reward_claims!wb_reward_codes_claim_id_fkey(person:employees!wb_reward_claims_employee_id_fkey(full_name,nickname))")
    .eq("reward_id", id).order("created_at").order("id").range(from, to), 60);
  if (error) failRewards(error);
  return {
    codes: rows.map(row => {
      const person = ((row.claim as Row | null)?.person ?? null) as Row | null;
      return { id: row.id as string, code: row.code as string, claimId: (row.claim_id as string | null) ?? null, employeeName: person ? ((person.nickname as string) || (person.full_name as string)) ?? null : null,
        givenAt: (row.given_at as string | null) ?? null, createdAt: row.created_at as string };
    }),
  };
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

/** The row to store: the kind once the voucher migration ran, the delivery and codes once 202611180004 ran (a kind that needs one waits for it). */
function rowOf(input: RewardInput, actor: Actor, vouchers: boolean, types: boolean) {
  if (!vouchers && isReroll(input.kind)) throw new ServiceError(503, `Voucher re-roll menunggu migrasi ${MIGRATION_WELLBEING_VOUCHERS}. Minta pemilik menjalankannya di Supabase SQL Editor.`);
  if (!types && needsRewardTypes(input.kind)) throw waitingTypes();
  const shape = rewardShape(input);
  return {
    title: input.title, description: input.description, cost: input.cost, stock: types ? shape.stock : input.stock, per_person: input.perPerson, active: input.active,
    ...(vouchers ? { kind: input.kind } : {}),
    ...(types ? { delivery: shape.delivery, code_mode: shape.codeMode, shared_code: shape.sharedCode, valid_until: shape.validUntil, how_to: shape.howTo } : {}),
    updated_at: new Date().toISOString(), updated_by_name: actor.name.slice(0, 150),
  };
}

/** A voucher's unique codes, saved with it: free ones taken off, new ones added (a code it has already is left out). */
async function saveCodes(rewardId: string, input: RewardInput, actor: Actor, types: boolean) {
  if (!types) return;
  if (input.removeCodes.length) {
    const { error } = await db().from("wb_reward_codes").delete().eq("reward_id", rewardId).is("claim_id", null).in("id", input.removeCodes);
    if (error) failRewards(error);
  }
  const add = codeLines(input.addCodes.join("\n"));
  if (!add.length || rewardShape(input).codeMode !== "pool") return;
  const name = actor.name.slice(0, 150);
  for (let index = 0; index < add.length; index += 500) {
    const { error } = await db().from("wb_reward_codes").upsert(add.slice(index, index + 500).map(code => ({ reward_id: rewardId, code, created_by_name: name })), { onConflict: "reward_id,code", ignoreDuplicates: true });
    if (error) failRewards(error);
  }
}

/** Only our own reward photos are ever deleted from storage (links of prizes from the old app are left alone). */
const ownKeys = (keys: readonly string[]) => keys.filter(key => key.startsWith(REWARD_PHOTO_PREFIX));

async function viewOf(id: string, vouchers: boolean, types: boolean): Promise<WbAdminReward> {
  const [found, claims, codes] = await Promise.all([
    db().from("wb_rewards").select(rewardColumns(vouchers, types)).eq("id", id).single(),
    readAll((from, to) => db().from("wb_reward_claims").select("reward_id,status").eq("reward_id", id).order("id").range(from, to)),
    types ? codeCounts([id]) : Promise.resolve(new Map<string, { total: number; free: number }>()),
  ]);
  if (found.error) failRewards(found.error);
  if (claims.error) failRewards(claims.error);
  return adminRewardOf(found.data as unknown as Row, claimCounts(claims.rows as { reward_id: string; status: ClaimStatus }[]), codes);
}

export async function createReward(input: RewardInput, actor: Actor, now = new Date()): Promise<WbAdminReward> {
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const row = rowOf(input, actor, vouchers, types);
  const photos = await checkedPhotos(input, [], now);
  const { data, error } = await db().from("wb_rewards").insert({ ...row, photos }).select("id").single();
  if (error) { await removeObjects(ownKeys(photos)).catch(() => undefined); failRewards(error); }
  const id = (data as unknown as Row).id as string;
  await saveCodes(id, input, actor, types);
  return viewOf(id, vouchers, types);
}

export async function updateReward(id: string, input: RewardInput, actor: Actor, now = new Date()): Promise<WbAdminReward> {
  const current = await db().from("wb_rewards").select("id,photos").eq("id", id).maybeSingle();
  if (current.error) failRewards(current.error);
  if (!current.data) throw new ServiceError(404, "Hadiah tidak ditemukan.");
  const before = ((current.data as Row).photos as string[] | null) ?? [];
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const row = rowOf(input, actor, vouchers, types);
  const photos = await checkedPhotos(input, before, now);
  const { error } = await db().from("wb_rewards").update({ ...row, photos }).eq("id", id);
  if (error) failRewards(error);
  // Photos taken off the reward: removed from storage once the reward no longer points at them.
  await removeObjects(ownKeys(before.filter(key => !photos.includes(key)))).catch(() => undefined);
  await saveCodes(id, input, actor, types);
  return viewOf(id, vouchers, types);
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
 * with a reason (the points go back, and a held code goes back). Only from the statuses that allow it,
 * so two admins never decide the same claim twice (409 when it changed in between). Handing over a
 * voucher whose code the admin types in needs that code.
 */
export async function decideClaim(id: string, input: ClaimDecisionInput, actor: Actor): Promise<WbAdminClaim> {
  const [vouchers, types] = await Promise.all([vouchersReady(), rewardTypesReady()]);
  const at = new Date().toISOString(), name = actor.name.slice(0, 150);
  const changes: Row = { status: claimActionTo[input.action], updated_at: at };
  if (input.action === "deliver") Object.assign(changes, { delivered_by_name: name, delivered_at: at });
  else Object.assign(changes, { decided_by_name: name, decided_at: at, ...(input.action === "reject" ? { reason: input.reason } : {}) });
  if (input.action === "deliver" && types) {
    const claim = await db().from("wb_reward_claims").select("reward_id,code").eq("id", id).maybeSingle();
    if (claim.error) failRewards(claim.error);
    if (!claim.data) throw new ServiceError(404, "Klaim tidak ditemukan.");
    const reward = await db().from("wb_rewards").select("kind,code_mode").eq("id", (claim.data as Row).reward_id as string).maybeSingle();
    if (reward.error) failRewards(reward.error);
    const typed = (reward.data as Row | null)?.kind === "voucher" && (reward.data as Row | null)?.code_mode === "manual" && !(claim.data as Row).code;
    if (typed && !input.code) throw refused("code", "Isi kode atau link voucher untuk karyawan.");
    if (typed) changes.code = input.code;
  }
  const { data, error } = await db().from("wb_reward_claims").update(changes).eq("id", id).in("status", claimActionFrom[input.action]).select(adminClaimColumns(types));
  if (error) failRewards(error);
  if (!data?.length) {
    const { data: found } = await db().from("wb_reward_claims").select("id").eq("id", id).maybeSingle();
    if (!found) throw new ServiceError(404, "Klaim tidak ditemukan.");
    throw new ServiceError(409, "Status klaim ini sudah berubah. Muat ulang daftarnya.");
  }
  const row = data[0] as unknown as Row;
  const reward = await db().from("wb_rewards").select(infoColumns(vouchers, types)).eq("id", row.reward_id as string).maybeSingle();
  const rewardRow = reward.data as unknown as Row | null;
  return toAdminClaim(row, rewardRow ? (await firstPhotos([rewardRow])).get(row.reward_id as string) ?? null : null, rewardRow ? claimRewardOf(rewardRow) : null);
}
