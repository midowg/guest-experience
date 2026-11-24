import "server-only";
import { GALLERY_PAGE } from "@/lib/main-wam/momen/filters";
import { taggedPage, TAGGED_CAP, visibleTagged, type TaggedAnswer, type TaggedCursor, type TaggedPhoto, type TaggedPhotoRow } from "@/lib/main-wam/momen/tagged";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { tagsOfPhotos } from "../misi/tags";
import { feedPhotos } from "./feed";

/*
 * Galeri, tab Ditandai: the photos of others that tag the person (mw_photo_tags, from migration 202611300001). It reads
 * the person's own tags, then those photos, and keeps what Momen lets them see (visibleTagged: the same rules as the feed).
 * Before the tags table exists the answer is an empty list, not an error (the tab shows "Belum ada foto yang menandaimu").
 */

const db = () => createPrivilegedClient();
const COLUMNS = "id,owner_id,audience,group_id,session_id,width,height,taken_at,visible_at,status,file_key,thumb_key";
const CHUNK = 100;

const chunks = <T>(list: readonly T[], size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));

const NONE: TaggedAnswer = { items: [], next: null, total: 0, migrated: false };

/** One page of Ditandai (newest first, 30 a page); `total` is how many the person has, on the first page only. */
export async function listTagged(context: MainWamContext, input: { cursor?: TaggedCursor | null; limit?: number; now?: Date } = {}): Promise<TaggedAnswer> {
  const { viewer } = context;
  const now = input.now ?? new Date();
  const mine = await db().from("mw_photo_tags").select("photo_id,created_at").eq("employee_id", viewer.id).is("removed_at", null).order("created_at", { ascending: false }).limit(TAGGED_CAP);
  if (mine.error) { if (mwMissing(mine.error)) return NONE; mwFail(mine.error as DbError); }
  const ids = [...new Set(((mine.data ?? []) as { photo_id: string }[]).map(row => row.photo_id))];
  if (!ids.length) return { items: [], next: null, total: input.cursor ? null : 0, migrated: true };

  const photoReads = await Promise.all(chunks(ids).map(part => db().from("mw_photos").select(COLUMNS).in("id", part).eq("status", "tampil").neq("owner_id", viewer.id)));
  const failed = photoReads.find(read => read.error);
  if (failed?.error) { if (mwMissing(failed.error)) return NONE; mwFail(failed.error as DbError); }
  const rows = photoReads.flatMap(read => (read.data ?? []) as TaggedPhotoRow[]);

  // A photo the person reported stays hidden for them (as in the feed); a trouble reading the reports does not hide the list.
  const reported = new Set<string>();
  try {
    const reads = await Promise.all(chunks(rows.map(row => row.id)).map(part => db().from("mw_photo_reports").select("photo_id").eq("reporter_id", viewer.id).is("unhidden_at", null).in("photo_id", part)));
    for (const read of reads) for (const row of (read.data ?? []) as { photo_id: string }[]) reported.add(row.photo_id);
  } catch { /* the list still shows */ }

  const seen = visibleTagged(viewer, rows, reported, now);
  const page = taggedPage(seen, input.cursor ?? null, input.limit ?? GALLERY_PAGE);
  if (!page.rows.length) return { items: [], next: null, total: input.cursor ? null : seen.length, migrated: true };

  const [photos, tags] = await Promise.all([
    feedPhotos(page.rows.map(row => ({ ...row, reactions: [], seen: true, total: seen.length })), context, now.getTime()),
    tagsOfPhotos(page.rows.map(row => row.id)).catch(() => new Map<string, { id: string; name: string }[]>()),
  ]);
  const items: TaggedPhoto[] = photos.map(photo => ({
    ...photo, withNames: (tags.get(photo.id) ?? []).filter(tag => tag.id !== viewer.id && tag.id !== photo.owner.id).map(tag => tag.name),
  }));
  return { items, next: page.next, total: input.cursor ? null : seen.length, migrated: true };
}
