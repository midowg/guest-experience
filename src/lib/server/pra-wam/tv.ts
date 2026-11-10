import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import type { RoomUse } from "@/lib/pra-wam/sessions";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import {
  isTemplateKind, itemShows, looksLikeTvSlug, TV_DEFAULT_LOOK, TV_DEFAULT_SETTINGS, TV_IMAGE_PREFIX, tvImageKey, tvLimits, tvModes, tvQrPositions, weekOf,
  type TvDay, type TvFeed, type TvItemKind, type TvItemSchedule, type TvNote, type TvPlayItem, type TvRoom, type TvSettings, type TvSlideStart, type TvTimelineEntry,
} from "@/lib/pra-wam/tv";
import { hashTvKey, looksLikeTvKey } from "@/lib/pra-wam/tv-key";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignUpload, readObject, removeObjects, verifyUpload } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import type { WamLook } from "@/lib/pra-wam/theme";
import { listRooms } from "./appraisal";
import { roomUsesBetween, timelineItems } from "./sessions";
import { timelineCountdown, timelineMonths, type Countdown } from "@/lib/pra-wam/timeline";
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

/** The playlist (one row per thing a TV plays) arrives with this one; before it TVs play the two calendars and the pictures. */
export const TV_ITEMS_MIGRATION = "202611100007_pw_tv_playlist.sql";
const noTable = (error: { code?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "");
const waitingForItems = () => new ServiceError(503, `Daftar tayangan menunggu migrasi ${TV_ITEMS_MIGRATION}.`);
type ItemRow = {
  id: string; kind: TvItemKind; title: string; body: string; slide_id: string | null; seconds: number; sort_order: number; active: boolean;
  show_from: string | null; show_until: string | null; time_from: string | null; time_until: string | null; screen_ids: string[] | null;
};
const ITEM_COLUMNS = "id,kind,title,body,slide_id,seconds,sort_order,active,show_from,show_until,time_from,time_until,screen_ids";
/** The playlist in order, or null before its migration. */
async function readItems(): Promise<ItemRow[] | null> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_items").select(ITEM_COLUMNS).order("sort_order").order("created_at");
  if (error) { if (noTable(error)) return null; databaseError(error); }
  return (data ?? []) as ItemRow[];
}
const scheduleOf = (row: ItemRow): TvItemSchedule => ({ showFrom: row.show_from, showUntil: row.show_until, timeFrom: row.time_from?.slice(0, 5) ?? null, timeUntil: row.time_until?.slice(0, 5) ?? null, screenIds: row.screen_ids ?? [] });

/* ---- Admin WAM ---------------------------------------------------------------------------------- */

/** `slug` is null for a TV made before the short addresses that has not been given one (it still plays at its key address). */
export type TvScreen = {
  id: string; name: string; slug: string | null; keyHint: string; lastSeenAt: string | null; width: number | null; height: number | null; createdAt: string;
  /** What the TV last said it was showing ("Kalender hari ini"); null before the playlist's migration or before it said. */
  lastItem: string | null;
};
/** A row of the playlist as the admin edits it. `slideId` is a picture's, for its thumbnail. */
export type TvAdminItem = TvItemSchedule & { id: string; kind: TvItemKind; title: string; body: string; seconds: number; active: boolean; slideId: string | null };
export type TvAdminSlide = { id: string; title: string; seconds: number; active: boolean };
export type TvAdmin = {
  migrated: boolean; slugReady: boolean; lookReady: boolean; storageReady: boolean; now: string; screens: TvScreen[]; slides: TvAdminSlide[]; settings: TvSettings;
  /** The playlist in order; null before its migration (the calendars and the pictures then play as the settings say). */
  items: TvAdminItem[] | null;
};

/** The board's mode and QR code arrive with this one; before it the board is dark, without a QR code. */
export const TV_LOOK_MIGRATION = "202611100005_pw_tv_look.sql";
const LOOP_COLUMNS = "show_day,day_seconds,show_week,week_seconds";
type SettingsRow = { show_day: boolean; day_seconds: number; show_week: boolean; week_seconds: number; mode?: string; qr_show?: boolean; qr_url?: string; qr_label?: string; qr_position?: string };

