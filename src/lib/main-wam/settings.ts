import { z } from "zod";
import {
  MAIN_WAM_MODES, MAIN_WAM_MODULES, THEME_COLOR_KEYS, THEME_IMAGE_SLOTS,
  type CarbonInputs, type MainWamContacts, type MainWamEventInfo, type MainWamMode, type MainWamSettings, type MainWamThemeSettings,
  type ModuleConfig, type ModuleSwitches, type ThemeImageRef,
} from "./types";

/*
 * Main WAM's settings (mw_settings, migration 202611200001), read from the database as they are and
 * made whole here: anything missing, unknown or malformed becomes the default, so a bad row never
 * stops a page. The same schemas check what Admin WAM saves. Pure: tested without a server.
 */

export const MAIN_WAM_MIGRATION = "202611200001_main_wam_settings_rundown.sql";
export const MAIN_WAM_MOMEN_MIGRATION = "202611200002_main_wam_momen.sql";
export const MAIN_WAM_MODULES_MIGRATION = "202611200003_main_wam_modules.sql";

/** WAM 2026 as the brief has it; pw_events (kind wam) overrides the dates when it is there. */
export const DEFAULT_EVENT: MainWamEventInfo = {
  name: "WAM 2026", startDate: "2027-01-04", endDate: "2027-01-07", venue: "Kota Batu", hotel: "", address: "", checkInAt: null, checkOutAt: null,
};
/** Every module off, Silent Meeting included (it is Pra WAM's, not Main WAM's; migration 202611220001 switches it off in a database that had it on). */
export const DEFAULT_MODULES: ModuleSwitches = Object.fromEntries(MAIN_WAM_MODULES.map(key => [key, false])) as ModuleSwitches;
export const DEFAULT_MODULE_CONFIG: ModuleConfig = { survei: { formSlug: null }, mozaik: { columns: 30, rows: 20 }, demo: false };
export const DEFAULT_THEME_SETTINGS: MainWamThemeSettings = { colors: {}, displayFont: null, images: {} };
export const DEFAULT_CONTACTS: MainWamContacts = { kamar: null, perjalanan: null, umum: null };
export const DEFAULT_CARBON: CarbonInputs = { listrikKwh: null, airM3: null, lpgKg: null, sampahKg: null, final: false };

export const defaultSettings = (): MainWamSettings => ({
  mode: "pra", modules: { ...DEFAULT_MODULES }, moduleConfig: structuredClone(DEFAULT_MODULE_CONFIG), theme: structuredClone(DEFAULT_THEME_SETTINGS),
  event: { ...DEFAULT_EVENT }, contacts: { ...DEFAULT_CONTACTS }, groupsPublished: false, carbon: { ...DEFAULT_CARBON }, sampleRundown: false, updatedAt: null, migrated: false,
});

const HEX = /^#[0-9A-Fa-f]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
/** The storage keys Main WAM's theme images may have (the admin's upload decides the name). */
export const themeImageKeyPattern = /^main-wam\/tema\/[a-zA-Z]+-[0-9a-f-]{36}\.(webp|png|jpg)$/;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = z.uuid();
const idOrNull = (value: unknown) => (typeof value === "string" && uuid.safeParse(value).success ? value : null);
const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

export const parseMode = (value: unknown): MainWamMode => ((MAIN_WAM_MODES as readonly unknown[]).includes(value) ? value as MainWamMode : "pra");

/** Only `true` switches a module on. */
export function parseModules(value: unknown): ModuleSwitches {
  const raw = isObject(value) ? value : {};
  return Object.fromEntries(MAIN_WAM_MODULES.map(key => [key, raw[key] === true])) as ModuleSwitches;
}

export function parseModuleConfig(value: unknown): ModuleConfig {
  const raw = isObject(value) ? value : {};
  const survei = isObject(raw.survei) ? raw.survei : {};
  const mozaik = isObject(raw.mozaik) ? raw.mozaik : {};
  const grid = (side: unknown, fallback: number) => (Number.isInteger(side) && (side as number) >= 4 && (side as number) <= 80 ? side as number : fallback);
  return {
    survei: { formSlug: typeof survei.formSlug === "string" && SLUG.test(survei.formSlug) ? survei.formSlug : null },
    mozaik: { columns: grid(mozaik.columns, DEFAULT_MODULE_CONFIG.mozaik.columns), rows: grid(mozaik.rows, DEFAULT_MODULE_CONFIG.mozaik.rows) },
    // Mode demo: only `true` turns it on (a missing or odd value is off).
    demo: raw.demo === true,
  };
}

function parseImage(value: unknown): ThemeImageRef | null {
  if (!isObject(value)) return null;
  const { key, version, mime } = value;
  if (typeof key !== "string" || !themeImageKeyPattern.test(key) || typeof version !== "string" || !/^[\w-]{1,40}$/.test(version)) return null;
  return { key, version, mime: typeof mime === "string" && /^image\/(webp|png|jpeg)$/.test(mime) ? mime : "image/webp" };
}

