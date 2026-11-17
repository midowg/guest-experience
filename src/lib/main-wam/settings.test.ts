import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "@/components/main-wam/theme/tokens";
import {
  defaultSettings, parseModuleConfig, parseModules, parseTheme, settingsFromRow, settingsInputSchema, settingsPatch, themeImageKeyPattern,
} from "./settings";
import { THEME_COLOR_KEYS, THEME_IMAGE_SLOTS } from "./types";

const KEY = "main-wam/tema/splash-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp";

describe("Main WAM's settings from the database", () => {
  it("are the defaults before the migration: mode pra, every module off, the neutral theme", () => {
    const settings = defaultSettings();
    expect(settings.mode).toBe("pra");
    expect(Object.values(settings.modules).every(on => on === false)).toBe(true);
    expect(settings.theme).toEqual({ colors: {}, displayFont: null, images: {} });
    expect(settings.migrated).toBe(false);
    expect(settings.event).toMatchObject({ name: "WAM 2026", startDate: "2027-01-04", endDate: "2027-01-07" });
  });

  it("take the row as saved, the event's dates from pw_events", () => {
    const settings = settingsFromRow({
      mode: "uji", modules: { absen: true, voting: "yes", mozaik: true }, module_config: { survei: { formSlug: "survei-wam" }, mozaik: { columns: 32, rows: 12 } },
      theme: { colors: { accent: "#1e3a5f", primary: "blue" }, displayFont: "plus-jakarta-sans", images: { splash: { key: KEY, version: "17", mime: "image/webp" }, icon: { key: "x", version: "1" } } },
      event_name: "WAM 2026", hotel: "Hotel (contoh)", groups_published_at: "2027-01-01T00:00:00Z", contacts: { kamar: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", umum: "bukan-id" },
      carbon: { listrikKwh: 1200, airM3: -1, final: true }, updated_at: "2026-11-17T10:00:00Z",
    }, { startDate: "2027-01-04", endDate: "2027-01-08" });
    expect(settings.migrated).toBe(true);
    expect(settings.mode).toBe("uji");
    expect(settings.modules).toMatchObject({ absen: true, voting: false, mozaik: true, silent: false });
    expect(settings.moduleConfig).toEqual({ survei: { formSlug: "survei-wam" }, mozaik: { columns: 32, rows: 12 } });
    // Only a #RRGGBB colour, uppercased; a key that is not ours is dropped.
    expect(settings.theme.colors).toEqual({ accent: "#1E3A5F" });
    expect(settings.theme.images).toEqual({ splash: { key: KEY, version: "17", mime: "image/webp" } });
    expect(settings.event).toMatchObject({ hotel: "Hotel (contoh)", endDate: "2027-01-08" });
    expect(settings.groupsPublished).toBe(true);
    expect(settings.contacts).toEqual({ kamar: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", perjalanan: null, umum: null });
    expect(settings.carbon).toEqual({ listrikKwh: 1200, airM3: null, lpgKg: null, sampahKg: null, final: true });
  });

  it("never let a bad row stop a page: unknown values become the default", () => {
    const settings = settingsFromRow({ mode: "buka", modules: "semua", module_config: [], theme: null, event_name: " ", check_in_at: "kemarin" }, null);
    expect(settings.mode).toBe("pra");
    expect(settings.modules).toEqual(defaultSettings().modules);
    expect(settings.moduleConfig).toEqual(defaultSettings().moduleConfig);
    expect(settings.event.name).toBe("WAM 2026");
    expect(settings.event.checkInAt).toBeNull();
    expect(parseModules(null)).toEqual(defaultSettings().modules);
    expect(parseModuleConfig({ mozaik: { columns: 1, rows: 500 } }).mozaik).toEqual({ columns: 40, rows: 15 });
    expect(parseTheme({ displayFont: "Comic Sans; } body {" }).displayFont).toBeNull();
    // A row that exists but is empty: migrated, defaults.
    expect(settingsFromRow(null).migrated).toBe(true);
  });

  it("keep theme images to their storage folder", () => {
    expect(themeImageKeyPattern.test(KEY)).toBe(true);
    expect(themeImageKeyPattern.test("pra-wam/tv/x.webp")).toBe(false);
    expect(themeImageKeyPattern.test("main-wam/tema/../../x.webp")).toBe(false);
  });

  it("name the colour slots and image slots the UI kit's theme reads", () => {
    expect([...THEME_COLOR_KEYS].sort()).toEqual(Object.keys(DEFAULT_THEME).sort());
    expect(THEME_IMAGE_SLOTS).toEqual(["splash", "homeHeader", "pattern", "mosaic", "icon"]);
  });
});

describe("what Admin WAM saves", () => {
  it("accepts a mode, modules, a survey and colours; refuses anything else", () => {
    expect(settingsInputSchema.safeParse({ mode: "semua" }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ modules: { absen: true } }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ theme: { colors: { accent: "#1e3a5f", primary: null } } }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ mode: "buka" }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ modules: { komitmen: true } }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ theme: { colors: { accent: "red" } } }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ testers: [] }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ moduleConfig: { survei: { formSlug: "Survei WAM" } } }).success).toBe(false);
  });

  it("writes only what changed, merged over what is saved", () => {
    const current = { ...defaultSettings(), migrated: true, modules: { ...defaultSettings().modules, absen: true }, theme: { colors: { accent: "#111111" }, displayFont: null, images: {} } };
    expect(settingsPatch(current, { mode: "uji" })).toEqual({ mode: "uji" });
    expect(settingsPatch(current, { modules: { mozaik: true } })).toEqual({ modules: { ...current.modules, mozaik: true } });
    const theme = settingsPatch(current, settingsInputSchema.parse({ theme: { colors: { accent: null, primary: "#2f6feb" } } }));
    expect(theme).toEqual({ theme: { colors: { primary: "#2F6FEB" }, displayFont: null, images: {} } });
    expect(settingsPatch(current, {})).toEqual({});
  });
});
