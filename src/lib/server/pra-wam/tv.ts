import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { clockLabel, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import type { RoomUse } from "@/lib/pra-wam/sessions";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import {
  isTemplateKind, itemShows, looksLikeTvSlug, isVideoFile, sniffVideo, TV_BIRTHDAY_WISH, TV_MEETING_PHOTOS, takeoverOn, takeoverRuns, tvVideoKey, welcomeDesign, youtubeId, TV_WELCOME_GREETING, TV_WELCOMES_MOST, TV_DEFAULT_LOOK, TV_DEFAULT_SETTINGS, TV_IMAGE_PREFIX, tvImageKey, tvLimits, tvModes, tvQrPositions, weekOf,
  type TvDay, type TvFeed, type TvItemKind, type TvItemSchedule, type TvNote, type TvPlayItem, type TvRoom, type TvSettings, type TvSlideStart, type TvTakeover, type TvTimelineEntry, type TvVideoStart, type TvWelcome, type TvWelcomeDesign,
} from "@/lib/pra-wam/tv";
import { hashTvKey, looksLikeTvKey } from "@/lib/pra-wam/tv-key";
import { tvMeetingPhotoApi, tvVideoApi } from "@/lib/routes";
import { MOM_CABINET_MIGRATION } from "@/lib/pra-wam/minutes-photos";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, readObject, removeObjects, uploadedStart, verifyUpload } from "../r2";
import { createPrivilegedClient, createPublicClient } from "../supabase/admin";
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
  /** How a welcome is drawn; absent before migration 202611100009. */
  design?: string | null;
  /** A birthday greeting's "call" and "date"; absent before migration 202611100012. */
  extra?: { call?: string; date?: string; cut?: boolean } | null;
};
/** Birthday greetings arrive with this one; before it none can be added. */
export const TV_BIRTHDAY_MIGRATION = "202611100012_pw_tv_birthday.sql";
const waitingForBirthday = () => new ServiceError(503, `Ucapan ulang tahun menunggu migrasi ${TV_BIRTHDAY_MIGRATION}.`);
/** A welcome's design is picked per row with this one; before it every welcome is the Werkudara sign. */
export const TV_DESIGN_MIGRATION = "202611100009_pw_tv_design.sql";
/** A YouTube video is a kind of row with this one; before it none can be added. */
export const TV_VIDEO_MIGRATION = "202611100010_pw_tv_video.sql";
/** A TV can be told not to play videos with this one; before it every TV plays them. */
export const TV_PLAYS_VIDEO_MIGRATION = "202611100011_pw_tv_plays_video.sql";
const ITEM_COLUMNS = "id,kind,title,body,slide_id,seconds,sort_order,active,show_from,show_until,time_from,time_until,screen_ids";
/** The playlist in order, or null before its migration. */
async function readItems(): Promise<ItemRow[] | null> {
  const read = (columns: string) => createPrivilegedClient().from("pw_tv_items").select(columns).order("sort_order").order("created_at");
  let { data, error } = await read(`${ITEM_COLUMNS},design,extra`);
  // Before the birthday's migration, then before the design's: the same rows without those columns.
  if (error && noSlug(error)) ({ data, error } = await read(`${ITEM_COLUMNS},design`));
  if (error && noSlug(error)) ({ data, error } = await read(ITEM_COLUMNS));
  if (error) { if (noTable(error)) return null; databaseError(error); }
  return (data ?? []) as unknown as ItemRow[];
}
const scheduleOf = (row: ItemRow): TvItemSchedule => ({ showFrom: row.show_from, showUntil: row.show_until, timeFrom: row.time_from?.slice(0, 5) ?? null, timeUntil: row.time_until?.slice(0, 5) ?? null, screenIds: row.screen_ids ?? [] });

/**
 * Sambutan tamu and Tayangkan sekarang arrive with this one. Before it the playlist works as it
 * did: the two new kinds cannot be added, and nothing takes the TVs over.
 */
export const TV_WELCOME_MIGRATION = "202611100008_pw_tv_welcome.sql";
const waitingForWelcome = () => new ServiceError(503, `Sambutan tamu dan Tayangkan sekarang menunggu migrasi ${TV_WELCOME_MIGRATION}.`);

