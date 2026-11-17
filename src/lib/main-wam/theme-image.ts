import { z } from "zod";
import { THEME_IMAGE_SLOTS, type MainWamThemeInput, type MainWamThemeSettings, type ThemeImageSlot } from "./types";
import { mainWamApi } from "@/lib/routes";

/*
 * Main WAM's KV images (Admin WAM → Main WAM → Pengaturan → Tema): one picture per slot, uploaded in
 * two steps to private storage like TV pictures (start: the server names the key and signs the
 * size; confirm: the first bytes are checked), and served through this site to everyone, signed
 * in or not (the splash shows before signing in). Pure: shared by the admin page and the server.
 */

export const THEME_IMAGE_TYPES = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" } as const;
export type ThemeImageMime = keyof typeof THEME_IMAGE_TYPES;
/** 4 MB: a full-screen KV at 2× in WebP fits well under it. */
export const THEME_IMAGE_BYTES = 4 * 1024 * 1024;

export const themeImageKey = (slot: ThemeImageSlot, id: string, mime: ThemeImageMime) => `main-wam/tema/${slot}-${id}.${THEME_IMAGE_TYPES[mime]}`;
export const isThemeImageKey = (key: string, slot: ThemeImageSlot) => new RegExp(`^main-wam/tema/${slot}-[0-9a-f-]{36}\\.(webp|png|jpg)$`).test(key);

export const themeImageStartSchema = z.object({
  slot: z.enum(THEME_IMAGE_SLOTS),
  mime: z.enum(Object.keys(THEME_IMAGE_TYPES) as [ThemeImageMime, ...ThemeImageMime[]], { message: "Pilih gambar WebP, PNG, atau JPG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(THEME_IMAGE_BYTES, "Gambar lebih dari 4 MB."),
});
export type ThemeImageStart = z.infer<typeof themeImageStartSchema>;
export const themeImageConfirmSchema = themeImageStartSchema.extend({
  key: z.string().min(1).max(200),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});

/** The theme as the UI kit's <MainWamTheme> takes it: colours flat, images as addresses on this site. */
export function themeInputOf(theme: MainWamThemeSettings): MainWamThemeInput {
  const images = Object.fromEntries(THEME_IMAGE_SLOTS.map(slot => [slot, theme.images[slot] ? mainWamApi.themeImage(slot, theme.images[slot]!.version) : null]));
  return { ...theme.colors, displayFont: theme.displayFont, images };
}
