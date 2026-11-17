import "server-only";
import { praWamPath } from "@/lib/routes";
import type { WbVoucher, WbVoucherCard, WbVouchersAdmin } from "@/lib/wellbeing/types";
import { MIGRATION_WELLBEING_VOUCHERS, type ClaimStatus, type TicketStatus, type VoucherActionInput, type VoucherGrantInput } from "@/lib/wellbeing/rules";
import { ServiceError } from "../config";
import { listEmployees } from "../employees";
import { databaseError } from "../http";
import { catalogOf, restoreVoucherCard, type Catalog } from "../pra-wam/cards";
import { currentForm } from "../pra-wam/questionnaire";
import { legendReserved, legendTierOf, ticketsMissing, type TicketResult } from "../pra-wam/reroll-tickets";
import { db, type Row } from "./shared";

/*
 * Voucher re-roll (18 Nov 2026, migration 202611180003, docs/rancangan-wellbeing.md "Voucher re-roll"):
 * a Hadiah reward that re-rolls the WAM questionnaire's tokoh card. Claimed at once (wb_claim_reroll);
 * the ticket is used on the card page (cards.ts rerollCard). Super admin sees every ticket and can
 * cancel one, give the points back, put the card back, or give a voucher by hand.
 */

const waitingVouchers = () => new ServiceError(503, `Voucher re-roll menunggu migrasi ${MIGRATION_WELLBEING_VOUCHERS}. Minta pemilik menjalankannya di Supabase SQL Editor.`);

let readyAt = 0, readyNow = false;
/** Whether the migration ran (the tickets' table is there); asked again at most every 30 seconds. */
export async function vouchersReady(): Promise<boolean> {
  if (Date.now() - readyAt < 30_000) return readyNow;
  const { error } = await db().from("wb_reroll_tickets").select("id").limit(1);
  if (error && !ticketsMissing(error)) databaseError(error);
  readyNow = !error; readyAt = Date.now();
  return readyNow;
}

/** For tests: forget the last answer. */
export const forgetVouchersReady = () => { readyAt = 0; };

export type VoucherContext = {
  formId: string | null; legendKey: string | null;
  /** My tokoh card is out (not a trial, with a figure). */
  hasCard: boolean;
  /** No Legendary place is left for me (others hold every one, as cards or unused Legendary vouchers). */
  legendFull: boolean;
  /** The questionnaire's address, where my card is (and the vouchers are used). */
  cardUrl: string | null;
};
const noContext: VoucherContext = { formId: null, legendKey: null, hasCard: false, legendFull: true, cardUrl: null };

/** Whether others fill every Legendary place: their Legendary cards plus unused Legendary vouchers. */
export const legendFullFor = (cap: number | null, othersCards: number, othersReserved: number) => cap !== null && othersCards + othersReserved >= cap;

/** What a voucher needs for me now: the current questionnaire, my card, and a Legendary place. */
export async function voucherContext(employeeId: string): Promise<VoucherContext> {
  const form = await currentForm();
  if (!form) return noContext;
  const catalog = await catalogOf(form.id);
  if (!catalog) return { ...noContext, formId: form.id };
  const legendKey = legendTierOf(catalog.tiers);
  const cap = catalog.tiers.find(tier => tier.key === legendKey)?.maxCards ?? null;
  const [mine, legends, reserved] = await Promise.all([
    db().from("cq_person_cards").select("figure_id").eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", false).maybeSingle(),
    legendKey && cap !== null
      ? db().from("cq_person_cards").select("employee_id", { count: "exact", head: true }).eq("form_id", form.id).eq("trial", false).eq("tier_key", legendKey).neq("employee_id", employeeId)
      : Promise.resolve({ count: 0, error: null }),
    legendKey && cap !== null ? legendReserved(form.id, legendKey, employeeId) : Promise.resolve(0),
  ]);
  if (mine.error) databaseError(mine.error);
  if (legends.error) databaseError(legends.error);
  return {
    formId: form.id, legendKey, hasCard: !!(mine.data as { figure_id?: string | null } | null)?.figure_id,
    legendFull: !legendKey || legendFullFor(cap, legends.count ?? 0, reserved), cardUrl: praWamPath.questionnaire(form.slug),
  };
}

/** wb_claim_reroll: the voucher bought and handed over at once, with its ticket. Refusals are raised as reward_… */
export async function claimVoucherRow(employeeId: string, rewardId: string): Promise<Row> {
  const context = await voucherContext(employeeId);
  const { data, error } = await db().rpc("wb_claim_reroll", { p_employee: employeeId, p_reward: rewardId, p_form: context.formId, p_legend: context.legendKey });
  if (error) {
    if (ticketsMissing(error) || /wb_claim_reroll/.test(error.message ?? "")) throw waitingVouchers();
    throw error;
  }
  return (Array.isArray(data) ? data[0] : data) as Row;
}

