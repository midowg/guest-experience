import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitSecret, ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";

/*
 * A limit per person (not per network: at the venue everyone shares one Wi-Fi address), on the
 * same counter as enforceRateLimit (consume_rate_limit, 10-minute window). The key is an HMAC of
 * the person's id, so the counter table names nobody. Without the counter (not configured) the
 * action goes on: a limit never blocks the event.
 */
export async function limitPerson(scope: string, employeeId: string, limit: number): Promise<void> {
  let allowed: unknown = true;
  try {
    const key = createHmac("sha256", rateLimitSecret()).update(`mw-peserta\0${scope}\0${employeeId}`).digest("hex");
    const { data, error } = await createPrivilegedClient().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
    if (!error) allowed = data;
  } catch { allowed = true; }
  if (!allowed) throw new ServiceError(429, "Terlalu sering. Tunggu sebentar, lalu coba lagi.");
}
