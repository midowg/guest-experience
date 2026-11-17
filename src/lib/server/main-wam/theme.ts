import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isThemeImageKey, themeImageKey, themeInputOf, type ThemeImageStart } from "@/lib/main-wam/theme-image";
import type { MainWamSettings, MainWamThemeInput, ThemeImageSlot } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { isR2Configured, presignUpload, readObject, removeObjects, verifyUpload } from "../r2";
import { mayOpenArea } from "@/lib/admin-access";
import { currentAdmin } from "../admin-actor";
import { mwWaiting } from "./errors";
import { requireMainWamApi } from "./gate";
import { readMainWamSettings, writeSettingsColumns, mainWamSettingsState } from "./settings";

/*
 * The theme of Main WAM for the layout (colours, display face, KV images), and the KV images'
 * upload (Admin WAM) and file (everyone). The theme never stops a page: on any failure the neutral
 * default is drawn (the UI kit's resolveTheme also refuses unreadable values).
 */

/** What the layout hands to <MainWamTheme>. */
export async function mainWamThemeInput(): Promise<MainWamThemeInput> {
  return themeInputOf((await readMainWamSettings()).theme);
}

const TOKEN_SECONDS = 15 * 60;
const notReady = () => new ServiceError(503, "Gambar KV belum bisa diunggah karena penyimpanan berkas belum disiapkan. Hubungi tim CoE.");

function signature(key: string, input: ThemeImageStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`mw-tema\0${input.slot}\0${key}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}

export function themeTokenMatches(token: string, key: string, input: ThemeImageStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  try { return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, expires), "hex")); } catch { return false; }
}

/** Step one: where to put the image, and a token to confirm it with. */
export async function startThemeImage(input: ThemeImageStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  if (!(await mainWamSettingsState()).migrated) throw mwWaiting();
  const key = themeImageKey(input.slot, randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, expires)}` };
}

/** Step two: the image is there with the agreed size and is WebP, PNG or JPEG; then the slot uses it (the old one is removed). */
export async function confirmThemeImage(input: ThemeImageStart & { key: string; token: string }): Promise<MainWamSettings> {
  if (!isR2Configured()) throw notReady();
  if (!isThemeImageKey(input.key, input.slot) || !themeTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try { await verifyUpload(input.key, input.size, ["webp", "png", "jpeg"]); } catch (error) { await discard(); throw error; }
  const current = await mainWamSettingsState();
  const old = current.theme.images[input.slot]?.key;
  const theme = { ...current.theme, images: { ...current.theme.images, [input.slot]: { key: input.key, version: String(Date.now()), mime: input.mime } } };
  let saved: MainWamSettings;
  try { saved = await writeSettingsColumns({ theme }); } catch (error) { await discard(); throw error; }
  if (old && old !== input.key) await removeObjects([old]).catch(() => undefined);
  return saved;
}

/** Empty one slot (the default look returns there). */
export async function removeThemeImage(slot: ThemeImageSlot): Promise<MainWamSettings> {
  const current = await mainWamSettingsState();
  const old = current.theme.images[slot]?.key;
  const images = { ...current.theme.images };
  delete images[slot];
  const saved = await writeSettingsColumns({ theme: { ...current.theme, images } });
  if (old && isR2Configured()) await removeObjects([old]).catch(() => undefined);
  return saved;
}

/*
 * The KV's bytes kept in this server's memory by their storage key (audit L3): a key is never
 * reused (a new image is a new key), so a kept copy is never stale, and the splash on every phone
 * does not read storage (up to 4 MB) each time. At most KEEP images (one per slot, plus the one
 * just replaced).
 */
const KEEP = 8;
const kept = new Map<string, { bytes: Uint8Array; type: string }>();

/** The bytes of a slot's saved image (`image` from the settings: key, mime); null when storage has none. */
export async function themeImageBytes(image: { key: string; mime: string }): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isR2Configured()) return null;
  const known = kept.get(image.key);
  if (known) return known;
  const found = await readObject(image.key);
  if (!found) return null;
  const file = { bytes: found.bytes, type: image.mime || found.type };
  kept.set(image.key, file);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value!);
  return file;
}

/**
 * Whether this request may fetch a KV image that is not public (themeImageAudience "member"):
 * someone Main WAM is on for (the gate's own answer), or Admin WAM (Pengaturan's preview). Never throws.
 */
export async function mayOpenThemeImages(): Promise<boolean> {
  try { await requireMainWamApi(); return true; } catch { /* not someone Main WAM is on for */ }
  try {
    const actor = await currentAdmin();
    return !!actor && (actor.kind !== "person" || mayOpenArea(actor.grant, "wam"));
  } catch { return false; }
}
