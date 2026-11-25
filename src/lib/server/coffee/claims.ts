import "server-only";
import { opensGaMode } from "@/lib/coffee/access";
import { claimNumbers, quotaFor, quotaGroupOf, usedInMonth, wibMonth } from "@/lib/coffee/quota";
import type { ClaimInput } from "@/lib/coffee/schemas";
import type { CoffeeMe, MyOrder, MyState } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import type { Member } from "../pra-wam/session";
import { holdsCoffeeGrant } from "./session";
import { readSettings } from "./settings";
import { ORDER_COLUMNS, coffeeError, db, toMyOrder, toOrder, type OrderRow } from "./store";

/*
 * An employee's own claims (/coffee). Whether a claim fits the quota is decided by the database
 * (coffee_submit_claim, under a lock); what is counted here is only for the screen. The person is
 * always the one signed in: no id from the request says who "I" am.
 */

/** The person's quota this month and their claims: this month's, and the last twenty of any month. */
export async function myState(member: Member, now = new Date()): Promise<MyState> {
  const month = wibMonth(now.toISOString());
  const [settings, found, holds] = await Promise.all([
    readSettings(),
    db().from("coffee_orders").select(ORDER_COLUMNS).eq("kind", "klaim").eq("employee_id", member.id).order("ordered_at", { ascending: false }).limit(120),
    holdsCoffeeGrant(member.id),
  ]);
  if (found.error) coffeeError(found.error);
  const claims = ((found.data ?? []) as unknown as OrderRow[]).map(toOrder);
  const numbers = claimNumbers(claims.map(order => ({ id: order.id, kind: order.kind, status: order.status, employeeId: member.id, orderedAt: order.orderedAt })));
  const group = quotaGroupOf(member.category);
  const quota = quotaFor(group, settings);
  const used = usedInMonth(claims, month);
  const me: CoffeeMe = { id: member.id, name: member.nickname || member.name, group, quota, used, left: Math.max(quota - used, 0), month };
  const orders: MyOrder[] = claims.filter((order, index) => index < 20 || wibMonth(order.orderedAt) === month).map(order => toMyOrder(order, numbers.get(order.id)));
  return { me, orders, ga: opensGaMode({ category: member.category, roles: member.roles, holdsCoffee: holds }), pengelola: holds };
}

async function answer(member: Member, id: string, now: Date): Promise<{ order: MyOrder; me: CoffeeMe }> {
  const state = await myState(member, now);
  const order = state.orders.find(item => item.id === id);
  if (!order) throw new ServiceError(404, "Pengajuan tidak ditemukan. Muat ulang halaman.");
  return { order, me: state.me };
}

/** One claim. A full quota answers 409; the same key sent twice is one claim. */
export async function submitClaim(member: Member, input: ClaimInput, now = new Date()): Promise<{ order: MyOrder; me: CoffeeMe }> {
  const { data, error } = await db().rpc("coffee_submit_claim", {
    p_employee: member.id, p_item: { slug: input.slug, temperature: input.temperature, sugar: input.sugar, ice: input.ice },
    p_at: now.toISOString(), p_manual: false, p_actor: member.id, p_actor_label: (member.nickname || member.name).slice(0, 120), p_key: input.key,
  });
  if (error) {
    // Two sendings of the same key met at the unique index: the first one is the claim.
    if (error.code === "23505") {
      const { data: first } = await db().from("coffee_orders").select("id").eq("idempotency_key", input.key).eq("employee_id", member.id).eq("kind", "klaim").in("status", ["diproses", "selesai"]).maybeSingle();
      if (first) return answer(member, (first as { id: string }).id, now);
    }
    coffeeError(error);
  }
  return answer(member, data as string, now);
}

/** The person cancels their own claim while it still waits; its place in the quota comes back. */
export async function cancelClaim(member: Member, id: string, now = new Date()): Promise<{ order: MyOrder; me: CoffeeMe }> {
  const { data, error } = await db().from("coffee_orders").update({ status: "batal" })
    .eq("id", id).eq("employee_id", member.id).eq("kind", "klaim").eq("status", "diproses").select("id");
  if (error) coffeeError(error);
  // Someone else's claim, an unknown one and an already processed one all read the same: nothing to tell apart.
  if (!data?.length) throw new ServiceError(409, "Pengajuan ini sudah diproses, tidak bisa dibatalkan.");
  return answer(member, id, now);
}