/** The settings, and whether the look columns (mode, QR code) are there yet. */
async function readSettingsState(): Promise<{ settings: TvSettings; lookReady: boolean }> {
  const read = (columns: string) => createPrivilegedClient().from("pw_tv_settings").select(columns).eq("id", true).maybeSingle();
  let lookReady = true;
  let { data, error } = await read(`${LOOP_COLUMNS},mode,qr_show,qr_url,qr_label,qr_position`);
  if (error && noSlug(error)) { lookReady = false; ({ data, error } = await read(LOOP_COLUMNS)); }
  if (error) fail(error);
  const row = data as unknown as SettingsRow | null;
  if (!row) return { settings: TV_DEFAULT_SETTINGS, lookReady };
  return {
    lookReady,
    settings: {
      showDay: row.show_day, daySeconds: row.day_seconds, showWeek: row.show_week, weekSeconds: row.week_seconds,
      mode: (tvModes as readonly string[]).includes(row.mode ?? "") ? row.mode as TvSettings["mode"] : TV_DEFAULT_LOOK.mode,
      qrShow: row.qr_show ?? TV_DEFAULT_LOOK.qrShow, qrUrl: row.qr_url ?? "", qrLabel: row.qr_label ?? "",
      qrPosition: (tvQrPositions as readonly string[]).includes(row.qr_position ?? "") ? row.qr_position as TvSettings["qrPosition"] : TV_DEFAULT_LOOK.qrPosition,
    },
  };
}
const readSettings = async (): Promise<TvSettings> => (await readSettingsState()).settings;

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
    if (missing(error)) return { migrated: false, slugReady: false, lookReady: false, storageReady: isR2Configured(), now, screens: [], slides: [], settings: TV_DEFAULT_SETTINGS, items: null };
    databaseError(error);
  }
  const [slides, { settings, lookReady }, items] = await Promise.all([readSlides(), readSettingsState(), readItems()]);
  // What each TV last showed: a column of the playlist's migration, so asked for only once that has run.
  const shown = new Map<string, string | null>();
  if (items) {
    const { data: last } = await client.from("pw_tv_screens").select("id,last_item");
    for (const row of (last ?? []) as { id: string; last_item: string | null }[]) shown.set(row.id, row.last_item);
  }
  return {
    items: items?.map(row => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, seconds: row.seconds, active: row.active, slideId: row.slide_id, ...scheduleOf(row) })) ?? null,
    migrated: true, slugReady, lookReady, storageReady: isR2Configured(), now,
    screens: ((data ?? []) as unknown as ScreenRow[]).map(row => ({ id: row.id, name: row.name, slug: row.slug ?? null, keyHint: row.key_hint, lastSeenAt: row.last_seen_at, width: row.last_width, height: row.last_height, createdAt: row.created_at, lastItem: shown.get(row.id) ?? null })),
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
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_tv_screens").delete().eq("id", id).select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "TV ini tidak ditemukan. Muat ulang halaman.");
  // A row that was for this TV among others goes on without it; one that was for this TV alone is switched off, not shown everywhere.
  const items = await readItems().catch(() => null);
  for (const row of items ?? []) {
    if (!(row.screen_ids ?? []).includes(id)) continue;
    const left = (row.screen_ids ?? []).filter(screen => screen !== id);
    await client.from("pw_tv_items").update(left.length ? { screen_ids: left } : { screen_ids: [], active: false }).eq("id", row.id);
  }
  invalidate();
}

/** Muat ulang TV: the TV loads its page afresh the next time it asks (within ten seconds, while it is on). */
export async function reloadScreen(id: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_screens").update({ reload_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) { if (noSlug(error)) throw waitingForItems(); fail(error); }
  if (!data?.length) throw new ServiceError(404, "TV ini tidak ditemukan. Muat ulang halaman.");
}

/* ---- The playlist ------------------------------------------------------------------------------- */

const itemsOrWait = async (): Promise<ItemRow[]> => (await readItems()) ?? (() => { throw waitingForItems(); })();
const nextOrder = (items: readonly ItemRow[]) => Math.max(0, ...items.map(item => item.sort_order)) + 1;

/** A template (one of each) or a text joins the playlist, last. Pictures join through their upload. */
export async function createItem(input: { kind: Exclude<TvItemKind, "gambar">; title: string; body: string }): Promise<void> {
  const items = await itemsOrWait();
  if (isTemplateKind(input.kind) && items.some(item => item.kind === input.kind)) throw new ServiceError(409, "Template ini sudah ada di daftar tayangan.");
  if (items.length >= 200) throw new ServiceError(409, "Daftar tayangan sudah penuh. Hapus yang tidak dipakai dulu.");
  const { error } = await createPrivilegedClient().from("pw_tv_items")
    .insert({ kind: input.kind, title: input.title, body: input.kind === "teks" ? input.body : "", seconds: input.kind === "teks" ? 10 : 20, sort_order: nextOrder(items) });
  if (error) databaseError(error);
  invalidate();
}

