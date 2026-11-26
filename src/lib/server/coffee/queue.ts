import "server-only";
import { firstName } from "@/lib/coffee/access";
import { drinkLabel, drinkName } from "@/lib/coffee/menu";
import { claimNumbers, dayStart, monthRange, previousMonth, wibDay, wibMonth } from "@/lib/coffee/quota";
import { roomSpot } from "@/lib/coffee/rooms";
import { manualAt, type ManualInput } from "@/lib/coffee/schemas";
import { KIND_LABEL, type CoffeeSettings, type QueueOrder, type QueueState, type Status } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import { orderRules, settle } from "./lines";
import { notifyDecided } from "./push";
import { readSettings } from "./settings";
import { coffeeError, countingClaims, db, orderById, orderColumns, toOrders, type CoffeeActor, type OrderRow } from "./store";

/*
 * The pengelola's queue (/admin/coffee). They buy by hand in JumpStart, then mark the order:
 * Selesai diproses, or Tolak with a note. Each is one conditional update, so when two of them press
 * at once only one wins and the other reads "sudah diproses orang lain". Urungkan (the processor
 * only, five minutes) and Catat manual go through the database functions, where the quota is kept.
 */

export const UNDO_WINDOW_SECONDS = 300;

/** Adds "klaim ke-n", the quota and how much of it is used to the claims among these orders. */
async function withQuota(orders: QueueOrder[], settings?: CoffeeSettings): Promise<QueueOrder[]> {
  const claims = orders.filter(order => order.kind === "klaim" && order.person.id);
  if (!claims.length) return orders;
  const [quotas, counted] = await Promise.all([
    settings ?? readSettings(),
    countingClaims({ employeeIds: [...new Set(claims.map(order => order.person.id!))], months: [...new Set(claims.map(order => wibMonth(order.orderedAt)))] }),
  ]);
  const numbers = claimNumbers(counted);
  const used = new Map<string, number>();
  for (const claim of counted) used.set(`${claim.employeeId}:${claim.month}`, (used.get(`${claim.employeeId}:${claim.month}`) ?? 0) + 1);
  return orders.map(order => order.kind !== "klaim" ? order : {
    ...order, ...(numbers.has(order.id) ? { claimNo: numbers.get(order.id) } : {}),
    quota: quotas[order.person.group ?? "karyawan"], used: used.get(`${order.person.id}:${wibMonth(order.orderedAt)}`) ?? 0,
  });
}

const undoable = (order: QueueOrder, actor: CoffeeActor | undefined, now: Date) => !!actor && !order.manual && !!order.processed
  && order.processed.employeeId === actor.employeeId && order.processed.label === actor.label
  && now.getTime() - Date.parse(order.processed.at) < UNDO_WINDOW_SECONDS * 1000;

/** What waits (oldest first), the last six processed, and today's numbers. `actor`: marks what they may still Urungkan. */
export async function queue(actor?: CoffeeActor, now = new Date()): Promise<QueueState> {
  const today = dayStart(wibDay(now.toISOString()));
  const columns = await orderColumns();
  const [waiting, recent, day] = await Promise.all([
    db().from("coffee_orders").select(columns).eq("status", "diproses").order("ordered_at").order("id").limit(300),
    db().from("coffee_orders").select(columns).in("status", ["selesai", "ditolak"]).order("processed_at", { ascending: false }).limit(6),
    db().from("coffee_orders").select("id,status").in("status", ["selesai", "ditolak"]).gte("processed_at", today).limit(5000),
  ]);
  for (const result of [waiting, recent, day]) if (result.error) coffeeError(result.error);
  const first = await toOrders((waiting.data ?? []) as unknown as OrderRow[]);
  const last = await toOrders((recent.data ?? []) as unknown as OrderRow[]);
  const all = await withQuota([...first, ...last]);
  const count = (status: Status) => ((day.data ?? []) as { status: Status }[]).filter(row => row.status === status).length;
  return {
    waiting: all.slice(0, first.length),
    recent: all.slice(first.length).map(order => ({ ...order, undoable: undoable(order, actor, now) })),
    today: { diproses: first.length, selesai: count("selesai"), ditolak: count("ditolak") },
    now: now.toISOString(),
  };
}

/** How many orders wait, for the admin home's card. */
export async function waitingCount(): Promise<number> {
  const { data, error } = await db().from("coffee_orders").select("id").eq("status", "diproses").limit(1000);
  if (error) coffeeError(error);
  return data?.length ?? 0;
}

async function shown(id: string, actor: CoffeeActor, now: Date): Promise<QueueOrder> {
  const order = await orderById(id);
  if (!order) throw new ServiceError(404, "Pesanan tidak ditemukan. Muat ulang halaman.");
  const [withNumbers] = await withQuota([order]);
  return { ...withNumbers, undoable: undoable(withNumbers, actor, now) };
}

