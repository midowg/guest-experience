import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import type { RoomUse } from "@/lib/pra-wam/sessions";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { looksLikeTvSlug, TV_DEFAULT_SETTINGS, TV_IMAGE_PREFIX, tvImageKey, tvLimits, weekOf, type TvDay, type TvFeed, type TvRoom, type TvSettings, type TvSlideStart } from "@/lib/pra-wam/tv";
import { hashTvKey, looksLikeTvKey } from "@/lib/pra-wam/tv-key";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignUpload, readObject, removeObjects, verifyUpload } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import type { WamLook } from "@/lib/pra-wam/theme";
import { listRooms } from "./appraisal";
import { roomUsesBetween } from "./sessions";
import { readWamLook } from "./theme";

/*
 * TV Announcement (migration 202611100003): the office TVs, the pictures they play and the
 * settings, kept by Admin WAM. A TV has no sign-in; it is known by the key in its address, of
 * which only the sha256 is kept. Before the migration the admin page says so and every TV
 * address answers "not found".
 */

export const TV_MIGRATION = "202611100003_pw_tv.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_tv/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `TV Announcement menunggu migrasi ${TV_MIGRATION}.`);
function fail(error: { code?: string; message: string }): never {
  if (missing(error)) throw waiting();
  databaseError(error);
}

/** The short addresses (/tv/lobi) arrive with this one; before it TVs keep their long key address and none can be added. */
export const TV_SLUG_MIGRATION = "202611100004_pw_tv_slug.sql";
const noSlug = (error: { code?: string }) => ["42703", "PGRST204"].includes(error.code ?? "");
const waitingForSlug = () => new ServiceError(503, `Alamat pendek TV menunggu migrasi ${TV_SLUG_MIGRATION}.`);

type ScreenRow = { id: string; name: string; slug?: string | null; key_hint: string; last_seen_at: string | null; last_width: number | null; last_height: number | null; created_at: string };
type SlideRow = { id: string; image_key: string; title: string; seconds: number; sort_order: number; active: boolean };
const SCREEN_COLUMNS = "id,name,key_hint,last_seen_at,last_width,last_height,created_at";
const SLIDE_COLUMNS = "id,image_key,title,seconds,sort_order,active";

/* ---- Admin WAM ---------------------------------------------------------------------------------- */

/** `slug` is null for a TV made before the short addresses that has not been given one (it still plays at its key address). */
export type TvScreen = { id: string; name: string; slug: string | null; keyHint: string; lastSeenAt: string | null; width: number | null; height: number | null; createdAt: string };
export type TvAdminSlide = { id: string; title: string; seconds: number; active: boolean };
export type TvAdmin = { migrated: boolean; slugReady: boolean; storageReady: boolean; now: string; screens: TvScreen[]; slides: TvAdminSlide[]; settings: TvSettings };

async function readSettings(): Promise<TvSettings> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_settings").select("show_day,day_seconds,show_week,week_seconds").eq("id", true).maybeSingle();
  if (error) fail(error);
  return data ? { showDay: data.show_day, daySeconds: data.day_seconds, showWeek: data.show_week, weekSeconds: data.week_seconds } : TV_DEFAULT_SETTINGS;
}

async function readSlides(): Promise<SlideRow[]> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_slides").select(SLIDE_COLUMNS).order("sort_order").order("created_at");
  if (error) fail(error);
  return (data ?? []) as SlideRow[];
}

/** Everything the admin page shows. `migrated: false` before the migration, with nothing listed. */
export async function tvAdmin(): Promise<TvAdmin> {
  const now = new Date().toISOString();
  const client = createPrivilegedClient();
  const read = (columns: string) => client.from("pw_tv_screens").select(columns).order("created_at");
  let slugReady = true;
  let { data, error } = await read(`${SCREEN_COLUMNS},slug`);
  // Before the short addresses: the same list without them.
  if (error && noSlug(error)) { slugReady = false; ({ data, error } = await read(SCREEN_COLUMNS)); }
  if (error) {
    if (missing(error)) return { migrated: false, slugReady: false, storageReady: isR2Configured(), now, screens: [], slides: [], settings: TV_DEFAULT_SETTINGS };
    databaseError(error);
  }
  const [slides, settings] = await Promise.all([readSlides(), readSettings()]);
  return {
    migrated: true, slugReady, storageReady: isR2Configured(), now,
    screens: ((data ?? []) as unknown as ScreenRow[]).map(row => ({ id: row.id, name: row.name, slug: row.slug ?? null, keyHint: row.key_hint, lastSeenAt: row.last_seen_at, width: row.last_width, height: row.last_height, createdAt: row.created_at })),
    slides: slides.map(row => ({ id: row.id, title: row.title, seconds: row.seconds, active: row.active })),
    settings,
  };
}

