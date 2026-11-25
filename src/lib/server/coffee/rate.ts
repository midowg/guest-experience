import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret, ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * A limit per person, not per address: the whole office reaches Werkudara Coffee through one Wi-Fi
 * (one public IP), so the site's per-IP limiter (enforceRateLimit) alone would stop everyone once
 * thirty people have claimed. The routes keep a generous per-IP limit as an outer wall and count
 * each person here. Same counter table and function (consume_rate_limit), keyed by an HMAC of the
 * person and the action, as in main-wam/modul/rate.ts.
 */

/** Past this many sendings an office behind one address is not people claiming coffee any more. */
export const COFFEE_NETWORK_LIMIT = 300;

/** At most `limit` in ten minutes for one person: 429 past it. */
export async function limitCoffeePerson(scope: string, employeeId: string, limit: number): Promise<void> {
  const key = createHmac("sha256", rateLimitSecret()).update(`coffee\0${scope}\0${employeeId}`).digest("hex");
  const { data, error } = await createPrivilegedClient().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu sering dalam waktu singkat. Tunggu sepuluh menit lalu coba lagi.");
}