export type ItemChange = Partial<{ title: string; body: string; seconds: number; active: boolean; showFrom: string | null; showUntil: string | null; timeFrom: string | null; timeUntil: string | null; screenIds: string[] }>;
export async function updateItem(id: string, change: ItemChange): Promise<void> {
  const row: Record<string, unknown> = {};
  if (change.title !== undefined) row.title = change.title;
  if (change.body !== undefined) row.body = change.body;
  if (change.seconds !== undefined) row.seconds = change.seconds;
  if (change.active !== undefined) row.active = change.active;
  if (change.showFrom !== undefined) row.show_from = change.showFrom;
  if (change.showUntil !== undefined) row.show_until = change.showUntil;
  if (change.timeFrom !== undefined) row.time_from = change.timeFrom;
  if (change.timeUntil !== undefined) row.time_until = change.timeUntil;
  if (change.screenIds !== undefined) row.screen_ids = change.screenIds;
  const { data, error } = await createPrivilegedClient().from("pw_tv_items").update(row).eq("id", id).select("id");
  if (error) {
    if (noTable(error)) throw waitingForItems();
    if (error.code === "23514") throw new ServiceError(422, "Tanggal akhir tidak boleh sebelum tanggal mulai.", { showUntil: ["Sebelum tanggal mulai."] });
    databaseError(error);
  }
  if (!data?.length) throw new ServiceError(404, "Tayangan ini tidak ditemukan. Muat ulang halaman.");
  invalidate();
}

