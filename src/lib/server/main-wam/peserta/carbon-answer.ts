import "server-only";
import { createHash } from "node:crypto";
import { asCarbonAnswer, type CarbonTravel } from "@/lib/pra-wam/carbon";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";

/*
 * What a person tells in Jejak karbon WAM 2026's calculator (24 Nov 2026, as in Pra WAM): their own trip when they
 * do not go with the group, bottles, laptop hours, phone charges. One row of pw_settings per person (a table that
 * is already there, so no migration), keyed "mwc_" and the first 32 hex characters of the SHA-256 of their
 * employee id: the key never holds a name or an id, two people saving at once never overwrite each other, and
 * it never meets Pra WAM's rows ("carbon_…", another trip). Only the person's own row is ever read.
 */

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

/** "mwc_" and 32 hex: 36 characters, inside pw_settings' key rule (^[a-z0-9_]{2,40}$). */
export const carbonAnswerRowKey = (employeeId: string) => `mwc_${createHash("sha256").update(`mw:${employeeId}`).digest("hex").slice(0, 32)}`;

/** The person's saved answer; "waiting" when pw_settings is not there (the page still counts). Never throws. */
export async function readCarbonAnswer(employeeId: string): Promise<{ answer: CarbonTravel | null; storage: "ok" | "waiting" }> {
  try {
    const { data, error } = await createPrivilegedClient().from("pw_settings").select("value").eq("key", carbonAnswerRowKey(employeeId)).maybeSingle();
    if (error) return { answer: null, storage: missing(error) ? "waiting" : "ok" };
    return { answer: asCarbonAnswer(data?.value), storage: "ok" };
  } catch { return { answer: null, storage: "ok" }; }
}

/** Keeps the person's answer (already checked by carbonAnswerInputSchema). */
export async function writeCarbonAnswer(employeeId: string, answer: Omit<CarbonTravel, "answeredAt">, now: Date): Promise<CarbonTravel> {
  const saved: CarbonTravel = { own: answer.own && { ...answer.own, from: answer.own.from.trim() }, bottles: answer.bottles, laptopHours: answer.laptopHours, phoneCharges: answer.phoneCharges, answeredAt: now.toISOString() };
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key: carbonAnswerRowKey(employeeId), value: saved, updated_at: now.toISOString() }, { onConflict: "key" });
  if (error) {
    if (missing(error)) throw new ServiceError(503, "Penyimpanan Jejak karbon menunggu pembaruan sistem.");
    databaseError(error);
  }
  return saved;
}
