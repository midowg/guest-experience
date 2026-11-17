import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { after } from "next/server";
import { canReport, canSee } from "@/lib/main-wam/momen/access";
import { encodeCursor, MOMEN_AREA_MIGRATION, REPORT_THRESHOLD, REPORTS_PER_10_MINUTES, type FeedMode, type ReportInput } from "@/lib/main-wam/momen/filters";
import { groupLabel } from "@/lib/main-wam/momen/stack";
import { UMUM, type FeedPhoto, type FeedView, type SessionCount, type SessionFilter } from "@/lib/main-wam/momen/types";
import { PHOTO_AUDIENCES, PHOTO_STATUSES, type MainWamViewer, type MwPhoto } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { rateLimitSecret, ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { trySendMainWamNote } from "../notes";
import { mainWamPeople } from "../people";
import { viewAddress } from "./storage";

/*
 * Momen's reads and small writes (area B) on top of migration 202611200201: the stack and the
 * gallery (one query a page: hearts, mine, seen and the total come with the photos), the session
 * counts, "seen", hearts and reports. Who may see what is decided in the database
 * (mw_photos_for) and, for one photo, by canSee; the person's kelompok always comes from the
 * server (the viewer), never from the request.
 */

const db = () => createPrivilegedClient();
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback);
const waiting = () => new ServiceError(503, `Momen menunggu pembaruan sistem (migrasi ${MOMEN_AREA_MIGRATION}).`);

export type FeedRow = {
  id: string; owner_id: string; audience: string; group_id: string | null; session_id: string | null; width: number; height: number;
  taken_at: string; visible_at: string; status: string; file_key: string; thumb_key: string | null; hearts: number; hearted: boolean; seen: boolean; total: number | string;
};

/** Every member's kelompok as the cards say it ("Kelompok 2 · Kawi"), once kelompok are published. */
const ownerGroups = cache(async (published: boolean): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (!published) return out;
  const { data, error } = await db().from("mw_group_members").select("employee_id,mw_groups(number,name)").limit(2000);
  if (error) return out;
  for (const row of (data ?? []) as unknown as { employee_id: string; mw_groups: { number: number; name: string } | null }[]) {
    if (row.mw_groups) out.set(row.employee_id, groupLabel(row.mw_groups));
  }
  return out;
});

/** Rows of the feed as the app shows them: nama panggilan, the owner's kelompok, view addresses. */
export async function feedPhotos(rows: FeedRow[], context: MainWamContext, now = Date.now()): Promise<FeedPhoto[]> {
  if (!rows.length) return [];
  const [people, groups] = await Promise.all([mainWamPeople(), ownerGroups(context.settings.groupsPublished)]);
  return Promise.all(rows.map(async row => {
    const person = people.get(row.owner_id);
    const [kecil, besar] = await Promise.all([viewAddress(row.thumb_key ?? row.file_key, now), viewAddress(row.file_key, now)]);
    return {
      id: row.id, owner: { id: row.owner_id, name: person?.name ?? "Rekan", photo: person?.photo ?? null },
      ownerGroup: groups.get(row.owner_id) ?? person?.department ?? "",
      audience: oneOf(PHOTO_AUDIENCES, row.audience, "semua"), sessionId: row.session_id, width: row.width, height: row.height,
      takenAt: row.taken_at, visibleAt: row.visible_at, status: oneOf(PHOTO_STATUSES, row.status, "tampil"),
      hearts: Number(row.hearts) || 0, hearted: !!row.hearted, seen: !!row.seen, mine: row.owner_id === context.viewer.id, src: { kecil, besar },
    } satisfies FeedPhoto;
  }));
}

export type FeedQuery = {
  view: FeedView;
  session: SessionFilter;
  /** baru: the stack's unseen photos; semua: everything in the view. */
  mode: FeedMode;
  cursor?: { at: string; id: string } | null;
  direction?: "older" | "older_incl" | "newer";
  limit: number;
};

