import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { rateLimitSecret, ServiceError } from "../config";
import { coffeeError, db, missing, waitingForMigration, type CoffeeActor } from "./store";

/*
 * PIN GA (26 Nov 2026, the rancangan's "memakai PIN GA"): four digits the GA officer types on the
 * tablet to leave the guest menu book. A pengelola sets it in /admin/coffee → Pengaturan. Only a
 * salted hash is kept in coffee_settings, mixed with a secret of the server (four digits alone
 * could be tried out against a leaked hash in a moment). The PIN and the hash never leave the
 * server: pages and APIs only say whether one is set, and whether a typed PIN was right.
 *
 * Tries (final audit F5-05). A guest holds the tablet, so wrong PINs will be typed for fun, and the
 * GA officer must still get out. Per tablet account (coffee_pin_tries):
 *   - only wrong tries are counted; the right PIN clears the count;
 *   - five wrong tries lock the account for 30 seconds, the next five for 1 minute, then 5 and
 *     15 minutes; an hour without a wrong try and it starts short again. While locked nothing is
 *     checked, the right PIN included (or trying would simply go on through the lock), and the
 *     answer says how long to wait;
 *   - the pengelola saving a PIN clears every count, so the GA officer can always get out;
 *   - every try is taken (written) before the PIN is looked at, and only one writer wins, so tries
 *     sent at the same moment cannot all be checked.
 * That is five tries per fifteen minutes at most in the long run: all 10,000 PINs would take about
 * three weeks of typing without a pause. The route keeps its outer limits per account and per
 * address on top (rate.ts).
 */

export const GA_PIN = /^\d{4}$/;
const VERSION = "s1";

