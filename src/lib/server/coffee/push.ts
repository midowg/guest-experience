import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { COFFEE_PUSH_MIGRATION, pushFor, testPush, type CoffeePushEvent, type CoffeePushInfo } from "@/lib/coffee/notify";
import type { PushPayload } from "@/lib/pra-wam/push";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { holders } from "./people";
import { db, missing, orderById } from "./store";

/*
 * Web push for Werkudara Coffee (F4, migration 202612010002). The same VAPID keys as WAM
 * (WAM_VAPID_*), but a table of its own: a subscription belongs to Coffee's service worker.
 *
 * Who is told what:
 *   a new claim or meeting order   every holder of the Werkudara Coffee grant, except its sender
 *   Selesai / Ditolak of a claim   the claimant
 *   Selesai / Ditolak of a meeting the GA officer who sent it, and the PIC
 *   never                          Catat manual, Batalkan catatan, Urungkan, a claimant's own cancel
 * Whoever pressed the button is not told about their own action.
 *
 * Sending never stops or fails what caused it: it runs after the answer has gone (after()), and
 * without the keys, before the migration, or when a push service fails, the order is saved all the
 * same and the screens still change by themselves (polling). Nothing here throws to its caller.
 *
 * The same news goes out once: coffee_push_sent holds one row per order, event and moment, and
 * only the insert that succeeds sends. A device the push service no longer knows (404, 410) is removed.
 */

const SUBSCRIPTIONS = "coffee_push_subscriptions";
const SENT = "coffee_push_sent";
const log = (what: string, error?: unknown) => console.error(`coffee push: ${what}`, error instanceof Error ? error.message : error ?? "");

/** The VAPID keys from the server's environment (shared with WAM); null until both are set. */
function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.WAM_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WAM_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.WAM_VAPID_SUBJECT?.trim() || "https://journey.werkudara.group/coffee" };
}

/** The public key the browser subscribes with; null while push is not set up on the server. */
export function pushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

const waitingForPush = () => new ServiceError(503, `Notifikasi menunggu migrasi ${COFFEE_PUSH_MIGRATION}.`);

/** What a device needs to turn notifications on, or why it cannot yet (the keys, the migration). */
export async function pushInfo(): Promise<CoffeePushInfo> {
  const keys = vapid();
  if (!keys) return { publicKey: null, waiting: "kunci" };
  const { error } = await db().from(SUBSCRIPTIONS).select("id").limit(1);
  if (error) { if (missing(error)) return { publicKey: null, waiting: "migrasi" }; databaseError(error); }
  return { publicKey: keys.publicKey, waiting: null };
}

/**
 * This device now gets this person's notifications. The same device saved again is one row, and it
 * moves to whoever saved it last: a phone that changed hands tells its new owner only.
 */
export async function saveSubscription(employeeId: string, input: { endpoint: string; p256dh: string; auth: string; device: string }): Promise<void> {
  if (!vapid()) throw new ServiceError(503, "Notifikasi belum disiapkan di server.");
  const { error } = await db().from(SUBSCRIPTIONS).upsert(
    { employee_id: employeeId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, device: input.device },
    { onConflict: "endpoint" },
  );
  if (error) { if (missing(error)) throw waitingForPush(); databaseError(error); }
}

/** This device stops getting notifications. Only the person's own device is removed. */
export async function removeSubscription(employeeId: string, endpoint: string): Promise<void> {
  const { error } = await db().from(SUBSCRIPTIONS).delete().eq("employee_id", employeeId).eq("endpoint", endpoint);
  if (error && !missing(error)) databaseError(error);
}

type Device = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushResult = { sent: number; failed: number; removed: number; devices: number };
const NONE: PushResult = { sent: 0, failed: 0, removed: 0, devices: 0 };

/**
 * One notification to every device of those of these people who are still active employees.
 * Never throws; says what happened. Dead devices (404, 410) are removed, other failures are logged.
 */