/** What a save of a TV's name or address ran into, in words: the address is taken, or its migration has not run. */
function screenSaveError(error: { code?: string; message: string }): never {
  if (noSlug(error)) throw waitingForSlug();
  if (error.code === "23505") throw new ServiceError(409, "Alamat ini sudah dipakai TV lain. Pilih alamat lain.", { slug: ["Sudah dipakai TV lain."] });
  fail(error);
}

/** A new TV at /tv/{slug}. The address is open: it is the admin's to pick and to share. */
export async function createScreen(name: string, slug: string): Promise<void> {
  const client = createPrivilegedClient();
  const { count, error: countError } = await client.from("pw_tv_screens").select("id", { count: "exact", head: true });
  if (countError) fail(countError);
  if ((count ?? 0) >= tvLimits.screens) throw new ServiceError(409, `Paling banyak ${tvLimits.screens} TV. Hapus TV yang sudah tidak dipakai dulu.`);
  const { error } = await client.from("pw_tv_screens").insert({ name, slug });
  if (error) screenSaveError(error);
}

/** A TV's name or address changed. A new address takes over at once; the old one stops working. */
export async function updateScreen(id: string, change: { name?: string; slug?: string }): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_screens").update(change).eq("id", id).select("id");
  if (error) screenSaveError(error);
  if (!data?.length) throw new ServiceError(404, "TV ini tidak ditemukan. Muat ulang halaman.");
}

/** Hapus TV: its address stops working at once. */
export async function deleteScreen(id: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_screens").delete().eq("id", id).select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "TV ini tidak ditemukan. Muat ulang halaman.");
}

export async function saveSettings(settings: TvSettings): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_tv_settings")
    .upsert({ id: true, show_day: settings.showDay, day_seconds: settings.daySeconds, show_week: settings.showWeek, week_seconds: settings.weekSeconds, updated_at: new Date().toISOString() });
  if (error) fail(error);
  invalidate();
}

/* ---- Pictures, in two steps like the card catalog's ---------------------------------------------- */

const TOKEN_SECONDS = 15 * 60;
const notReady = () => new ServiceError(503, "Penyimpanan gambar belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");

function signature(key: string, input: TvSlideStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`tv\0${key}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}

export function tvTokenMatches(token: string, key: string, input: TvSlideStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, expires), "hex"));
}

async function slideCount(): Promise<number> {
  const { count, error } = await createPrivilegedClient().from("pw_tv_slides").select("id", { count: "exact", head: true });
  if (error) fail(error);
  return count ?? 0;
}
const full = () => new ServiceError(409, `Paling banyak ${tvLimits.slides} gambar. Hapus yang sudah tidak dipakai dulu.`);

/** Step one: where to put the picture, and a token to confirm it with. */
export async function startSlideUpload(input: TvSlideStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  if (await slideCount() >= tvLimits.slides) throw full();
  const key = tvImageKey(randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, expires)}` };
}

/** Step two: the picture is there with the agreed size and is WebP, PNG or JPEG; then it joins the loop, last. */
export async function confirmSlideUpload(input: TvSlideStart & { key: string; token: string; title: string }): Promise<void> {
  if (!isR2Configured()) throw notReady();
  if (!input.key.startsWith(TV_IMAGE_PREFIX) || !tvTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try { await verifyUpload(input.key, input.size, ["webp", "png", "jpeg"]); } catch (error) { await discard(); throw error; }
  try {
    const slides = await readSlides();
    if (slides.length >= tvLimits.slides) throw full();
    const { error } = await createPrivilegedClient().from("pw_tv_slides")
      .insert({ image_key: input.key, title: input.title, sort_order: Math.max(0, ...slides.map(slide => slide.sort_order)) + 1 });
    if (error) fail(error);
  } catch (error) { await discard(); throw error; }
  invalidate();
}

export async function updateSlide(id: string, change: { title?: string; seconds?: number; active?: boolean }): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_slides").update(change).eq("id", id).select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Gambar ini tidak ditemukan. Muat ulang halaman.");
  invalidate();
}

export async function deleteSlide(id: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_slides").delete().eq("id", id).select("image_key");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Gambar ini tidak ditemukan. Muat ulang halaman.");
  if (isR2Configured()) await removeObjects(data.map(row => row.image_key as string)).catch(() => undefined);
  invalidate();
}

/** The pictures in a new order: every picture must be named once. */
export async function orderSlides(ids: readonly string[]): Promise<void> {
  const slides = await readSlides();
  if (new Set(ids).size !== ids.length || ids.length !== slides.length || slides.some(slide => !ids.includes(slide.id))) {
    throw new ServiceError(409, "Daftar gambar sudah berubah. Muat ulang halaman, lalu urutkan lagi.");
  }
  const client = createPrivilegedClient();
  const results = await Promise.all(ids.map((id, index) => client.from("pw_tv_slides").update({ sort_order: index + 1 }).eq("id", id)));
  const failed = results.find(result => result.error);
  if (failed?.error) fail(failed.error);
  invalidate();
}