function digest(pin: string, salt: string): Buffer {
  const pepper = createHmac("sha256", rateLimitSecret()).update("coffee-ga-pin").digest("hex");
  return scryptSync(pin, `${salt}:${pepper}`, 32);
}
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${VERSION}$${salt}$${digest(pin, salt).toString("hex")}`;
}
export function pinMatches(pin: string, stored: string | null | undefined): boolean {
  const [version, salt, hex] = (stored ?? "").split("$");
  if (version !== VERSION || !salt || !/^[0-9a-f]{64}$/.test(hex ?? "")) return false;
  const want = Buffer.from(hex, "hex"), got = digest(pin, salt);
  return want.length === got.length && timingSafeEqual(want, got);
}

async function storedHash(strict: boolean): Promise<string | null> {
  const { data, error } = await db().from("coffee_settings").select("ga_pin_hash").eq("id", 1).maybeSingle();
  // Before the migration (or its PIN column) there is no PIN: leaving the book asks to confirm.
  if (error) { if (missing(error) || error.code === "42703") { if (strict) throw waitingForMigration(); return null; } coffeeError(error); }
  return (data as { ga_pin_hash?: string | null } | null)?.ga_pin_hash ?? null;
}

/** Is a PIN GA set? This is all a page or an API may tell about it. */
export const gaPinSet = async (strict = false): Promise<boolean> => Boolean(await storedHash(strict));

const TRIES = "coffee_pin_tries";
/** Wrong tries before the account is locked for a while. */
export const PIN_ROUND = 5;
/** How long, in seconds: the first lock, the second, … The last one repeats. */
export const PIN_LOCKS = [30, 60, 300, 900];
/** After this long without a wrong try the count and the waits start over. */
const PIN_FORGET_MS = 60 * 60_000;

/** "30 detik", "5 menit": how long to wait, rounded up. */
export const pinWait = (seconds: number): string => seconds < 60 ? `${Math.max(1, Math.ceil(seconds))} detik` : `${Math.ceil(seconds / 60)} menit`;
const locked = (seconds: number) => new ServiceError(429, `Terlalu banyak PIN salah. Tunggu ${pinWait(seconds)}, lalu coba lagi. Lupa PIN? Minta pengelola menyimpan PIN baru di Pengaturan.`);

type Tries = { fails: number; level: number; locked_until: string | null; updated_at: string; seq: number };
/** What was read before a try: the stored hash (null: no PIN is set) and this account's count. */
export type PinGate = { stored: string | null; tries: Tries | null };

/**
 * Before a try, and before the route's own limits are touched: is a PIN set, and is this account
 * locked right now? Locked answers 429 with the wait; nothing is counted or checked for it, so
 * pressing again and again while locked costs nothing and extends nothing.
 */
export async function pinGate(employeeId: string, now = new Date()): Promise<PinGate> {
  const stored = await storedHash(false);
  if (!stored) return { stored: null, tries: null };
  const { data, error } = await db().from(TRIES).select("fails,level,locked_until,updated_at,seq").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (missing(error)) throw waitingForMigration(); coffeeError(error); }
  const tries = (data as Tries | null) ?? null;
  const left = tries?.locked_until ? (Date.parse(tries.locked_until) - now.getTime()) / 1000 : 0;
  if (left > 0) throw locked(left);
  return { stored, tries };
}

/**
 * One try at the PIN GA. The try is written first (as a wrong one, with the lock when it is the
 * fifth), by exactly one writer: a second request that read the same count is sent away unchecked.
 * Only then is the PIN looked at; the right one deletes the count again.
 */
export async function tryGaPin(employeeId: string, pin: string, gate: PinGate, now = new Date()): Promise<{ set: boolean; ok: boolean }> {
  if (!gate.stored) return { set: false, ok: false };
  const before = gate.tries && now.getTime() - Date.parse(gate.tries.updated_at) <= PIN_FORGET_MS ? gate.tries : null;
  const fails = (before?.fails ?? 0) + 1, level = before?.level ?? 0;
  const last = fails >= PIN_ROUND;
  const seconds = PIN_LOCKS[Math.min(level, PIN_LOCKS.length - 1)];
  const next = {
    fails: last ? 0 : fails, level: last ? Math.min(level + 1, PIN_LOCKS.length) : level,
    locked_until: last ? new Date(now.getTime() + seconds * 1000).toISOString() : null, updated_at: now.toISOString(), seq: (gate.tries?.seq ?? 0) + 1,
  };
  let taken = false;
  if (gate.tries) {
    const { data, error } = await db().from(TRIES).update(next).eq("employee_id", employeeId).eq("seq", gate.tries.seq).select("employee_id");
    if (error) { if (missing(error)) throw waitingForMigration(); coffeeError(error); }
    taken = ((data ?? []) as unknown[]).length === 1;
  } else {
    const { error } = await db().from(TRIES).insert({ employee_id: employeeId, ...next });
    if (error && error.code !== "23505") { if (missing(error)) throw waitingForMigration(); coffeeError(error); }
    taken = !error;
  }
  if (!taken) throw new ServiceError(429, "PIN sedang diperiksa. Coba lagi.");
  if (GA_PIN.test(pin) && pinMatches(pin, gate.stored)) {
    await db().from(TRIES).delete().eq("employee_id", employeeId);
    return { set: true, ok: true };
  }
  if (last) throw locked(seconds);
  return { set: true, ok: false };
}

/** The pengelola sets or replaces the PIN. Every count of wrong tries is cleared: a locked tablet opens with the new PIN at once. */
export async function saveGaPin(pin: string, actor: CoffeeActor, now = new Date()): Promise<void> {
  const { error } = await db().from("coffee_settings")
    .upsert({ id: 1, ga_pin_hash: hashPin(pin), ga_pin_at: now.toISOString(), ga_pin_label: actor.label.slice(0, 120) }, { onConflict: "id" })
    .select("id").single();
  if (error) { if (missing(error) || error.code === "42703") throw waitingForMigration(); coffeeError(error); }
  // Not worth failing the save for: a count that stays only means a wait of fifteen minutes at most.
  await db().from(TRIES).delete().gte("fails", 0);
}

/** "set": whether a PIN exists at all; "ok": the typed one is it. */
export async function checkGaPin(pin: string): Promise<{ set: boolean; ok: boolean }> {
  const stored = await storedHash(false);
  if (!stored) return { set: false, ok: false };
  return { set: true, ok: GA_PIN.test(pin) && pinMatches(pin, stored) };
}