/** The tickets of some claims (Klaim saya shows whether each voucher is used). */
export async function ticketsOfClaims(claimIds: readonly string[]): Promise<Map<string, { legendary: boolean; status: TicketStatus }>> {
  const out = new Map<string, { legendary: boolean; status: TicketStatus }>();
  if (!claimIds.length || !(await vouchersReady())) return out;
  const { data, error } = await db().from("wb_reroll_tickets").select("claim_id,legendary,status").in("claim_id", [...claimIds]);
  if (error) { if (ticketsMissing(error)) return out; databaseError(error); }
  for (const row of (data ?? []) as { claim_id: string; legendary: boolean; status: TicketStatus }[]) out.set(row.claim_id, { legendary: row.legendary, status: row.status });
  return out;
}

/* ---------- Super admin → Voucher re-roll ---------- */

const SUPER = "Super admin";
const TICKET_COLUMNS = "id,employee_id,legendary,claim_id,status,note,given_by_name,form_id,used_at,result,revoked_at,revoked_by_name,revoke_reason,restored_at,restored_by_name,created_at,"
  + "person:employees!wb_reroll_tickets_employee_id_fkey(full_name,nickname,department),"
  + "claim:wb_reward_claims!wb_reroll_tickets_claim_id_fkey(id,reward_title,cost,status)";

const cardOf = (catalog: Catalog | null, figureKey: string | undefined, tierKey: string | undefined): WbVoucherCard | null => {
  if (!figureKey || !tierKey) return null;
  return { figure: catalog?.figures.find(figure => figure.key === figureKey)?.name ?? figureKey, tier: catalog?.tiers.find(tier => tier.key === tierKey)?.name ?? tierKey };
};

/** A ticket row into what super admin sees. `figureNow`: the person's card's figure now (to tell whether it may go back). */
export function toVoucher(row: Row, catalog: Catalog | null, figureNow: string | null): WbVoucher {
  const person = (row.person ?? {}) as Row, claim = row.claim as Row | null, result = row.result as TicketResult | null;
  const status = row.status as TicketStatus;
  return {
    id: row.id as string, employeeId: row.employee_id as string, employeeName: ((person.nickname as string) || (person.full_name as string)) ?? "", department: (person.department as string) ?? "",
    legendary: row.legendary as boolean, status, note: (row.note as string) ?? "", createdAt: row.created_at as string,
    claim: claim ? { id: claim.id as string, title: claim.reward_title as string, cost: Number(claim.cost), status: claim.status as ClaimStatus } : null,
    givenBy: (row.given_by_name as string | null) ?? null, usedAt: (row.used_at as string | null) ?? null,
    before: cardOf(catalog, result?.from, result?.tierFrom), after: cardOf(catalog, result?.to, result?.tierTo),
    restorable: status === "used" && !!result && !row.restored_at && !!figureNow && figureNow === result.toId,
    revokedAt: (row.revoked_at as string | null) ?? null, revokedBy: (row.revoked_by_name as string | null) ?? null, revokeReason: (row.revoke_reason as string | null) ?? null,
    restoredAt: (row.restored_at as string | null) ?? null, restoredBy: (row.restored_by_name as string | null) ?? null,
  };
}

/** GET /api/admin/vouchers: every ticket (newest first), the people to give one to, and the Legendary quota. */
export async function adminVouchers(): Promise<WbVouchersAdmin> {
  const [read, employees, form] = await Promise.all([
    db().from("wb_reroll_tickets").select(TICKET_COLUMNS).order("created_at", { ascending: false }).order("id").limit(500),
    listEmployees(true).catch(() => ({ employees: [] })),
    currentForm(),
  ]);
  if (read.error) { if (ticketsMissing(read.error)) return { migrated: false, vouchers: [], people: [], legend: null }; databaseError(read.error); }
  const catalog = form ? await catalogOf(form.id) : null;
  const legendKey = catalog ? legendTierOf(catalog.tiers) : null;
  const cards = form ? await db().from("cq_person_cards").select("employee_id,figure_id,tier_key").eq("form_id", form.id).eq("trial", false) : { data: [], error: null };
  if (cards.error) databaseError(cards.error);
  const cardRows = (cards.data ?? []) as { employee_id: string; figure_id: string | null; tier_key: string }[];
  const figureNow = new Map(cardRows.map(row => [row.employee_id, row.figure_id]));
  const rows = (read.data ?? []) as unknown as Row[];
  const legendCards = legendKey ? cardRows.filter(row => row.tier_key === legendKey) : [];
  const legendHolders = new Set(legendCards.map(row => row.employee_id));
  const reserved = new Set(rows.filter(row => row.legendary && row.status === "open" && !legendHolders.has(row.employee_id as string)).map(row => row.employee_id as string));
  const legendTier = catalog?.tiers.find(tier => tier.key === legendKey);
  return {
    migrated: true,
    vouchers: rows.map(row => toVoucher(row, catalog, figureNow.get(row.employee_id as string) ?? null)),
    people: employees.employees.map(person => ({ id: person.id, name: person.full_name, nickname: person.nickname, department: person.department, category: person.category, hasCard: !!figureNow.get(person.id) })),
    legend: legendTier ? { name: legendTier.name, cap: legendTier.maxCards, cards: legendCards.length, reserved: reserved.size } : null,
  };
}

