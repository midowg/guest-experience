import "server-only";
import { rarityOf } from "@/lib/pra-wam/figures";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Voucher re-roll tickets (18 Nov 2026, migration 202611180003, docs/rancangan-wellbeing.md "Voucher
 * re-roll"): a ticket bought in WLM's Hadiah (or given by super admin) re-rolls my tokoh card once,
 * whenever I like. Before the migration there are no tickets, and nothing here fails.
 */

export type OpenTicket = { id: string; legendary: boolean };
/** What a used ticket changed: the card before (to put it back) and the figure and rarity before and after. */
export type TicketResult = {
  before: { figure_id: string; figure_slot: number | null; tier_key: string; reason: string | null; combo: string; dna: string };
  from: string; to: string; fromId: string; toId: string; tierFrom: string; tierTo: string; tierRoll: number | null;
};

type DbError = { code?: string; message?: string };
/** The tickets' table is not there yet (the migration has not run). */
export const ticketsMissing = (error: DbError | null) => !!error && (["PGRST205", "42P01"].includes(error.code ?? "") || /wb_reroll_tickets/.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? ""));
const db = () => createPrivilegedClient();

/** The Legendary tier of a catalog (rarity 4), or null when it has none. */
export const legendTierOf = (tiers: readonly { key: string; sort: number }[]) => tiers.find(tier => rarityOf(tier) === 4)?.key ?? null;

/** My tickets not used yet, oldest first (each re-rolls once). */
export async function openTickets(employeeId: string): Promise<OpenTicket[]> {
  const { data, error } = await db().from("wb_reroll_tickets").select("id,legendary").eq("employee_id", employeeId).eq("status", "open").order("created_at").order("id");
  if (error) { if (ticketsMissing(error)) return []; databaseError(error); }
  return ((data ?? []) as { id: string; legendary: boolean }[]).map(row => ({ id: row.id, legendary: row.legendary }));
}

/**
 * The Legendary places held by unused Legendary tickets, and by Legendary voucher claims still waiting for
 * the admin (18 Nov 2026, migration 202611180004), of other people who are not Legendary yet: added to the
 * cards counted against the Legendary cap, so a draw never takes a place a voucher holds.
 */
export async function legendReserved(formId: string, legendKey: string | null, exceptEmployee: string | null): Promise<number> {
  if (!legendKey) return 0;
  const { data, error } = await db().from("wb_reroll_tickets").select("employee_id").eq("legendary", true).eq("status", "open");
  if (error) { if (ticketsMissing(error)) return 0; databaseError(error); }
  const holders = new Set(((data ?? []) as { employee_id: string }[]).map(row => row.employee_id));
  for (const id of await waitingLegendClaims()) holders.add(id);
  if (exceptEmployee) holders.delete(exceptEmployee);
  if (!holders.size) return 0;
  const { data: legends, error: legendsError } = await db().from("cq_person_cards").select("employee_id").eq("form_id", formId).eq("trial", false).eq("tier_key", legendKey).in("employee_id", [...holders]);
  if (legendsError) databaseError(legendsError);
  for (const row of (legends ?? []) as { employee_id: string }[]) holders.delete(row.employee_id);
  return holders.size;
}

/** Who has a Legendary voucher claim still waiting for the admin (none before the rewards' kind is there). */
async function waitingLegendClaims(): Promise<string[]> {
  const rewards = await db().from("wb_rewards").select("id").eq("kind", "reroll_legendary");
  const ids = ((rewards.data ?? []) as { id: string }[]).map(row => row.id);
  if (rewards.error || !ids.length) return [];
  const { data, error } = await db().from("wb_reward_claims").select("employee_id").in("reward_id", ids).in("status", ["requested", "approved"]);
  if (error) databaseError(error);
  return ((data ?? []) as { employee_id: string }[]).map(row => row.employee_id);
}

/** Takes my ticket for a re-roll now: only while it is still mine and unused, so two taps use it once. */
export async function takeTicket(employeeId: string, ticketId: string, formId: string): Promise<OpenTicket> {
  const at = new Date().toISOString();
  const { data, error } = await db().from("wb_reroll_tickets").update({ status: "used", used_at: at, form_id: formId, updated_at: at })
    .eq("id", ticketId).eq("employee_id", employeeId).eq("status", "open").select("id,legendary");
  if (error) { if (ticketsMissing(error)) throw new ServiceError(409, "Voucher re-roll belum tersedia."); databaseError(error); }
  const row = (data ?? [])[0] as { id: string; legendary: boolean } | undefined;
  if (!row) throw new ServiceError(409, "Voucher ini sudah dipakai atau dibatalkan. Muat ulang halamannya.");
  return { id: row.id, legendary: row.legendary };
}

/** The re-roll did not happen after all: the ticket is unused again. */
export async function releaseTicket(ticketId: string): Promise<void> {
  const { error } = await db().from("wb_reroll_tickets").update({ status: "open", used_at: null, form_id: null, updated_at: new Date().toISOString() })
    .eq("id", ticketId).eq("status", "used").is("result", null);
  if (error) console.error("Voucher re-roll belum dapat dikembalikan", error);
}

/** Keeps what the re-roll changed, for super admin (and to put the card back). Never fails the re-roll. */
export async function recordTicket(ticketId: string, result: TicketResult): Promise<void> {
  const { error } = await db().from("wb_reroll_tickets").update({ result, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) console.error("Hasil voucher re-roll belum tersimpan", error);
}
