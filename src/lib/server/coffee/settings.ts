import "server-only";
import { MONTHLY_QUOTA } from "@/lib/coffee/menu";
import type { CoffeeSettings } from "@/lib/coffee/types";
import { coffeeError, db, missing, waitingForMigration, type CoffeeActor } from "./store";

/* The monthly quotas the pengelola may change (Pengaturan). The database reads the same row when it decides a claim. */

type Row = { quota_karyawan: number; quota_ga: number; quota_intern: number };
const fromRow = (row: Row | null): CoffeeSettings => row
  ? { karyawan: row.quota_karyawan, ga: row.quota_ga, intern: row.quota_intern }
  : { ...MONTHLY_QUOTA };

/** The quotas; the owner's starting values before the migration runs or while the row is missing. */
export async function readSettings(strict = false): Promise<CoffeeSettings> {
  const { data, error } = await db().from("coffee_settings").select("quota_karyawan,quota_ga,quota_intern").eq("id", 1).maybeSingle();
  // `strict` (Pengaturan): say that the migration waits, instead of showing values that cannot be saved yet.
  if (error) { if (missing(error)) { if (strict) throw waitingForMigration(); return { ...MONTHLY_QUOTA }; } coffeeError(error); }
  return fromRow(data as Row | null);
}

export async function saveSettings(input: CoffeeSettings, actor: CoffeeActor, now = new Date()): Promise<CoffeeSettings> {
  const { data, error } = await db().from("coffee_settings")
    .upsert({ id: 1, quota_karyawan: input.karyawan, quota_ga: input.ga, quota_intern: input.intern, updated_at: now.toISOString(), updated_label: actor.label.slice(0, 120) }, { onConflict: "id" })
    .select("quota_karyawan,quota_ga,quota_intern").single();
  if (error) { if (missing(error)) throw waitingForMigration(); coffeeError(error); }
  return fromRow(data as Row);
}