export function parseTheme(value: unknown): MainWamThemeSettings {
  const raw = isObject(value) ? value : {};
  const colorsRaw = isObject(raw.colors) ? raw.colors : {};
  const colors: MainWamThemeSettings["colors"] = {};
  for (const key of THEME_COLOR_KEYS) {
    const color = colorsRaw[key];
    if (typeof color === "string" && HEX.test(color)) colors[key] = color.toUpperCase();
  }
  const imagesRaw = isObject(raw.images) ? raw.images : {};
  const images: MainWamThemeSettings["images"] = {};
  for (const slot of THEME_IMAGE_SLOTS) {
    const image = parseImage(imagesRaw[slot]);
    if (image) images[slot] = image;
  }
  const displayFont = typeof raw.displayFont === "string" && /^[a-z0-9-]{2,40}$/.test(raw.displayFont) ? raw.displayFont : null;
  return { colors, displayFont, images };
}

export function parseContacts(value: unknown): MainWamContacts {
  const raw = isObject(value) ? value : {};
  return { kamar: idOrNull(raw.kamar), perjalanan: idOrNull(raw.perjalanan), umum: idOrNull(raw.umum) };
}

export function parseCarbon(value: unknown): CarbonInputs {
  const raw = isObject(value) ? value : {};
  return { listrikKwh: numberOrNull(raw.listrikKwh), airM3: numberOrNull(raw.airM3), lpgKg: numberOrNull(raw.lpgKg), sampahKg: numberOrNull(raw.sampahKg), final: raw.final === true };
}

/** The columns of mw_settings as Supabase returns them. */
export type SettingsRow = {
  mode?: unknown; modules?: unknown; module_config?: unknown; theme?: unknown; event_name?: unknown; venue?: unknown; hotel?: unknown; hotel_address?: unknown;
  check_in_at?: unknown; check_out_at?: unknown; contacts?: unknown; groups_published_at?: unknown; carbon?: unknown; updated_at?: unknown;
};

const text = (value: unknown, fallback: string, max = 150) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);
const instant = (value: unknown) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null);

/**
 * The settings from the row (null: no row yet, the defaults with `migrated`), and the event's dates
 * from pw_events when that row is there (one source for Pra WAM's countdown and Main WAM's days).
 */
export function settingsFromRow(row: SettingsRow | null, dates?: { startDate: string; endDate: string } | null): MainWamSettings {
  const base = defaultSettings();
  const event: MainWamEventInfo = {
    ...base.event,
    ...(dates && DATE.test(dates.startDate) && DATE.test(dates.endDate) && dates.endDate >= dates.startDate ? dates : {}),
  };
  if (!row) return { ...base, event, migrated: true };
  return {
    mode: parseMode(row.mode),
    modules: parseModules(row.modules),
    moduleConfig: parseModuleConfig(row.module_config),
    theme: parseTheme(row.theme),
    event: {
      ...event,
      name: text(row.event_name, event.name, 80),
      venue: text(row.venue, event.venue),
      hotel: text(row.hotel, event.hotel),
      address: text(row.hotel_address, event.address, 300),
      checkInAt: instant(row.check_in_at),
      checkOutAt: instant(row.check_out_at),
    },
    contacts: parseContacts(row.contacts),
    groupsPublished: instant(row.groups_published_at) !== null,
    carbon: parseCarbon(row.carbon),
    sampleRundown: false,
    updatedAt: instant(row.updated_at),
    migrated: true,
  };
}

/* ── What Admin WAM saves (PUT mainWamAdminApi.settings) ─────────────────────────────────────── */

const hex = z.string().regex(HEX, "Warna ditulis #RRGGBB.").transform(value => value.toUpperCase());
export const settingsInputSchema = z.object({
  mode: z.enum(MAIN_WAM_MODES).optional(),
  modules: z.partialRecord(z.enum(MAIN_WAM_MODULES), z.boolean()).optional(),
  moduleConfig: z.object({
    survei: z.object({ formSlug: z.string().regex(SLUG, "Alamat kuesioner tidak dikenali.").nullable() }).optional(),
    mozaik: z.object({ columns: z.number().int().min(4).max(80), rows: z.number().int().min(4).max(80) }).optional(),
    /** Mode demo (sample data, docs/main-wam/KONTRAK.md §12). */
    demo: z.boolean().optional(),
  }).optional(),
  theme: z.object({
    /** null clears a colour back to the default. */
    colors: z.partialRecord(z.enum(THEME_COLOR_KEYS), hex.nullable()).optional(),
    displayFont: z.string().regex(/^[a-z0-9-]{2,40}$/).nullable().optional(),
  }).optional(),
}).strict();
export type SettingsInput = z.infer<typeof settingsInputSchema>;

/** The row update for a settings input, merged over what is saved (jsonb columns are written whole). */
export function settingsPatch(current: MainWamSettings, input: SettingsInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.mode) patch.mode = input.mode;
  if (input.modules) patch.modules = { ...current.modules, ...input.modules };
  if (input.moduleConfig) patch.module_config = {
    survei: input.moduleConfig.survei ?? current.moduleConfig.survei,
    mozaik: input.moduleConfig.mozaik ?? current.moduleConfig.mozaik,
    demo: input.moduleConfig.demo ?? current.moduleConfig.demo,
  };
  if (input.theme) {
    const colors = { ...current.theme.colors };
    for (const [key, value] of Object.entries(input.theme.colors ?? {}) as [keyof typeof colors, string | null][]) {
      if (value) colors[key] = value; else delete colors[key];
    }
    patch.theme = { ...current.theme, colors, displayFont: input.theme.displayFont === undefined ? current.theme.displayFont : input.theme.displayFont };
  }
  return patch;
}
