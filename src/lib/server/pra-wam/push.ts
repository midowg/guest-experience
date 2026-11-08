import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import type { PushPayload } from "@/lib/pra-wam/push";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import type { Member } from "./session";

/*
 * Notifikasi di HP (migration 202611080001): every in-app notification is also pushed to the
 * phones a person turned on. Sending never stops what caused it: without the keys, before the
 * migration, or when a push service fails, the in-app notification is still there.
 */

const MIGRATION = "202611080001_pra_wam_push.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_push_subscriptions/.test(error.message ?? "");

/** The VAPID keys from the server's environment; null until both are set. */
function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.WAM_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WAM_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.WAM_VAPID_SUBJECT?.trim() || "https://journey.werkudara.group/wam" };
}

/** The public key the browser subscribes with; null while push is not set up on the server. */
export function pushPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/** This phone (or browser) now gets the person's notifications; saving the same phone again only updates it. */
export async function saveSubscription(member: Member, input: { endpoint: string; p256dh: string; auth: string; device: string }): Promise<void> {
  if (!vapid()) throw new ServiceError(503, "Notifikasi HP belum disiapkan di server.");
  const { error } = await createPrivilegedClient().from("pw_push_subscriptions").upsert(
    { employee_id: member.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, device: input.device },
    { onConflict: "endpoint" },
  );
  if (error) { if (missing(error)) throw new ServiceError(503, `Notifikasi HP menunggu migrasi ${MIGRATION}.`); databaseError(error); }
}

/** This phone stops getting notifications (only the person's own phone can be removed). */
export async function removeSubscription(member: Member, endpoint: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_push_subscriptions").delete().eq("employee_id", member.id).eq("endpoint", endpoint);
  if (error && !missing(error)) databaseError(error);
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends one notification to every phone of these people. Never throws; says what happened. */
export async function sendPush(employeeIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number; removed: number; phones: number }> {
  const keys = vapid();
  const none = { sent: 0, failed: 0, removed: 0, phones: 0 };
  const ids = [...new Set(employeeIds)];
  if (!keys || !ids.length) return none;
  const client = createPrivilegedClient();
  const rows: Row[] = [];
  for (let at = 0; at < ids.length; at += 500) {
    const { data, error } = await client.from("pw_push_subscriptions").select("id,endpoint,p256dh,auth").in("employee_id", ids.slice(at, at + 500));
    if (error) return none;
    rows.push(...((data ?? []) as Row[]));
  }
  if (!rows.length) return none;
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(rows.map(row => webpush.sendNotification(
    { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    body,
    { vapidDetails: keys, TTL: 12 * 60 * 60, urgency: "high", timeout: 8_000 },
  )));
  const gone: string[] = [];
  const delivered: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") { delivered.push(rows[index].id); return; }
    const status = (result.reason as { statusCode?: number } | undefined)?.statusCode;
    if (status === 404 || status === 410) gone.push(rows[index].id);
  });
  if (gone.length) await client.from("pw_push_subscriptions").delete().in("id", gone);
  if (delivered.length) await client.from("pw_push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("id", delivered);
  return { sent: delivered.length, failed: rows.length - delivered.length, removed: gone.length, phones: rows.length };
}

/**
 * Sends after the response has gone (the person who sent it does not wait for the phones). Where
 * there is no request to wait after, it sends right away.
 */
export async function schedulePush(employeeIds: string[], payload: PushPayload): Promise<void> {
  if (!vapid() || !employeeIds.length) return;
  try {
    after(async () => { await sendPush(employeeIds, payload); });
  } catch {
    await sendPush(employeeIds, payload);
  }
}
