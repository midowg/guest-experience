import "server-only";
import { createHmac } from "node:crypto";
import { after } from "next/server";
import { canReport, canSee } from "@/lib/main-wam/momen/access";
import { isReactionEmoji, parseReactions, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import { encodeCursor, MOMEN_AREA_MIGRATION, REPORT_THRESHOLD, REPORTS_PER_10_MINUTES, type FeedMode, type ReportInput } from "@/lib/main-wam/momen/filters";
import { UMUM, type FeedPhoto, type PhotoDetail, type Reactor, type FeedView, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import { PHOTO_AUDIENCES, PHOTO_STATUSES, type MainWamViewer, type MwPhoto } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { rateLimitSecret, ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, mwWaiting, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { trySendMainWamNote } from "../notes";
import { demoFeed, demoSessionCounts } from "../demo-momen";
import { mainWamPeople } from "../people";
import { sessionById } from "../read";
import { viewAddress } from "./storage";

/*
 * Momen's reads and small writes (area B) on top of migration 202611200201: the stack and the
 * gallery (one query a page: reactions, mine, seen and the total come with the photos), the session
 * counts, "seen", reactions and reports. Who may see what is decided in the database
 * (mw_photos_for) and, for one photo, by canSee; the person's kelompok always comes from the
 * server (the viewer), never from the request.
 */

const db = () => createPrivilegedClient();
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback);
/** Before migration 202611200201: a plain 503 for the person; the migration's name goes to the server log only (audit R13). */
const waiting = () => mwWaiting(MOMEN_AREA_MIGRATION);
/** The feed answers `reactions` from this migration on; before it the feed itself is "waiting" (audit R13: the name goes to the log only). */
const REACTIONS_MIGRATION = "202611210001_main_wam_reactions.sql";
const REACTORS_MIGRATION = "202611230001_main_wam_reactors.sql";

export type FeedRow = {
  id: string; owner_id: string; audience: string; group_id: string | null; session_id: string | null; width: number; height: number;
  taken_at: string; visible_at: string; status: string; file_key: string; thumb_key: string | null; reactions: unknown; seen: boolean; total: number | string;
};

/**
 * The last three people who reacted to each of these photos (never the viewer: the screen adds them itself), for the
 * avatars on a photo. One narrow query for the page; any trouble (the reactions table not there yet) is an empty answer.
 */
async function reactorPreviews(ids: string[], viewerId: string): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  try {
    const { data, error } = await db().from("mw_photo_reactions").select("photo_id,employee_id,created_at").in("photo_id", ids).neq("employee_id", viewerId)
      .order("created_at", { ascending: false }).limit(ids.length * 12);
    if (error) return found;
    for (const row of (data ?? []) as { photo_id: string; employee_id: string }[]) {
      const list = found.get(row.photo_id) ?? [];
      if (list.length < 3) { list.push(row.employee_id); found.set(row.photo_id, list); }
    }
  } catch { /* no avatars, the count still shows */ }
  return found;
}

/** Rows of the feed as the app shows them: nama panggilan, view addresses. */
export async function feedPhotos(rows: FeedRow[], context: MainWamContext, now = Date.now()): Promise<FeedPhoto[]> {
  if (!rows.length) return [];
  const [people, previews] = await Promise.all([mainWamPeople(), reactorPreviews(rows.map(row => row.id), context.viewer.id)]);
  return Promise.all(rows.map(async row => {
    const person = people.get(row.owner_id);
    // The small copy keeps its address for the hour (the grid stays cached); the large one closes within 15 minutes (audit L5).
    const [kecil, besar] = await Promise.all([row.thumb_key ? viewAddress(row.thumb_key, "kecil", now) : viewAddress(row.file_key, "besar", now), viewAddress(row.file_key, "besar", now)]);
    return {
      id: row.id, owner: { id: row.owner_id, name: person?.name ?? "Rekan", photo: person?.photo ?? null },
      audience: oneOf(PHOTO_AUDIENCES, row.audience, "semua"), sessionId: row.session_id, width: row.width, height: row.height,
      takenAt: row.taken_at, visibleAt: row.visible_at, status: oneOf(PHOTO_STATUSES, row.status, "tampil"),
      reactions: parseReactions(row.reactions),
      reactors: (previews.get(row.id) ?? []).map(id => ({ id, name: people.get(id)?.name ?? "Rekan", photo: people.get(id)?.photo ?? null })),
      seen: !!row.seen, mine: row.owner_id === context.viewer.id, src: { kecil, besar },
    } satisfies FeedPhoto;
  }));
}

export type FeedQuery = {
  view: FeedView;
  session: SessionFilter;
  /** baru: the stack (only the photos the person has not seen yet, their own unseen one first); semua: everything in the view, newest first. */
  mode: FeedMode;
  /** `rest`: the cursor is still in the stack's own run (the person's own unseen photo, which comes first). */
  cursor?: { at: string; id: string; rest?: boolean } | null;
  direction?: "older" | "older_incl" | "newer";
  limit: number;
};

/** One page of a view; empty with `migrated: false` before migration 202611200201. */
export async function listFeed(context: MainWamContext, query: FeedQuery): Promise<{ items: FeedPhoto[]; next: string | null; total: number; migrated: boolean }> {
  const group = context.viewer.group?.id ?? null;
  const direction = query.direction ?? "older";
  const { data, error } = await db().rpc("mw_photo_feed", {
    p_viewer: context.viewer.id, p_group: group, p_view: query.view,
    p_session: query.session && query.session !== UMUM ? query.session : null, p_umum: query.session === UMUM, p_unseen: query.mode === "baru",
    p_cursor_at: query.cursor?.at ?? null, p_cursor_id: query.cursor?.id ?? null, p_cursor_rest: query.cursor ? !!query.cursor.rest : null, p_direction: direction, p_limit: query.limit,
  });
  if (error) { if (mwMissing(error)) return (await demoFeed(context, query)) ?? { items: [], next: null, total: 0, migrated: false }; databaseError({ message: error.message ?? "", code: error.code }); }
  const rows = (data ?? []) as FeedRow[];
  // Mode demo: the sample photos while there is none (demo-momen.ts); null, and nothing changes, when the demo is off.
  if (!rows.length && !query.cursor) { const demo = await demoFeed(context, query); if (demo) return demo; }
  const items = await feedPhotos(rows, context);
  const last = rows.at(-1);
  const next = direction !== "newer" && last && rows.length >= query.limit ? encodeCursor(query.mode, last.visible_at, last.id, last.owner_id === context.viewer.id) : null;
  return { items, next, total: Number(rows[0]?.total ?? 0), migrated: true };
}

/** "Saring sesi": photos per session of a view (null = Umum), only sessions that have any. */
export async function sessionCounts(context: MainWamContext, view: FeedView): Promise<SessionCount[] | null> {
  const group = context.viewer.group?.id ?? null;
  const { data, error } = await db().rpc("mw_photo_session_counts", { p_viewer: context.viewer.id, p_group: group, p_view: view });
  if (error) { if (mwMissing(error)) return await demoSessionCounts(context, view); databaseError({ message: error.message ?? "", code: error.code }); }
  const real = ((data ?? []) as { session_id: string | null; photos: number | string }[]).map(row => ({ sessionId: row.session_id, photos: Number(row.photos) || 0 })).filter(row => row.photos > 0);
  return real.length ? real : (await demoSessionCounts(context, view)) ?? real;
}

/* ── One photo ────────────────────────────────────────────────────────────────────────────────── */

export type PhotoRecord = MwPhoto & { fileKey: string; thumbKey: string | null; tileKey: string | null };
const RECORD_COLUMNS = "id,owner_id,audience,group_id,session_id,width,height,taken_at,created_at,visible_at,status,file_key,thumb_key,tile_key";

/** One photo with its files, any status; null when there is none. */
export async function photoRecord(id: string): Promise<PhotoRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("mw_photos").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  if (error) { if (mwMissing(error)) throw waiting(); databaseError({ message: error.message ?? "", code: error.code }); }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id), ownerId: String(row.owner_id), audience: oneOf(PHOTO_AUDIENCES, row.audience, "semua"), groupId: (row.group_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null, width: Number(row.width), height: Number(row.height), takenAt: String(row.taken_at), createdAt: String(row.created_at),
    visibleAt: String(row.visible_at), status: oneOf(PHOTO_STATUSES, row.status, "tampil"),
    fileKey: String(row.file_key), thumbKey: (row.thumb_key as string | null) ?? null, tileKey: (row.tile_key as string | null) ?? null,
  };
}