/** What takes the TVs over as it is kept (its time may be up), and whether its columns are there yet. */
async function readTakeover(): Promise<{ ready: boolean; takeover: TvTakeover | null }> {
  const { data, error } = await createPrivilegedClient().from("pw_tv_settings").select("now_item_id,now_until,now_screen_ids").eq("id", true).maybeSingle();
  if (error) return { ready: false, takeover: null };
  const row = data as { now_item_id: string | null; now_until: string | null; now_screen_ids: string[] | null } | null;
  return { ready: true, takeover: row?.now_item_id ? { itemId: row.now_item_id, until: row.now_until, screenIds: row.now_screen_ids ?? [] } : null };
}

/**
 * Today's office visits for the "sambutan" template: published Kunjungan Kantor whose day (WIB) is
 * today. Read as a guest would read them (the public client: published only), and only what the
 * visit's own public page opens with: its name, greeting, cover photo, hours and place.
 */
async function boardWelcomes(date: string): Promise<TvWelcome[]> {
  try {
    const { data, error } = await createPublicClient().from("event_documents").select("document").eq("status", "published").eq("document->>event_kind", "kunjungan").limit(300);
    if (error) return [];
    type Visit = { id?: string; title?: string; greeting?: string; starts_at?: string; ends_at?: string | null; venue_name?: string; hero?: { url?: string } };
    return (data ?? []).map(row => row.document as Visit)
      .filter(visit => !!visit?.id && !!visit.title?.trim() && !!visit.starts_at && !Number.isNaN(Date.parse(visit.starts_at)))
      .filter(visit => wibDate(visit.starts_at!) <= date && wibDate(visit.ends_at && !Number.isNaN(Date.parse(visit.ends_at)) ? visit.ends_at : visit.starts_at!) >= date)
      .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!))
      .slice(0, TV_WELCOMES_MOST)
      .map(visit => {
        const sameDay = !visit.ends_at || wibDate(visit.ends_at) === wibDate(visit.starts_at!);
        const start = wibDate(visit.starts_at!) === date ? clockLabel(wibTime(visit.starts_at!)) : "";
        const end = visit.ends_at && sameDay ? clockLabel(wibTime(visit.ends_at)) : "";
        return {
          id: visit.id!, name: visit.title!.trim(), greeting: visit.greeting?.trim() || `${TV_WELCOME_GREETING} di Werkudara`, note: "",
          hours: start && end && end !== start ? `${start}–${end} WIB` : start ? `${start} WIB` : "", place: visit.venue_name?.trim() ?? "", image: visit.hero?.url ?? "",
        };
      });
  } catch { return []; }
}

/* ---- Admin WAM ---------------------------------------------------------------------------------- */

/** `slug` is null for a TV made before the short addresses that has not been given one (it still plays at its key address). */
export type TvScreen = {
  id: string; name: string; slug: string | null; keyHint: string; lastSeenAt: string | null; width: number | null; height: number | null; createdAt: string;
  /** What the TV last said it was showing ("Kalender hari ini"); null before the playlist's migration or before it said. */
  lastItem: string | null;
  /** Whether this TV plays video rows (true before migration 202611100011). */
  playsVideo: boolean;
};
/** A row of the playlist as the admin edits it. `slideId` is a picture's, for its thumbnail. */
export type TvAdminItem = TvItemSchedule & { id: string; kind: TvItemKind; title: string; body: string; seconds: number; active: boolean; slideId: string | null; design: TvWelcomeDesign;
  /** A birthday greeting's: what the greeting calls the person, and their birthday ("" before either is set). */
  call: string; date: string;
  /** A video row whose video is an uploaded file (its `body` is then the file's place in storage, not a YouTube id). */
  videoFile: boolean };
