import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret, ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";

/*
 * A limit per person, not per address: at the venue ±120 people share one Wi-Fi (one IP), so the
 * site's per-IP limiter (enforceRateLimit) would stop everyone at once. Same counter table and
 * function (consume_rate_limit), keyed by an HMAC of the person and the action.
 */
export async function limitPerson(scope: string, employeeId: string, limit: number, windowSeconds = 600): Promise<void> {
  const key = createHmac("sha256", rateLimitSecret()).update(`main-wam\0${scope}\0${employeeId}`).digest("hex");
  const { data, error } = await createPrivilegedClient().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu sering. Tunggu beberapa menit lalu coba lagi.");
}