const notFound = () => new ServiceError(404, "Foto tidak ditemukan.");

/** A photo the person may see, or 404 (also when it exists but is not for them: nothing leaks). */
export async function visiblePhoto(viewer: MainWamViewer, id: string): Promise<PhotoRecord> {
  const photo = await photoRecord(id);
  if (!photo || !canSee(viewer, photo)) throw notFound();
  return photo;
}

/**
 * What the viewer needs of one photo (a Mozaik tile carries only its small picture): the name Momen shows on it, its
 * session and time. For a photo the person may see only (canSee, the same rule as the file and the reactions); anything
 * else is a 404, so nothing leaks about a hidden, reported or not-yet-shown photo.
 */
export async function photoDetail(viewer: MainWamViewer, id: string): Promise<PhotoDetail> {
  const photo = await visiblePhoto(viewer, id);
  const [people, session] = await Promise.all([mainWamPeople(), photo.sessionId ? sessionById(photo.sessionId).catch(() => null) : null]);
  return { id: photo.id, owner: { name: people.get(photo.ownerId)?.name ?? "Rekan" }, mine: photo.ownerId === viewer.id, sessionTitle: session?.title ?? null, takenAt: photo.takenAt };
}

/** Marks photos seen by the person (the stack's "baru"); unknown ids are ignored. */
export async function markSeen(viewer: MainWamViewer, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map(id => id.toLowerCase()))];
  const { data, error } = await db().from("mw_photos").select("id").in("id", unique);
  if (error) mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  const known = (data ?? []).map(row => row.id as string);
  if (!known.length) return 0;
  const { error: seenError } = await db().from("mw_photo_seen").upsert(known.map(photo_id => ({ photo_id, employee_id: viewer.id })), { onConflict: "employee_id,photo_id", ignoreDuplicates: true });
  if (seenError) mwFail(seenError as DbError, MOMEN_AREA_MIGRATION);
  return known.length;
}