export type TvAdminSlide = { id: string; title: string; seconds: number; active: boolean };
export type TvAdmin = {
  migrated: boolean; slugReady: boolean; lookReady: boolean; storageReady: boolean; now: string; screens: TvScreen[]; slides: TvAdminSlide[]; settings: TvSettings;
  /** The playlist in order; null before its migration (the calendars and the pictures then play as the settings say). */
  items: TvAdminItem[] | null;
  /** Whether Sambutan tamu and Tayangkan sekarang can be used (migration 202611100008). */
  welcomeReady: boolean;
  /** What takes the TVs over now; null when nothing does (or its time is up). */
  takeover: TvTakeover | null;
  /** The names of today's visits, for the Sambutan tamu row ("hari ini: …"). */
  welcomes: string[];
  /** Whether a TV can be told not to play videos (migration 202611100011). */
  videoReady: boolean;
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
    if (missing(error)) return { migrated: false, slugReady: false, lookReady: false, storageReady: isR2Configured(), now, screens: [], slides: [], settings: TV_DEFAULT_SETTINGS, items: null, welcomeReady: false, takeover: null, welcomes: [], videoReady: false };
    databaseError(error);
  }
  const [slides, { settings, lookReady }, items, taking] = await Promise.all([readSlides(), readSettingsState(), readItems(), readTakeover()]);
  const welcomes = items?.some(item => item.kind === "sambutan") ? await boardWelcomes(wibDate(now)) : [];
  // What each TV last showed: a column of the playlist's migration, so asked for only once that has run.
  const shown = new Map<string, string | null>();
  if (items) {
    const { data: last } = await client.from("pw_tv_screens").select("id,last_item");
    for (const row of (last ?? []) as { id: string; last_item: string | null }[]) shown.set(row.id, row.last_item);
  }
  // Which TVs pass over videos: a column of its own migration; every TV plays them before it.
  const { data: video, error: videoError } = await client.from("pw_tv_screens").select("id,plays_video");
  const silent = new Set(videoError ? [] : ((video ?? []) as { id: string; plays_video: boolean }[]).filter(row => row.plays_video === false).map(row => row.id));
  return {
    items: items?.map(row => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, seconds: row.seconds, active: row.active, slideId: row.slide_id, design: welcomeDesign(row.design), videoFile: row.kind === "video" && isVideoFile(row.body), call: row.extra?.call ?? "", date: row.extra?.date ?? "", ...scheduleOf(row) })) ?? null,
    migrated: true, slugReady, lookReady, storageReady: isR2Configured(), now,
    videoReady: !videoError, welcomeReady: taking.ready, takeover: takeoverRuns(taking.takeover, Date.parse(now)) ? taking.takeover : null, welcomes: welcomes.map(visit => visit.name),
    screens: ((data ?? []) as unknown as ScreenRow[]).map(row => ({ id: row.id, name: row.name, slug: row.slug ?? null, keyHint: row.key_hint, lastSeenAt: row.last_seen_at, width: row.last_width, height: row.last_height, createdAt: row.created_at, lastItem: shown.get(row.id) ?? null, playsVideo: !silent.has(row.id) })),
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
export async function updateScreen(id: string, change: { name?: string; slug?: string; playsVideo?: boolean }): Promise<void> {
  const row = { ...(change.name !== undefined ? { name: change.name } : {}), ...(change.slug !== undefined ? { slug: change.slug } : {}), ...(change.playsVideo !== undefined ? { plays_video: change.playsVideo } : {}) };
  const { data, error } = await createPrivilegedClient().from("pw_tv_screens").update(row).eq("id", id).select("id");
  if (error && noSlug(error) && change.playsVideo !== undefined) throw new ServiceError(503, `Pengaturan video per TV menunggu migrasi ${TV_PLAYS_VIDEO_MIGRATION}.`);
  if (error) screenSaveError(error);
  invalidate();
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
export async function createItem(input: { kind: Exclude<TvItemKind, "gambar">; title: string; body: string; call?: string; date?: string | null }): Promise<void> {
  const items = await itemsOrWait();
  if (isTemplateKind(input.kind) && items.some(item => item.kind === input.kind)) throw new ServiceError(409, "Template ini sudah ada di daftar tayangan.");
  if (items.length >= 200) throw new ServiceError(409, "Daftar tayangan sudah penuh. Hapus yang tidak dipakai dulu.");
  const typed = input.kind === "teks" || input.kind === "tamu";
  if (input.kind === "ultah") {
    // A birthday greeting shows on the birthday itself (this year's), unless the admin sets other days in Atur.
    const on = input.date ? `${wibDate(new Date().toISOString()).slice(0, 4)}${input.date.slice(4)}` : null;
    const { error } = await createPrivilegedClient().from("pw_tv_items").insert({
      kind: "ultah", title: input.title, body: input.body || TV_BIRTHDAY_WISH, extra: { call: input.call ?? "", date: input.date ?? "" },
      show_from: on, show_until: on, seconds: 20, sort_order: nextOrder(items),
    });
    if (error) { if (error.code === "23514" || noSlug(error)) throw waitingForBirthday(); databaseError(error); }
    invalidate();
    return;
  }
  if (input.kind === "video") {
    // A video's row keeps the video's id, not the address that was pasted.
    const id = youtubeId(input.body);
    if (!id) throw new ServiceError(422, "Alamat video YouTube tidak dikenali.", { body: ["Tempel alamat video YouTube."] });
    const { error } = await createPrivilegedClient().from("pw_tv_items").insert({ kind: "video", title: input.title, body: id, seconds: 15, sort_order: nextOrder(items) });
    if (error) { if (error.code === "23514") throw new ServiceError(503, `Video YouTube menunggu migrasi ${TV_VIDEO_MIGRATION}.`); databaseError(error); }
    invalidate();
    return;
  }
  const { error } = await createPrivilegedClient().from("pw_tv_items")
    .insert({ kind: input.kind, title: typed ? input.title : "", body: typed ? input.body : "", seconds: input.kind === "teks" ? 10 : input.kind === "foto_meeting" ? 8 : typed || input.kind === "sambutan" ? 15 : 20, sort_order: nextOrder(items) });
  // The two welcome kinds, and Foto meeting, are not allowed by the table before their migrations.
  if (error) {
    if (error.code === "23514") throw input.kind === "foto_meeting" ? new ServiceError(503, `Foto meeting menunggu migrasi ${MOM_CABINET_MIGRATION}.`) : waitingForWelcome();
    databaseError(error);
  }
  invalidate();
}

/**
 * Tayangkan sekarang: one row takes the TVs over, for `minutes` or until stopped (null), on every
 * TV or on those named. A new one replaces the one that runs.
 */
export async function startTakeover(input: { itemId: string; minutes: number | null; screenIds: string[] }, now = new Date()): Promise<void> {
  const items = await itemsOrWait();
  if (!items.some(item => item.id === input.itemId)) throw new ServiceError(404, "Tayangan ini tidak ditemukan. Muat ulang halaman.");
  const { error } = await createPrivilegedClient().from("pw_tv_settings").upsert({
    id: true, now_item_id: input.itemId, now_screen_ids: input.screenIds,
    now_until: input.minutes == null ? null : new Date(now.getTime() + input.minutes * 60_000).toISOString(),
  });
  if (error) { if (noSlug(error)) throw waitingForWelcome(); fail(error); }
  invalidate();
}

/** Hentikan: the TVs go back to the playlist the next time they ask. */
export async function stopTakeover(): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_tv_settings").update({ now_item_id: null, now_until: null, now_screen_ids: [] }).eq("id", true);
  if (error) { if (noSlug(error)) throw waitingForWelcome(); fail(error); }
  invalidate();
}

