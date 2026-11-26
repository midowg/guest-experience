import "server-only";
import { AUDIENCES, DEFAULT_OPTIONS, LEGACY_OPTIONS, MONTHLY_QUOTA, OPTION_KEYS, type CoffeeOptions, type Drink } from "@/lib/coffee/menu";
import type { CoffeeSettings } from "@/lib/coffee/types";
import { ServiceError } from "../config";
import { COFFEE_MENU_MIGRATION, coffeeError, db, menuReady, missing, readMenu, waitingForMigration, type CoffeeActor } from "./store";

/*
 * What the pengelola may change in Pengaturan: the monthly quotas (the database reads the same row
 * when it decides a claim) and, since F6, which options each audience is asked with a drink
 * (temperature, sugar, ice). Before migration 202612020001 runs there are no option switches:
 * everyone is asked everything, as the app always did, and saving them answers 503.
 */

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

const column = (audience: keyof CoffeeOptions, option: (typeof OPTION_KEYS)[number]) => `opt_${audience}_${option}`;
const OPTION_COLUMNS = AUDIENCES.flatMap(audience => OPTION_KEYS.map(option => column(audience, option)));
type OptionRow = Record<string, boolean | null>;
const optionsOf = (row: OptionRow | null): CoffeeOptions => {
  const read = (audience: keyof CoffeeOptions) => {
    const one = (option: (typeof OPTION_KEYS)[number]) => row?.[column(audience, option)] ?? DEFAULT_OPTIONS[audience][option];
    // Takaran es never counts without the temperature, whatever the row says.
    return { suhu: one("suhu"), gula: one("gula"), es: one("suhu") && one("es") };
  };
  return { klaim: read("klaim"), tim: read("tim"), tamu: read("tamu") };
};

/**
 * Which options each audience is asked. `ready` false: migration 202612020001 has not run, so
 * every option is asked of everyone (the behaviour before F6) and nothing can be saved yet.
 */
export async function readOptions(): Promise<{ options: CoffeeOptions; ready: boolean }> {
  if (!(await menuReady())) return { options: LEGACY_OPTIONS, ready: false };
  const { data, error } = await db().from("coffee_settings").select(OPTION_COLUMNS.join(",")).eq("id", 1).maybeSingle();
  // 42703: the columns are not there after all (the table is, from migration 1): the old way.
  if (error) { if (missing(error) || error.code === "42703") return { options: LEGACY_OPTIONS, ready: false }; coffeeError(error); }
  return { options: optionsOf(data as OptionRow | null), ready: true };
}

/** Pengaturan → Opsi minuman. Holds from the next order on; orders already made keep what they carry. */
export async function saveOptions(input: CoffeeOptions, actor: CoffeeActor, now = new Date()): Promise<CoffeeOptions> {
  if (!(await menuReady())) throw waitingForMenu();
  const patch: Record<string, unknown> = { id: 1, options_at: now.toISOString(), options_label: actor.label.slice(0, 120) };
  for (const audience of AUDIENCES) for (const option of OPTION_KEYS) patch[column(audience, option)] = option === "es" ? input[audience].es && input[audience].suhu : input[audience][option];
  const { data, error } = await db().from("coffee_settings").upsert(patch, { onConflict: "id" }).select(OPTION_COLUMNS.join(",")).single();
  if (error) { if (missing(error) || error.code === "42703") throw waitingForMenu(); coffeeError(error); }
  return optionsOf(data as unknown as OptionRow);
}

/** Everything Pengaturan shows about drinks, and what Catat manual offers: the option switches and the menu. */
export async function drinkSettings(): Promise<{ options: CoffeeOptions; optionsReady: boolean; menu: Drink[] }> {
  const [{ options, ready }, menu] = await Promise.all([readOptions(), readMenu(true)]);
  return { options, optionsReady: ready, menu };
}

export const waitingForMenu = () => new ServiceError(503, `Fitur ini menunggu migrasi ${COFFEE_MENU_MIGRATION}.`);
