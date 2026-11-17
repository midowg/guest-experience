import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isThemeImageKey, themeImageKey, themeInputOf, type ThemeImageStart } from "@/lib/main-wam/theme-image";
import type { MainWamSettings, MainWamThemeInput, ThemeImageSlot } from "@/lib/main-wam/types";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { isR2Configured, presignUpload, readObject, removeObjects, verifyUpload } from "../r2";
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
const notReady = () => new ServiceError(503, "Penyimpanan gambar belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");

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
  if (!(await mainWamSettingsState()).migrated) throw new ServiceError(503, "Tema Main WAM menunggu migrasi 202611200001_main_wam_settings_rundown.sql.");
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

/** The bytes of a slot's image, for mainWamApi.themeImage; null when the slot is empty. */
export async function themeImageFile(slot: ThemeImageSlot): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isR2Configured()) return null;
  const image = (await readMainWamSettings()).theme.images[slot];
  if (!image) return null;
  const found = await readObject(image.key);
  return found ? { bytes: found.bytes, type: image.mime || found.type } : null;
}