export type ItemChange = Partial<{ title: string; body: string; seconds: number; active: boolean; showFrom: string | null; showUntil: string | null; timeFrom: string | null; timeUntil: string | null; screenIds: string[]; design: TvWelcomeDesign; call: string; date: string | null }>;
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
  if (change.design !== undefined) row.design = change.design;
  // A birthday's "call" and "date" are kept together: the page sends both when either changes.
  if (change.call !== undefined || change.date !== undefined) {
    // Whether its photo is a cut-out stays as the upload left it.
    const { data: now } = await createPrivilegedClient().from("pw_tv_items").select("extra").eq("id", id).maybeSingle();
    row.extra = { call: change.call ?? "", date: change.date ?? "", cut: (now?.extra as { cut?: boolean } | null)?.cut === true };
  }
  let { data, error } = await createPrivilegedClient().from("pw_tv_items").update(row).eq("id", id).select("id");
  // Before the design's migration: everything else is saved, and a design other than the only one there is waits for it.
  if (error && noSlug(error) && change.design !== undefined) {
    delete row.design;
    if (Object.keys(row).length) ({ data, error } = await createPrivilegedClient().from("pw_tv_items").update(row).eq("id", id).select("id"));
    else ({ data, error } = await createPrivilegedClient().from("pw_tv_items").select("id").eq("id", id));
    if (!error && change.design !== welcomeDesign(null)) { invalidate(); throw new ServiceError(503, `Pilihan desain sambutan menunggu migrasi ${TV_DESIGN_MIGRATION}. Perubahan lain sudah tersimpan.`); }
  }
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
  const { data, error } = await client.from("pw_tv_items").select("id,slide_id,kind,body").eq("id", id).maybeSingle();
  if (error) { if (noTable(error)) throw waitingForItems(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Tayangan ini tidak ditemukan. Muat ulang halaman.");
  if (data.slide_id) { await deleteSlide(data.slide_id); return; }
  const { error: deleteError } = await client.from("pw_tv_items").delete().eq("id", id);
  if (deleteError) databaseError(deleteError);
  // A video file goes out of storage with its row.
  if (data.kind === "video" && isVideoFile(data.body as string) && isR2Configured()) await removeObjects([data.body as string]).catch(() => undefined);
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
export async function confirmSlideUpload(input: TvSlideStart & { key: string; token: string; title: string; itemId?: string; cut?: boolean }): Promise<void> {
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
    const items = await readItems();
    if (input.itemId) {
      // A birthday greeting's photo: the picture belongs to that row, in place of the one it had.
      const row = items?.find(item => item.id === input.itemId && item.kind === "ultah");
      if (!row) { await client.from("pw_tv_slides").delete().eq("id", made.id); throw new ServiceError(404, "Ucapan ulang tahun ini tidak ditemukan. Muat ulang halaman."); }
      const { error: linkError } = await client.from("pw_tv_items").update({ slide_id: made.id, extra: { ...(row.extra ?? {}), cut: input.cut === true } }).eq("id", row.id);
      if (linkError) { await client.from("pw_tv_slides").delete().eq("id", made.id); databaseError(linkError); }
      // The old photo goes only now that no row points at it (a picture takes its row with it).
      if (row.slide_id) {
        const { data: old } = await client.from("pw_tv_slides").delete().eq("id", row.slide_id).select("image_key");
        await removeObjects((old ?? []).map(slide => slide.image_key as string)).catch(() => undefined);
      }
    }
    // With the playlist: the picture is a row of it, last (before its migration the pictures' own order is the loop).
    else if (items) {
      const { error: itemError } = await client.from("pw_tv_items").insert({ kind: "gambar", slide_id: made.id, title: input.title, seconds: 8, sort_order: nextOrder(items) });
      if (itemError) { await client.from("pw_tv_slides").delete().eq("id", made.id); databaseError(itemError); }
    }
  } catch (error) { await discard(); throw error; }
  invalidate();
}

/**
 * A picture made from a meeting photo (Admin WAM → Arsip MoM → Tampilkan di TV, migration
 * 202611120006): its copy is already in the TV's storage under `key`. It joins the playlist last,
 * shown, and remembers the photo it came from.
 */
export async function addMeetingPicture(key: string, title: string, momPhotoId: string): Promise<void> {
  if (!key.startsWith(TV_IMAGE_PREFIX)) throw new ServiceError(400, "Gambar TV tidak dikenali.");
  const slides = await readSlides();
  if (slides.length >= tvLimits.slides) throw full();
  const client = createPrivilegedClient();
  const { data: made, error } = await client.from("pw_tv_slides")
    .insert({ image_key: key, title, mom_photo_id: momPhotoId, sort_order: Math.max(0, ...slides.map(slide => slide.sort_order)) + 1 }).select("id").single();
  if (error) fail(error);
  const items = await readItems();
  if (items) {
    const { error: itemError } = await client.from("pw_tv_items").insert({ kind: "gambar", slide_id: made.id, title, seconds: 8, sort_order: nextOrder(items) });
    if (itemError) { await client.from("pw_tv_slides").delete().eq("id", made.id); databaseError(itemError); }
  }
  invalidate();
}

/* ---- Video files, in two steps like the pictures -------------------------------------------------- */

function videoSignature(key: string, input: TvVideoStart, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`tv-video\0${key}\0${input.size}\0${input.mime}\0${expires}`).digest("hex");
}
function videoTokenMatches(token: string, key: string, input: TvVideoStart, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(videoSignature(key, input, expires), "hex"));
}
/** A large file takes a while to send: the token to confirm it with lasts two hours. */
const VIDEO_TOKEN_SECONDS = 2 * 3600;

