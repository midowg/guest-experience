import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { rateLimitSecret } from "../config";
import { coffeeError, db, missing, waitingForMigration, type CoffeeActor } from "./store";

/*
 * PIN GA (26 Nov 2026, the rancangan's "memakai PIN GA"): four digits the GA officer types on the
 * tablet to leave the guest menu book. A pengelola sets it in /admin/coffee → Pengaturan. Only a
 * salted hash is kept in coffee_settings, mixed with a secret of the server (four digits alone
 * could be tried out against a leaked hash in a moment). The PIN and the hash never leave the
 * server: pages and APIs only say whether one is set, and whether a typed PIN was right.
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

/** The pengelola sets or replaces the PIN. */
export async function saveGaPin(pin: string, actor: CoffeeActor, now = new Date()): Promise<void> {
  const { error } = await db().from("coffee_settings")
    .upsert({ id: 1, ga_pin_hash: hashPin(pin), ga_pin_at: now.toISOString(), ga_pin_label: actor.label.slice(0, 120) }, { onConflict: "id" })
    .select("id").single();
  if (error) { if (missing(error) || error.code === "42703") throw waitingForMigration(); coffeeError(error); }
}

/** "set": whether a PIN exists at all; "ok": the typed one is it. */
export async function checkGaPin(pin: string): Promise<{ set: boolean; ok: boolean }> {
  const stored = await storedHash(false);
  if (!stored) return { set: false, ok: false };
  return { set: true, ok: GA_PIN.test(pin) && pinMatches(pin, stored) };
}