/** One page of a view; empty with `migrated: false` before migration 202611200201. */
export async function listFeed(context: MainWamContext, query: FeedQuery): Promise<{ items: FeedPhoto[]; next: string | null; total: number; migrated: boolean }> {
  const group = context.viewer.group?.id ?? null;
  if (query.view === "kelompok" && !group) return { items: [], next: null, total: 0, migrated: true };
  const direction = query.direction ?? "older";
  const { data, error } = await db().rpc("mw_photo_feed", {
    p_viewer: context.viewer.id, p_group: group, p_view: query.view,
    p_session: query.session && query.session !== UMUM ? query.session : null, p_umum: query.session === UMUM, p_unseen: query.mode === "baru",
    p_cursor_at: query.cursor?.at ?? null, p_cursor_id: query.cursor?.id ?? null, p_direction: direction, p_limit: query.limit,
  });
  if (error) { if (mwMissing(error)) return { items: [], next: null, total: 0, migrated: false }; databaseError({ message: error.message ?? "", code: error.code }); }
  const rows = (data ?? []) as FeedRow[];
  const items = await feedPhotos(rows, context);
  const last = rows.at(-1);
  const next = direction !== "newer" && last && rows.length >= query.limit ? encodeCursor(query.mode, last.visible_at, last.id) : null;
  return { items, next, total: Number(rows[0]?.total ?? 0), migrated: true };
}

/** "Saring sesi": photos per session of a view (null = Umum), only sessions that have any. */
export async function sessionCounts(context: MainWamContext, view: FeedView): Promise<SessionCount[] | null> {
  const group = context.viewer.group?.id ?? null;
  if (view === "kelompok" && !group) return [];
  const { data, error } = await db().rpc("mw_photo_session_counts", { p_viewer: context.viewer.id, p_group: group, p_view: view });
  if (error) { if (mwMissing(error)) return null; databaseError({ message: error.message ?? "", code: error.code }); }
  return ((data ?? []) as { session_id: string | null; photos: number | string }[]).map(row => ({ sessionId: row.session_id, photos: Number(row.photos) || 0 })).filter(row => row.photos > 0);
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

/** Suka / batal suka; answers the photo's hearts now. */
export async function setHeart(viewer: MainWamViewer, id: string, on: boolean): Promise<{ hearts: number; hearted: boolean }> {
  const photo = await visiblePhoto(viewer, id);
  const table = db().from("mw_photo_hearts");
  const { error } = on
    ? await table.upsert({ photo_id: photo.id, employee_id: viewer.id }, { onConflict: "photo_id,employee_id", ignoreDuplicates: true })
    : await table.delete().eq("photo_id", photo.id).eq("employee_id", viewer.id);
  if (error) mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  const { count, error: countError } = await db().from("mw_photo_hearts").select("photo_id", { count: "exact", head: true }).eq("photo_id", photo.id);
  if (countError) mwFail(countError as DbError, MOMEN_AREA_MIGRATION);
  return { hearts: count ?? 0, hearted: on };
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

/** Beranda's card: how many photos for everyone are new to the person, and the latest three. */
export async function newForMe(context: MainWamContext): Promise<{ unseen: number; total: number; latest: FeedPhoto[]; migrated: boolean }> {
  const baru = await listFeed(context, { view: "semua", session: null, mode: "baru", limit: 3 });
  if (!baru.migrated) return { unseen: 0, total: 0, latest: [], migrated: false };
  if (baru.total > 0) return { unseen: baru.total, total: baru.total, latest: baru.items, migrated: true };
  const all = await listFeed(context, { view: "semua", session: null, mode: "semua", limit: 3 });
  return { unseen: 0, total: all.total, latest: all.items, migrated: true };
}

/** Detail sesi: how many photos for everyone a session has ("Foto sesi ini (24)"). */
export async function sessionPhotoCount(context: MainWamContext, sessionId: string): Promise<number> {
  const counts = await sessionCounts(context, "semua").catch(() => null);
  return counts?.find(count => count.sessionId === sessionId)?.photos ?? 0;
}