async function decide(id: string, patch: { status: "selesai" | "ditolak"; reject_note: string | null }, actor: CoffeeActor, now: Date): Promise<QueueOrder> {
  const { data, error } = await db().from("coffee_orders")
    .update({ ...patch, processed_by: actor.employeeId, processed_label: actor.label.slice(0, 120), processed_at: now.toISOString() })
    .eq("id", id).eq("status", "diproses").select("id");
  if (error) coffeeError(error);
  if (!data?.length) {
    const order = await orderById(id);
    if (!order) throw new ServiceError(404, "Pesanan tidak ditemukan. Muat ulang halaman.");
    if (order.status === "batal") throw new ServiceError(409, order.manual ? "Catatan ini sudah dibatalkan. Antrean diperbarui." : "Pengajuan ini sudah dibatalkan pemesannya. Antrean diperbarui.");
    throw new ServiceError(409, "Pesanan ini sudah diproses orang lain. Antrean diperbarui.");
  }
  const order = await shown(id, actor, now);
  // Whoever ordered is told by web push after the answer has gone (Catat manual and Urungkan tell nobody).
  await notifyDecided(id, actor.employeeId);
  return order;
}

/** Selesai diproses: bought in JumpStart. */
export const finishOrder = (id: string, actor: CoffeeActor, now = new Date()) => decide(id, { status: "selesai", reject_note: null }, actor, now);
/** Tolak, with the note the one who ordered reads. A refused claim gives its place in the quota back. */
export const rejectOrder = (id: string, note: string, actor: CoffeeActor, now = new Date()) => decide(id, { status: "ditolak", reject_note: note.trim() }, actor, now);

/** Urungkan: back to the queue, by the one who processed it and within the window only. */
export async function reopenOrder(id: string, actor: CoffeeActor, now = new Date()): Promise<QueueOrder> {
  const { error } = await db().rpc("coffee_reopen", { p_order: id, p_actor: actor.employeeId, p_actor_label: actor.label.slice(0, 120), p_window_seconds: UNDO_WINDOW_SECONDS });
  if (error) coffeeError(error);
  return shown(id, actor, now);
}

/**
 * Batalkan catatan: a record made by hand that turned out wrong (the wrong person, the wrong
 * month). Any pengelola may cancel it; orders made in the app are never touched. The row stays as
 * "batal" with who cancelled it and when, and a claim's place in the quota is free again.
 */
export async function cancelManual(id: string, actor: CoffeeActor, now = new Date()): Promise<{ order: QueueOrder; message: string }> {
  const { error } = await db().rpc("coffee_cancel_manual", { p_order: id, p_actor: actor.employeeId, p_actor_label: actor.label.slice(0, 120) });
  if (error) coffeeError(error);
  const order = await shown(id, actor, now);
  return { order, message: order.kind === "klaim" ? `Catatan dibatalkan. Jatah ${firstName(order.person.name)} dikembalikan.` : "Catatan dibatalkan." };
}

/**
 * Catat manual: a request made outside the app, saved as done and marked "Dicatat manual". A claim
 * goes through the same function as the app's, so a full quota still refuses it. Not further back
 * than the start of last month (WIB). The sheet's key makes a second sending of the same record
 * answer with the first one instead of saving it twice.
 */
export async function recordManual(input: ManualInput, actor: CoffeeActor, now = new Date()): Promise<{ order: QueueOrder; message: string }> {
  const at = manualAt(input.date, input.time);
  if (at < monthRange(previousMonth(wibMonth(now.toISOString()))).from) {
    throw new ServiceError(422, "Periksa kembali isian formulir.", { date: ["Catat manual paling lama sampai awal bulan lalu."] });
  }
  const label = actor.label.slice(0, 120);
  // The options of the kind recorded (a claim's, a guest's, the team's), as Pengaturan has them now.
  const drink = { slug: input.slug, other: input.other ?? null, ...settle(input, input.kind, await orderRules(), { manual: true }) };
  const { data, error } = input.kind === "klaim"
    ? await db().rpc("coffee_submit_claim", { p_employee: input.employeeId, p_item: drink, p_at: at, p_manual: true, p_actor: actor.employeeId, p_actor_label: label, p_key: input.key })
    : await db().rpc("coffee_submit_meeting", {
      p_order: {
        pic_id: input.employeeId, room: input.room ?? null, room_spot: input.room ? roomSpot(input.room) : null, guest: input.guest ?? null, guest_count: input.guestCount ?? null,
        parent_id: null, actor_id: actor.employeeId, actor_label: label, ordered_at: at, manual: true,
      },
      p_items: [{ ...drink, for: input.kind, person_id: input.kind === "tim" ? input.employeeId : null, qty: input.qty }],
      p_key: input.key,
    });
  let id = data as string | null;
  if (error) {
    // Two sendings of the same key met at the unique index: the first one is the record.
    const { data: first } = error.code === "23505"
      ? await db().from("coffee_orders").select("id").eq("idempotency_key", input.key).eq("manual", true).eq("status", "selesai").maybeSingle()
      : { data: null };
    if (!first) coffeeError(error);
    id = (first as { id: string }).id;
  }
  const order = await shown(id as string, actor, now);
  // The words come from what is saved: a repeated key answers with the first record, whatever was sent now.
  const who = firstName(order.person.name);
  const item = order.items[0];
  const name = item ? drinkName(item) : drinkLabel(input.slug, input.other);
  const message = order.kind === "klaim"
    ? `${who} · ${name} · klaim ke-${order.claimNo ?? order.used ?? 1} dari ${order.quota ?? 0}.`
    : `${KIND_LABEL[item?.for ?? input.kind]} · ${item?.qty ?? input.qty}× ${name} · ${(item?.for ?? input.kind) === "tamu" ? "PIC " : ""}${who}.`;
  return { order, message };
}