/** Step one: where to put the video file, and a token to confirm it with. */
export async function startVideoUpload(input: TvVideoStart): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  const items = await itemsOrWait();
  if (items.length >= 200) throw new ServiceError(409, "Daftar tayangan sudah penuh. Hapus yang tidak dipakai dulu.");
  const key = tvVideoKey(randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + VIDEO_TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${videoSignature(key, input, expires)}` };
}

/** Step two: the file is there with the agreed size and is an MP4 or a WebM; then it joins the playlist, last. */
export async function confirmVideoUpload(input: TvVideoStart & { key: string; token: string; title: string }): Promise<void> {
  if (!isR2Configured()) throw notReady();
  if (!isVideoFile(input.key) || !videoTokenMatches(input.token, input.key, input)) throw new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  try {
    if (!sniffVideo(await uploadedStart(input.key, input.size))) throw new ServiceError(422, "Berkas bukan video MP4 atau WebM.");
    const items = await itemsOrWait();
    const { error } = await createPrivilegedClient().from("pw_tv_items").insert({ kind: "video", title: input.title, body: input.key, seconds: 15, sort_order: nextOrder(items) });
    if (error) { if (error.code === "23514") throw new ServiceError(503, `Video menunggu migrasi ${TV_VIDEO_MIGRATION}.`); databaseError(error); }
  } catch (error) { await discard(); throw error; }
  invalidate();
}

/**
 * Where a TV gets a video file from: a short-lived address in storage (which answers in parts, as
 * a video player asks), or null. Only for a video row that is shown, or that takes the TVs over.
 */
export async function videoAddress(itemId: string): Promise<string | null> {
  if (!isR2Configured()) return null;
  const { data, error } = await createPrivilegedClient().from("pw_tv_items").select("id,kind,body,active").eq("id", itemId).maybeSingle();
  if (error || !data || data.kind !== "video" || !isVideoFile(data.body as string)) return null;
  if (!data.active) {
    const { takeover } = await readTakeover();
    if (!takeoverRuns(takeover, Date.now()) || takeover.itemId !== itemId) return null;
  }
  return presignDownload(data.body as string, { seconds: 6 * 3600 });
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

/** A meeting photo's bytes for a TV, or null: only one the "Foto meeting" template plays now. */
export async function meetingPhotoImage(photoId: string, now = new Date()): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isR2Configured()) return null;
  const { meetingPhotos } = await content(now);
  if (!meetingPhotos.some(photo => photo.id === photoId)) return null;
  const { data, error } = await createPrivilegedClient().from("pw_session_minute_photos").select("file_key").eq("id", photoId).maybeSingle();
  if (error || !data) return null;
  return readObject(data.file_key as string);
}

/** One picture's bytes, or null. A TV only gets pictures that are in the loop. */
export async function slideImage(id: string, onlyActive: boolean): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!isR2Configured()) return null;
  const { data, error } = await createPrivilegedClient().from("pw_tv_slides").select("image_key,active").eq("id", id).maybeSingle();
  if (error) { if (missing(error)) return null; databaseError(error); }
  if (!data || (onlyActive && !data.active)) return null;
  if (onlyActive) {
    // With the playlist, the picture's row decides: hidden there (or gone from it) means not shown to any TV.
    const { data: row, error: rowError } = await createPrivilegedClient().from("pw_tv_items").select("id,active").eq("slide_id", id).maybeSingle();
    if (rowError && !noTable(rowError)) databaseError(rowError);
    if (!rowError && !row?.active) {
      // Hidden, but it is what takes the TVs over now: then it is shown after all.
      const { takeover } = await readTakeover();
      const taken = takeoverRuns(takeover, Date.now()) ? await createPrivilegedClient().from("pw_tv_items").select("slide_id").eq("id", takeover.itemId).maybeSingle() : null;
      if (taken?.data?.slide_id !== id) return null;
    }
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

/**
 * The "foto_meeting" template's photos: those of the MoMs sent in the last 30 days that did not stay
 * out of Telegram, newest first, at most twelve, each named by its meeting and day. None when they
 * cannot be read (before the MoM migrations).
 */
async function boardMeetingPhotos(now: Date): Promise<{ id: string; caption: string }[]> {
  try {
    const client = createPrivilegedClient();
    const since = new Date(now.getTime() - TV_MEETING_PHOTOS.days * 86_400_000).toISOString();
    const { data: sent, error } = await client.from("pw_session_minutes").select("session_id")
      .not("sent_at", "is", null).gte("sent_at", since).eq("telegram_off", false).order("sent_at", { ascending: false }).limit(60);
    if (error || !sent?.length) return [];
    const ids = sent.map(row => row.session_id as string);
    const [{ data: photos, error: photoError }, { data: sessions }] = await Promise.all([
      client.from("pw_session_minute_photos").select("id,session_id,created_at").in("session_id", ids).order("created_at", { ascending: false }).limit(TV_MEETING_PHOTOS.most),
      client.from("pw_sessions").select("id,title,starts_at").in("id", ids),
    ]);
    if (photoError || !photos?.length) return [];
    const dayMonthOf = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
    return photos.map(photo => {
      const session = (sessions ?? []).find(row => row.id === photo.session_id);
      const day = session?.starts_at ? ` · ${dayMonthOf.format(new Date(session.starts_at as string)).replace(/\.$/, "")}` : "";
      return { id: photo.id as string, caption: session ? `${session.title as string}${day}` : "Foto meeting" };
    });
  } catch { return []; }
}

type Content = {
  date: string; days: TvDay[]; slides: SlideRow[]; settings: TvSettings; look: WamLook; countdown: Countdown | null;
  items: ItemRow[] | null; allSlides: SlideRow[]; timeline: TvTimelineEntry[]; notes: TvNote[];
  welcomes: TvWelcome[]; takeover: TvTakeover | null; meetingPhotos: { id: string; caption: string }[];
};
let kept: { at: number; content: Content } | null = null;
const invalidate = () => { kept = null; };

async function content(now: Date): Promise<Content> {
  const date = wibDate(now.toISOString());
  if (kept && kept.content.date === date && now.getTime() - kept.at < FRESH_MS) return kept.content;
  const [days, slides, settings, look, { countdown, timeline }, items, { takeover }] = await Promise.all([weekDays(weekOf(date)), readSlides(), readSettings(), readWamLook(), boardTimeline(date), readItems(), readTakeover()]);
  // The visits are read only when the playlist has their template (shown, or taking the TVs over).
  const welcomes = items?.some(item => item.kind === "sambutan" && (item.active || item.id === takeover?.itemId)) ? await boardWelcomes(date) : [];
  // The announcements are read only when the playlist has their template.
  const notes = items?.some(item => item.kind === "pengumuman" && (item.active || item.id === takeover?.itemId)) ? await boardNotes(now) : [];
  // The meeting photos are read only when the playlist has their template.
  const meetingPhotos = items?.some(item => item.kind === "foto_meeting" && (item.active || item.id === takeover?.itemId)) ? await boardMeetingPhotos(now) : [];
  const fresh = { date, days, slides: slides.filter(slide => slide.active), settings, look, countdown, items, allSlides: slides, timeline, notes, welcomes, takeover, meetingPhotos };
  kept = { at: now.getTime(), content: fresh };
  return fresh;
}

/** What plays now; `imageSrc` gives each picture's address (a TV's goes through its key, the admin's through the admin API). */
export async function tvFeed(imageSrc: (slideId: string) => string, now = new Date(), screen: { id: string; reloadAt: string | null; playsVideo?: boolean } | null = null): Promise<TvFeed> {
  const { date, days, slides, settings, look, countdown, items, allSlides, timeline, notes, welcomes, takeover, meetingPhotos } = await content(now);
  // The playlist, narrowed to this TV, today and this time of day. A picture's row carries its picture's id, so its address is the picture's.
  const at = { date, time: wibTime(now.toISOString()), screenId: screen?.id ?? null };
  // Tayangkan sekarang: while one row takes this TV over, it plays that row alone, whatever the row's own schedule says.
  const taken = takeoverOn(takeover, { now: now.getTime(), screenId: at.screenId }) ? items?.find(item => item.id === takeover.itemId) : undefined;
  const playlist: TvPlayItem[] | undefined = (taken ? [taken] : items?.filter(item => itemShows({ ...scheduleOf(item), active: item.active }, at)))
    ?.filter(item => item.kind !== "gambar" || allSlides.some(slide => slide.id === item.slide_id))
    // A TV told not to play videos passes over every video row.
    .filter(item => item.kind !== "video" || screen?.playsVideo !== false)
    // A video file's place in storage stays here: the TV gets an address of this site instead.
    .map(item => item.kind === "video" && isVideoFile(item.body) ? { ...item, body: "", video_src: tvVideoApi(item.id) } : { ...item, video_src: "" })
    .map(item => ({ id: item.slide_id ?? item.id, kind: item.kind, title: item.title, body: item.body, seconds: item.seconds, ...(item.slide_id ? { src: imageSrc(item.slide_id) } : item.video_src ? { src: item.video_src } : {}), ...(item.kind === "sambutan" || item.kind === "tamu" ? { design: welcomeDesign(item.design) } : {}), ...(item.kind === "ultah" ? { call: item.extra?.call ?? "", date: item.extra?.date ?? "", cut: item.extra?.cut === true } : {}) }));
  return {
    now: now.toISOString(), date, days, settings, look, countdown, version: BUILD,
    slides: slides.map(slide => ({ id: slide.id, title: slide.title, seconds: slide.seconds, src: imageSrc(slide.id) })),
    ...(playlist ? { playlist } : {}),
    ...(playlist?.some(item => item.kind === "timeline") ? { timeline } : {}),
    ...(playlist?.some(item => item.kind === "pengumuman") ? { notes } : {}),
    ...(playlist?.some(item => item.kind === "sambutan") ? { welcomes } : {}),
    ...(playlist?.some(item => item.kind === "foto_meeting") ? { meetingPhotos: meetingPhotos.map(photo => ({ ...photo, src: tvMeetingPhotoApi(photo.id) })) } : {}),
    ...(taken ? { takeover: taken.id } : {}),
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
export async function screenForKey(key: unknown, size?: { width: number; height: number }, now = new Date(), showing?: string): Promise<{ id: string; reloadAt: string | null; playsVideo: boolean } | null> {
  const byKey = looksLikeTvKey(key);
  if (!byKey && !looksLikeTvSlug(key)) return null;
  const client = createPrivilegedClient();
  type Found = { id: string; last_seen_at: string | null; last_width: number | null; last_height: number | null; reload_at?: string | null; last_item?: string | null; plays_video?: boolean | null };
  const find = (columns: string) => { const found = client.from("pw_tv_screens").select(columns); return (byKey ? found.eq("key_hash", hashTvKey(key)) : found.eq("slug", key)).maybeSingle(); };
  // With the playlist's migration a TV also has a reload request and says what it shows; before it, neither.
  let playlistReady = true;
  let { data: row, error } = await find("id,last_seen_at,last_width,last_height,reload_at,last_item,plays_video");
  // Before the migration that lets a TV pass over videos: the same without it.
  if (error && noSlug(error)) ({ data: row, error } = await find("id,last_seen_at,last_width,last_height,reload_at,last_item"));
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
  return { id: data.id, reloadAt: data.reload_at ?? null, playsVideo: data.plays_video !== false };
}