/** One picture's bytes, or null. A TV only gets pictures that are in the loop. */
export async function slideImage(id: string, onlyActive: boolean): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isR2Configured()) return null;
  const { data, error } = await createPrivilegedClient().from("pw_tv_slides").select("image_key,active").eq("id", id).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  if (!data || (onlyActive && !data.active)) return null;
  return readObject(data.image_key);
}

/* ---- What a TV plays ---------------------------------------------------------------------------- */

/**
 * The week's room use, a day at a time, each day's rooms in the rooms' own order (rooms not in use
 * that day are left out). One read for the whole week; every day empty before the rooms' migrations.
 */
async function weekDays(dates: readonly string[]): Promise<TvDay[]> {
  let rooms: Awaited<ReturnType<typeof listRooms>> = [], uses: RoomUse[] = [];
  try { [rooms, uses] = await Promise.all([listRooms(), roomUsesBetween(dates[0], dates[dates.length - 1])]); }
  catch { /* nothing to show yet */ }
  return dates.map(date => {
    const dayStart = Date.parse(wibInstant(date, "00:00")), dayEnd = dayStart + 24 * 3_600_000;
    const today = uses.filter(use => Date.parse(use.startsAt) < dayEnd && Date.parse(use.endsAt) > dayStart);
    return {
      date,
      rooms: rooms.flatMap((room): TvRoom[] => {
        const entries = today.filter(use => use.roomId === room.id).map(use => ({
          key: `${use.source}:${use.sourceId}`, title: use.title ?? use.label, by: use.by ?? "",
          // A hold from yesterday or into tomorrow is cut at the day's edges.
          start: wibDate(use.startsAt) < date ? "00:00" : wibTime(use.startsAt),
          end: wibDate(use.endsAt) > date ? "24:00" : wibTime(use.endsAt),
          startsAt: use.startsAt, endsAt: use.endsAt,
        })).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
        return entries.length ? [{ id: room.id, name: room.name, entries }] : [];
      }),
    };
  });
}

/*
 * Every TV asks every 20 seconds and all get the same content, so it is read at most once in ten
 * seconds per server instance; a change by the admin clears it here (other instances catch up
 * within the ten seconds).
 */
const FRESH_MS = 10_000;
type Content = { date: string; days: TvDay[]; slides: SlideRow[]; settings: TvSettings; look: WamLook };
let kept: { at: number; content: Content } | null = null;
const invalidate = () => { kept = null; };

async function content(now: Date): Promise<Content> {
  const date = wibDate(now.toISOString());
  if (kept && kept.content.date === date && now.getTime() - kept.at < FRESH_MS) return kept.content;
  const [days, slides, settings, look] = await Promise.all([weekDays(weekOf(date)), readSlides(), readSettings(), readWamLook()]);
  const fresh = { date, days, slides: slides.filter(slide => slide.active), settings, look };
  kept = { at: now.getTime(), content: fresh };
  return fresh;
}

/** What plays now; `imageSrc` gives each picture's address (a TV's goes through its key, the admin's through the admin API). */
export async function tvFeed(imageSrc: (slideId: string) => string, now = new Date()): Promise<TvFeed> {
  const { date, days, slides, settings, look } = await content(now);
  return {
    now: now.toISOString(), date, days, settings, look,
    slides: slides.map(slide => ({ id: slide.id, title: slide.title, seconds: slide.seconds, src: imageSrc(slide.id) })),
  };
}

const SEEN_EVERY_MS = 60_000;

/**
 * The TV at an address, or null for one that does not exist (or before its migration). The
 * address is the TV's short slug ("lobi"); a TV made before those still answers at its long key.
 * Notes when it was last seen and its screen size, at most once a minute.
 */
export async function screenForKey(key: unknown, size?: { width: number; height: number }, now = new Date()): Promise<{ id: string } | null> {
  const byKey = looksLikeTvKey(key);
  if (!byKey && !looksLikeTvSlug(key)) return null;
  const client = createPrivilegedClient();
  const found = client.from("pw_tv_screens").select("id,last_seen_at,last_width,last_height");
  const { data, error } = await (byKey ? found.eq("key_hash", hashTvKey(key)) : found.eq("slug", key)).maybeSingle();
  if (error) { if (missing(error) || noSlug(error)) return null; databaseError(error); }
  if (!data) return null;
  const resized = !!size && (size.width !== data.last_width || size.height !== data.last_height);
  if (size && (resized || !data.last_seen_at || now.getTime() - Date.parse(data.last_seen_at) >= SEEN_EVERY_MS)) {
    await client.from("pw_tv_screens").update({ last_seen_at: now.toISOString(), last_width: size.width, last_height: size.height }).eq("id", data.id);
  }
  return { id: data.id };
}