export async function sendCoffeePush(employeeIds: (string | null | undefined)[], payload: PushPayload): Promise<PushResult> {
  try {
    const keys = vapid();
    const ids = [...new Set(employeeIds.filter((id): id is string => !!id))];
    if (!keys || !ids.length) return NONE;
    const client = db();
    const { data: active, error: peopleError } = await client.from("employees").select("id").in("id", ids).eq("active", true);
    if (peopleError) { log("penerima tidak terbaca", peopleError); return NONE; }
    const to = ((active ?? []) as { id: string }[]).map(person => person.id);
    if (!to.length) return NONE;
    const { data, error } = await client.from(SUBSCRIPTIONS).select("id,endpoint,p256dh,auth").in("employee_id", to).limit(2000);
    if (error) { if (!missing(error)) log("perangkat tidak terbaca", error); return NONE; }
    const devices = (data ?? []) as Device[];
    if (!devices.length) return NONE;
    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(devices.map(device => webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      body,
      { vapidDetails: keys, TTL: 60 * 60, urgency: "high", timeout: 8_000 },
    )));
    const gone: string[] = [], delivered: string[] = [], refused: (number | string)[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") { delivered.push(devices[index].id); return; }
      const status = (result.reason as { statusCode?: number } | undefined)?.statusCode;
      if (status === 404 || status === 410) gone.push(devices[index].id);
      else refused.push(status ?? "tanpa jawaban");
    });
    if (refused.length) log(`${refused.length} perangkat gagal dikirimi (${[...new Set(refused)].join(", ")})`);
    if (gone.length) await client.from(SUBSCRIPTIONS).delete().in("id", gone);
    if (delivered.length) await client.from(SUBSCRIPTIONS).update({ last_sent_at: new Date().toISOString() }).in("id", delivered);
    return { sent: delivered.length, failed: devices.length - delivered.length, removed: gone.length, devices: devices.length };
  } catch (error) {
    log("pengiriman gagal", error);
    return NONE;
  }
}

/** "Kirim notifikasi tes": to the person's own devices, and it says so when there is nothing to send to. */
export async function sendTestPush(employeeId: string): Promise<PushResult> {
  if (!vapid()) throw new ServiceError(503, "Notifikasi belum disiapkan di server.");
  const result = await sendCoffeePush([employeeId], testPush());
  if (!result.devices) throw new ServiceError(409, "Belum ada perangkat yang menyalakan notifikasi. Nyalakan dulu di perangkat ini.");
  if (!result.sent) throw new ServiceError(502, "Notifikasi tes belum terkirim. Matikan lalu nyalakan lagi notifikasi di perangkat ini.");
  return result;
}

/** Is this the first time this news is told? Only one caller gets a yes; unknown (no table, a fault) is no. */
async function firstTime(orderId: string, event: CoffeePushEvent, stamp: string): Promise<boolean> {
  const { error } = await db().from(SENT).insert({ order_id: orderId, event, stamp });
  if (!error) return true;
  if (error.code !== "23505" && !missing(error)) log("catatan kirim tidak tersimpan", error);
  return false;
}

/**
 * Runs the sending after the response has gone, so whoever pressed the button never waits for
 * the phones. Where there is no request to wait after, it runs at once. Never throws.
 */
async function later(work: () => Promise<void>): Promise<void> {
  if (!vapid()) return;
  const safe = async () => { try { await work(); } catch (error) { log("tidak terkirim", error); } };
  try { after(safe); } catch { await safe(); }
}

/** A new claim or meeting order: every pengelola, except the one who sent it. Records made by hand tell nobody. */
export function notifyNewOrder(orderId: string, exceptEmployeeId: string | null): Promise<void> {
  return later(async () => {
    const order = await orderById(orderId);
    if (!order || order.manual || order.status !== "diproses") return;
    const event: CoffeePushEvent = order.kind === "klaim" ? "klaim_baru" : "rapat_baru";
    const to = (await holders()).map(holder => holder.id).filter(id => id !== exceptEmployeeId);
    if (!to.length || !(await firstTime(order.id, event, ""))) return;
    await sendCoffeePush(to, pushFor(event, order));
  });
}

/**
 * Selesai or Ditolak: the claimant, or for a meeting order the GA officer who sent it and the PIC.
 * Read again when it runs: an order that was put back in the queue meanwhile (Urungkan) tells nobody.
 */
export function notifyDecided(orderId: string, actorEmployeeId: string | null): Promise<void> {
  return later(async () => {
    const order = await orderById(orderId);
    if (!order || order.manual || !order.processed || (order.status !== "selesai" && order.status !== "ditolak")) return;
    const event: CoffeePushEvent = order.status;
    const told = (ids: (string | null | undefined)[]) => ids.filter((id): id is string => !!id && id !== actorEmployeeId);
    let groups: { to: string[]; payload: PushPayload }[];
    if (order.kind === "klaim") groups = [{ to: told([order.person.id]), payload: pushFor(event, order) }];
    else {
      const { data, error } = await db().from("coffee_orders").select("created_by").eq("id", order.id).maybeSingle();
      if (error) { log("pengirim tidak terbaca", error); return; }
      const sender = (data as { created_by: string | null } | null)?.created_by ?? null;
      groups = [
        { to: told([sender]), payload: pushFor(event, order, "pengirim") },
        { to: told([order.person.id === sender ? null : order.person.id]), payload: pushFor(event, order, "pic") },
      ];
    }
    groups = groups.filter(group => group.to.length);
    if (!groups.length || !(await firstTime(order.id, event, order.processed.at))) return;
    for (const group of groups) await sendCoffeePush(group.to, group.payload);
  });
}