/** A row leaves the playlist; a picture's row takes its picture with it (out of storage too). */
export async function deleteItem(id: string): Promise<void> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_tv_items").select("id,slide_id").eq("id", id).maybeSingle();
  if (error) { if (noTable(error)) throw waitingForItems(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Tayangan ini tidak ditemukan. Muat ulang halaman.");
  if (data.slide_id) { await deleteSlide(data.slide_id); return; }
  const { error: deleteError } = await client.from("pw_tv_items").delete().eq("id", id);
  if (deleteError) databaseError(deleteError);
  invalidate();
}

/** The playlist in a new order: every row must be named once. */
export async function orderItems(ids: readonly string[]): Promise<void> {
  const items = await itemsOrWait();
  if (new Set(ids).size !== ids.length || ids.length !== items.length || items.some(item => !ids.includes(item.id))) {
    throw new ServiceError(409, "Daftar tayangan sudah berubah. Muat ulang halaman, lalu urutkan lagi.");
  }
  const client = createPrivilegedClient();
  const results = await Promise.all(ids.map((id, index) => client.from("pw_tv_items").update({ sort_order: index + 1 }).eq("id", id)));
  const failed = results.find(result => result.error);
  if (failed?.error) databaseError(failed.error);
  invalidate();
}

export async function saveSettings(settings: TvSettings): Promise<void> {
  const client = createPrivilegedClient();
  const loop = { id: true, show_day: settings.showDay, day_seconds: settings.daySeconds, show_week: settings.showWeek, week_seconds: settings.weekSeconds, updated_at: new Date().toISOString() };
  const { error } = await client.from("pw_tv_settings")
    .upsert({ ...loop, mode: settings.mode, qr_show: settings.qrShow, qr_url: settings.qrUrl, qr_label: settings.qrLabel, qr_position: settings.qrPosition });
  if (error && noSlug(error)) {
    // Before the look migration: the calendars are still saved; the mode and the QR code wait for it.
    const { error: loopError } = await client.from("pw_tv_settings").upsert(loop);
    if (loopError) fail(loopError);
    invalidate();
    const look = { mode: settings.mode, qrShow: settings.qrShow, qrUrl: settings.qrUrl, qrLabel: settings.qrLabel, qrPosition: settings.qrPosition };
    if (JSON.stringify(look) !== JSON.stringify(TV_DEFAULT_LOOK)) throw new ServiceError(503, `Tema dan QR menunggu migrasi ${TV_LOOK_MIGRATION}. Pengaturan kalender sudah tersimpan.`);
    return;
  }
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
    const client = createPrivilegedClient();
    const { data: made, error } = await client.from("pw_tv_slides")
      .insert({ image_key: input.key, title: input.title, sort_order: Math.max(0, ...slides.map(slide => slide.sort_order)) + 1 }).select("id").single();
    if (error) fail(error);
    // With the playlist: the picture is a row of it, last (before its migration the pictures' own order is the loop).
    const items = await readItems();
    if (items) {
      const { error: itemError } = await client.from("pw_tv_items").insert({ kind: "gambar", slide_id: made.id, title: input.title, seconds: 8, sort_order: nextOrder(items) });
      if (itemError) { await client.from("pw_tv_slides").delete().eq("id", made.id); databaseError(itemError); }
    }
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
  if (onlyActive) {
    // With the playlist, the picture's row decides: hidden there (or gone from it) means not shown to any TV.
    const { data: row, error: rowError } = await createPrivilegedClient().from("pw_tv_items").select("active").eq("slide_id", id).maybeSingle();
    if (rowError && !noTable(rowError)) databaseError(rowError);
    if (!rowError && !row?.active) return null;
  }
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
          key: `${use.source}:${use.sourceId}`, title: use.title ?? use.label, by: use.by ?? "", person: use.byName ?? "", dept: use.byDept ?? "",
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
 * Every TV asks every 10 seconds and all get the same content, so it is read at most once in six
 * seconds per server instance; a change by the admin clears it here (other instances catch up
 * within the six seconds).
 */
const FRESH_MS = 6_000;
/**
 * Pra WAM's countdown for the board (10 Nov 2026): from Timeline's forums and events, only their
 * names and dates (the board is open to anyone who knows its address). None when it cannot be read.
 */
async function boardTimeline(date: string): Promise<{ countdown: Countdown | null; timeline: TvTimelineEntry[] }> {
  const { items } = await timelineItems(null).catch(() => ({ items: [] }));
  const entries = timelineMonths(items, date).flatMap(month => month.entries);
  const days = (to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  const left = (count: number) => (count <= 0 ? "hari ini" : count === 1 ? "besok" : `${count} hari lagi`);
  return {
    countdown: timelineCountdown(entries, date),
    // For the "timeline" template: what is on and what comes next, names and dates only.
    timeline: entries.filter(entry => entry.state !== "selesai").slice(0, 12).map(entry => ({
      id: entry.id, title: entry.title, when: entry.when, hours: entry.hours, state: entry.state === "berlangsung" ? "berlangsung" as const : "akan" as const, color: entry.color,
      left: entry.state === "berlangsung" ? `berakhir ${left(days(entry.to))}` : `mulai ${left(days(entry.from))}`,
    })),
  };
}

/**
 * Panitia's announcements for the "pengumuman" template: only those sent to everyone (the board
 * is open to anyone who knows its address, so nothing meant for one unit, session or person),
 * the last four of the past two weeks. None when they cannot be read.
 */
async function boardNotes(now: Date): Promise<TvNote[]> {
  try {
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const { data, error } = await createPrivilegedClient().from("pw_announcements").select("id,title,body,created_at")
      .eq("kind", "pengumuman").eq("audience_label", "Semua peserta").gte("created_at", since).order("created_at", { ascending: false }).limit(4);
    if (error) return [];
    return (data ?? []).map(row => ({ id: row.id as string, title: row.title as string, body: row.body as string, at: row.created_at as string }));
  } catch { return []; }
}

type Content = {
  date: string; days: TvDay[]; slides: SlideRow[]; settings: TvSettings; look: WamLook; countdown: Countdown | null;
  items: ItemRow[] | null; allSlides: SlideRow[]; timeline: TvTimelineEntry[]; notes: TvNote[];
};
let kept: { at: number; content: Content } | null = null;
const invalidate = () => { kept = null; };

async function content(now: Date): Promise<Content> {
  const date = wibDate(now.toISOString());
  if (kept && kept.content.date === date && now.getTime() - kept.at < FRESH_MS) return kept.content;
  const [days, slides, settings, look, { countdown, timeline }, items] = await Promise.all([weekDays(weekOf(date)), readSlides(), readSettings(), readWamLook(), boardTimeline(date), readItems()]);
  // The announcements are read only when the playlist has their template.
  const notes = items?.some(item => item.kind === "pengumuman" && item.active) ? await boardNotes(now) : [];
  const fresh = { date, days, slides: slides.filter(slide => slide.active), settings, look, countdown, items, allSlides: slides, timeline, notes };
  kept = { at: now.getTime(), content: fresh };
  return fresh;
}

/** What plays now; `imageSrc` gives each picture's address (a TV's goes through its key, the admin's through the admin API). */
export async function tvFeed(imageSrc: (slideId: string) => string, now = new Date(), screen: { id: string; reloadAt: string | null } | null = null): Promise<TvFeed> {
  const { date, days, slides, settings, look, countdown, items, allSlides, timeline, notes } = await content(now);
  // The playlist, narrowed to this TV, today and this time of day. A picture's row carries its picture's id, so its address is the picture's.
  const at = { date, time: wibTime(now.toISOString()), screenId: screen?.id ?? null };
  const playlist: TvPlayItem[] | undefined = items?.filter(item => itemShows({ ...scheduleOf(item), active: item.active }, at))
    .filter(item => item.kind !== "gambar" || allSlides.some(slide => slide.id === item.slide_id))
    .map(item => ({ id: item.slide_id ?? item.id, kind: item.kind, title: item.title, body: item.body, seconds: item.seconds, ...(item.slide_id ? { src: imageSrc(item.slide_id) } : {}) }));
  return {
    now: now.toISOString(), date, days, settings, look, countdown, version: BUILD,
    slides: slides.map(slide => ({ id: slide.id, title: slide.title, seconds: slide.seconds, src: imageSrc(slide.id) })),
    ...(playlist ? { playlist } : {}),
    ...(playlist?.some(item => item.kind === "timeline") ? { timeline } : {}),
    ...(playlist?.some(item => item.kind === "pengumuman") ? { notes } : {}),
    ...(screen ? { reloadAt: screen.reloadAt } : {}),
  };
}

/** This build of the site, so a TV can tell when a newer one answers (Vercel names each deployment; "dev" on a laptop). */
const BUILD = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";

const SEEN_EVERY_MS = 60_000;
const SHOWING_EVERY_MS = 20_000;

/**
 * The TV at an address, or null for one that does not exist (or before its migration). The
 * address is the TV's short slug ("lobi"); a TV made before those still answers at its long key.
 * Notes when it was last seen and its screen size, at most once a minute.
 */
export async function screenForKey(key: unknown, size?: { width: number; height: number }, now = new Date(), showing?: string): Promise<{ id: string; reloadAt: string | null } | null> {
  const byKey = looksLikeTvKey(key);
  if (!byKey && !looksLikeTvSlug(key)) return null;
  const client = createPrivilegedClient();
  type Found = { id: string; last_seen_at: string | null; last_width: number | null; last_height: number | null; reload_at?: string | null; last_item?: string | null };
  const find = (columns: string) => { const found = client.from("pw_tv_screens").select(columns); return (byKey ? found.eq("key_hash", hashTvKey(key)) : found.eq("slug", key)).maybeSingle(); };
  // With the playlist's migration a TV also has a reload request and says what it shows; before it, neither.
  let playlistReady = true;
  let { data: row, error } = await find("id,last_seen_at,last_width,last_height,reload_at,last_item");
  if (error && noSlug(error)) { playlistReady = false; ({ data: row, error } = await find("id,last_seen_at,last_width,last_height")); }
  if (error) { if (missing(error) || noSlug(error)) return null; databaseError(error); }
  const data = row as unknown as Found | null;
  if (!data) return null;
  const resized = !!size && (size.width !== data.last_width || size.height !== data.last_height);
  const item = playlistReady && showing ? showing.slice(0, 80) : undefined;
  const quiet = data.last_seen_at ? now.getTime() - Date.parse(data.last_seen_at) : Infinity;
  // What it shows changes every few seconds: noted when it differs, but not more often than every twenty seconds.
  const changed = item !== undefined && item !== (data.last_item ?? "") && quiet >= SHOWING_EVERY_MS;
  if (size && (resized || changed || !data.last_seen_at || now.getTime() - Date.parse(data.last_seen_at) >= SEEN_EVERY_MS)) {
    await client.from("pw_tv_screens").update({ last_seen_at: now.toISOString(), last_width: size.width, last_height: size.height, ...(item !== undefined ? { last_item: item } : {}) }).eq("id", data.id);
  }
  return { id: data.id, reloadAt: data.reload_at ?? null };
}