/**
 * Reacts to a photo with `emoji` (from the app's list: the route checked it), or takes the reaction back (null);
 * answers the photo's reactions now. The person must see the photo, and it is never their own (the database
 * checks both again: the kelompok comes from the server).
 */
export async function setReaction(viewer: MainWamViewer, id: string, emoji: string | null): Promise<{ reactions: ReactionCount[] }> {
  const photo = await visiblePhoto(viewer, id);
  if (emoji && photo.ownerId === viewer.id) throw new ServiceError(409, "Ini fotomu sendiri. Reaksi untuk foto rekan.");
  const { data, error } = await db().rpc("mw_photo_react", { p_photo: photo.id, p_viewer: viewer.id, p_group: viewer.group?.id ?? null, p_emoji: emoji });
  if (error) {
    if (error.message === "MW_PHOTO_NOT_FOUND") throw notFound();
    if (error.message === "MW_PHOTO_OWN") throw new ServiceError(409, "Ini fotomu sendiri. Reaksi untuk foto rekan.");
    mwFail(error as DbError, REACTIONS_MIGRATION);
  }
  return { reactions: parseReactions(data) };
}

/** The most people a list of who reacted holds (a photo has at most as many reactions as there are people at the event). */
const REACTORS_MAX = 600;
/**
 * Who reacted with what on a photo the person sees (the same 404 as every other single-photo call: hidden, in its
 * 5 seconds, not for them, unknown). The database checks it again; the names are the nama panggilan; the person's
 * own reaction is marked. Newest first.
 */
export async function photoReactors(viewer: MainWamViewer, id: string): Promise<{ reactors: Reactor[] }> {
  const photo = await visiblePhoto(viewer, id);
  const { data, error } = await db().rpc("mw_photo_reactors", { p_photo: photo.id, p_viewer: viewer.id });
  if (error) mwFail(error as DbError, REACTORS_MIGRATION);
  const people = await mainWamPeople();
  const reactors: Reactor[] = [];
  for (const row of (data ?? []) as { employee_id: string; emoji: string; created_at: string }[]) {
    if (!isReactionEmoji(row.emoji) || reactors.length >= REACTORS_MAX) continue;
    const person = people.get(row.employee_id);
    reactors.push({ person: { id: row.employee_id, name: person?.name ?? "Rekan", photo: person?.photo ?? null, department: person?.department ?? "" }, emoji: row.emoji, mine: row.employee_id === viewer.id, at: row.created_at });
  }
  return { reactors };
}

/** A limit per person (not per network: at the venue everyone shares one address). */
export async function personLimit(scope: string, personId: string, limit: number, windowSeconds = 600): Promise<void> {
  const key = createHmac("sha256", rateLimitSecret()).update(`${scope}\0person\0${personId}`).digest("hex");
  const { data, error } = await db().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu sering dalam waktu singkat. Coba lagi beberapa menit lagi.");
}

