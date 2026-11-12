import "server-only";
import { cache } from "react";
import { asMinutesRule, DEFAULT_MINUTES_RULE, type MinutesRule } from "@/lib/pra-wam/minutes";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Admin WAM's rule for which meetings need a MoM (12 Nov 2026), one row of pw_settings
 * (migration 202611120001). Before the migration the default rule holds and cannot be changed.
 */

export const MINUTES_RULE_MIGRATION = "202611120001_pw_minutes_rule.sql";
const KEY = "minutes_rule";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

async function minutesRuleSettingUncached(): Promise<{ rule: MinutesRule; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) { if (missing(error)) return { rule: DEFAULT_MINUTES_RULE, migrated: false }; databaseError(error); }
  return { rule: asMinutesRule(data?.value), migrated: true };
}
/** The rule and whether it can be changed yet; read once per request. */
export const minutesRuleSetting = cache(minutesRuleSettingUncached);
/** The rule in force; the default when it cannot be read. */
export const minutesRule = async (): Promise<MinutesRule> => (await minutesRuleSetting().catch(() => ({ rule: DEFAULT_MINUTES_RULE }))).rule;

export async function saveMinutesRule(rule: MinutesRule): Promise<MinutesRule> {
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key: KEY, value: rule, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { if (missing(error)) throw new ServiceError(503, `Aturan MoM menunggu migrasi ${MINUTES_RULE_MIGRATION}.`); databaseError(error); }
  return rule;
}

/** pw_sessions.minutes_required is not there yet (before the migration); other errors are not this. */
export const isMinutesColumnMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204"].includes(error.code ?? "") && /minutes_required/.test(error.message ?? "");