async function readTicket(id: string): Promise<Row> {
  const { data, error } = await db().from("wb_reroll_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle();
  if (error) { if (ticketsMissing(error)) throw waitingVouchers(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Voucher tidak ditemukan.");
  return data as unknown as Row;
}

async function viewOfTicket(id: string): Promise<WbVoucher> {
  const row = await readTicket(id);
  const form = await currentForm();
  const catalog = form ? await catalogOf(form.id) : null;
  const card = form ? await db().from("cq_person_cards").select("figure_id").eq("form_id", form.id).eq("employee_id", row.employee_id as string).eq("trial", false).maybeSingle() : null;
  return toVoucher(row, catalog, (card?.data as { figure_id?: string | null } | null)?.figure_id ?? null);
}

/** POST /api/admin/vouchers: a voucher by hand, without points. A Legendary one only while a Legendary place is left. */
export async function grantVoucher(input: VoucherGrantInput): Promise<WbVoucher> {
  if (!(await vouchersReady())) throw waitingVouchers();
  if (input.legendary) {
    const context = await voucherContext(input.employeeId);
    if (context.legendFull) throw new ServiceError(409, "Tempat Legendary sudah penuh. Naikkan batas Legendary di Admin WAM dulu, atau beri voucher biasa.");
  }
  const { data, error } = await db().from("wb_reroll_tickets")
    .insert({ employee_id: input.employeeId, legendary: input.legendary, note: input.note, given_by_name: SUPER }).select("id").single();
  if (error) { if (ticketsMissing(error)) throw waitingVouchers(); if (error.code === "23503") throw new ServiceError(404, "Karyawan tidak ditemukan."); databaseError(error); }
  return viewOfTicket((data as Row).id as string);
}

/** Gives a voucher claim's points back: the claim becomes Ditolak with the reason (Klaim saya shows it). */
async function refundClaim(claimId: string, reason: string): Promise<boolean> {
  const at = new Date().toISOString();
  const { data, error } = await db().from("wb_reward_claims").update({ status: "rejected", reason, decided_by_name: SUPER, decided_at: at, updated_at: at })
    .eq("id", claimId).in("status", ["requested", "approved", "delivered"]).select("id");
  if (error) databaseError(error);
  return !!data?.length;
}

/**
 * POST /api/admin/vouchers/<id>: revoke (an unused voucher; its points come back), refund (a used
 * voucher's points come back; the card stays), restore (the card as it was before the re-roll).
 */
export async function actOnVoucher(id: string, input: VoucherActionInput): Promise<WbVoucher> {
  const row = await readTicket(id);
  const status = row.status as TicketStatus, claim = row.claim as Row | null, at = new Date().toISOString();
  if (input.action === "revoke") {
    if (status !== "open") throw new ServiceError(409, "Voucher ini sudah dipakai atau dibatalkan. Muat ulang daftarnya.");
    const { data, error } = await db().from("wb_reroll_tickets").update({ status: "revoked", revoked_at: at, revoked_by_name: SUPER, revoke_reason: input.reason, updated_at: at })
      .eq("id", id).eq("status", "open").select("id");
    if (error) databaseError(error);
    if (!data?.length) throw new ServiceError(409, "Voucher ini baru saja dipakai. Muat ulang daftarnya.");
    if (claim) await refundClaim(claim.id as string, input.reason);
  } else if (input.action === "refund") {
    if (!claim) throw new ServiceError(409, "Voucher ini diberikan tanpa poin, jadi tidak ada poin yang dikembalikan.");
    if (status === "open") throw new ServiceError(409, "Voucher ini belum dipakai. Pakai Batalkan voucher supaya poinnya kembali.");
    if (!(await refundClaim(claim.id as string, input.reason))) throw new ServiceError(409, "Poin voucher ini sudah dikembalikan.");
  } else {
    const result = row.result as TicketResult | null;
    if (status !== "used" || !result || !row.form_id) throw new ServiceError(409, "Voucher ini belum dipakai, jadi tidak ada kartu yang dikembalikan.");
    if (row.restored_at) throw new ServiceError(409, "Kartu ini sudah dikembalikan.");
    await restoreVoucherCard(row.form_id as string, row.employee_id as string, id, result);
    const { error } = await db().from("wb_reroll_tickets").update({ restored_at: at, restored_by_name: SUPER, updated_at: at }).eq("id", id);
    if (error) databaseError(error);
  }
  return viewOfTicket(id);
}