/**
 * Laporkan foto (M04). The photo is hidden for the reporter at once; at the third reporter it is
 * hidden for everyone and goes to panitia (K08), and its owner is told (bell + phone, not in quiet
 * hours), without who reported it.
 */
export async function reportPhoto(context: MainWamContext, id: string, input: ReportInput): Promise<{ hiddenForMe: true }> {
  const { viewer } = context;
  const photo = await photoRecord(id);
  if (!photo || !canSee(viewer, photo)) throw notFound();
  if (!canReport(viewer, photo)) throw new ServiceError(409, "Ini fotomu sendiri. Hapus lewat Pilihan foto.");
  await personLimit("mw-foto-lapor", viewer.id, REPORTS_PER_10_MINUTES);
  const { data, error } = await db().rpc("mw_photo_report", { p_photo: photo.id, p_reporter: viewer.id, p_reason: input.reason, p_note: input.note, p_threshold: REPORT_THRESHOLD });
  if (error) {
    if (error.message === "MW_PHOTO_NOT_FOUND") throw notFound();
    if (error.message === "MW_PHOTO_OWN") throw new ServiceError(409, "Ini fotomu sendiri. Hapus lewat Pilihan foto.");
    if (error.code === "23514") throw new ServiceError(422, "Tulis catatan untuk alasan Lainnya.");
    mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  }
  const result = ((data ?? []) as { hidden: boolean; owner_id: string }[])[0];
  if (result?.hidden) {
    const notify = () => trySendMainWamNote({
      kind: "momen", title: "Fotomu disembunyikan sementara", body: "Ada rekan yang melaporkan fotomu. Panitia akan meninjaunya.",
      to: { people: [result.owner_id], label: "Pemilik foto" }, link: mainWamPath.gallery({ lihat: "saya" }), by: null, photoHidden: true, tag: `foto-${photo.id}`,
    });
    try { after(notify); } catch { await notify(); }
  }
  return { hiddenForMe: true };
}

/** "Tampilkan lagi" for the reporter (the report stays for panitia). */
export async function unhideReported(viewer: MainWamViewer, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const { data, error } = await db().from("mw_photo_reports").update({ unhidden_at: new Date().toISOString() }).eq("photo_id", id).eq("reporter_id", viewer.id).select("photo_id");
  if (error) mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  if (!data?.length) throw notFound();
}

/* ── For other screens (slots) ────────────────────────────────────────────────────────────────── */

/**
 * How many photos of others the person has not seen ("N foto baru"; never their own). From migration 202611240001; before it the
 * stack's own total (the old first run) answers, which never counted the person's own photos either.
 */
async function othersUnseen(context: MainWamContext, fallback: number): Promise<number> {
  const { data, error } = await db().rpc("mw_photo_unseen_count", { p_viewer: context.viewer.id, p_group: context.viewer.group?.id ?? null });
  if (error) return fallback;
  return Number(data) || 0;
}

/** Beranda's card: how many photos of others are new to the person, and the latest three. */
export async function newForMe(context: MainWamContext): Promise<{ unseen: number; total: number; latest: FeedPhoto[]; migrated: boolean }> {
  // A few more than three: the person's own unseen photo leads the stack but is not "new" to them.
  const baru = await listFeed(context, { view: "semua", session: null, mode: "baru", limit: 6 });
  if (!baru.migrated) return { unseen: 0, total: 0, latest: [], migrated: false };
  const others = baru.items.filter(item => !item.mine && !item.seen);
  // The count is the whole number; the page only shows the first few (and demo photos have no row to count).
  const unseen = others.length ? Math.max(others.length, await othersUnseen(context, others.length)) : 0;
  if (unseen > 0) return { unseen, total: unseen, latest: others.slice(0, 3), migrated: true };
  const all = await listFeed(context, { view: "semua", session: null, mode: "semua", limit: 3 });
  return { unseen: 0, total: all.total, latest: all.items, migrated: true };
}

/** Detail sesi: how many photos for everyone a session has ("Foto sesi ini (24)"). */
export async function sessionPhotoCount(context: MainWamContext, sessionId: string): Promise<number> {
  const counts = await sessionCounts(context, "semua").catch(() => null);
  return counts?.find(count => count.sessionId === sessionId)?.photos ?? 0;
}
