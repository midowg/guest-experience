import { canSee } from "./access";
import { isUuid, GALLERY_PAGE } from "./filters";
import type { FeedPhoto } from "./types";
import type { MainWamViewer } from "../types";

/*
 * Galeri, tab Ditandai: the photos of other people that tag the viewer (mw_photo_tags, written by Misi's proof
 * photos). The same access rules as every Momen photo (canSee: status "tampil", past its 5 seconds, for everyone
 * or the viewer's kelompok), never the viewer's own photos (those are Fotoku), and nothing the viewer reported.
 * Pure: the server reads the rows, this decides what is shown and in which pages (newest first, 30 a page).
 */

/** A photo of someone else with the people tagged on it besides the viewer and its owner ("Bersama Sari, Dewi"). */
export type TaggedPhoto = FeedPhoto & { /** Nama panggilan of the others tagged on it (never the viewer, never the owner). */ withNames: string[] };

export type TaggedAnswer = { items: TaggedPhoto[]; next: string | null; total: number | null; migrated: boolean };

/** The columns of a photo the list needs (as mw_photos stores them). */
export type TaggedPhotoRow = {
  id: string; owner_id: string; audience: string; group_id: string | null; session_id: string | null; width: number; height: number;
  taken_at: string; visible_at: string; status: string; file_key: string; thumb_key: string | null;
};

type Viewer = Pick<MainWamViewer, "id" | "roles" | "group">;

/** The most tags of one person the list reads (a person is tagged in a handful of photos; this is a ceiling, not a page). */
export const TAGGED_CAP = 500;

const at = (row: Pick<TaggedPhotoRow, "visible_at">) => Date.parse(row.visible_at) || 0;
/** Newest first, ties by id (the cursor follows the same order). */
const newest = (a: TaggedPhotoRow, b: TaggedPhotoRow) => at(b) - at(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** What the viewer may see among the photos they are tagged in, newest first. */
export function visibleTagged(viewer: Viewer, rows: readonly TaggedPhotoRow[], reportedByViewer: ReadonlySet<string>, now = new Date()): TaggedPhotoRow[] {
  return rows
    .filter(row => row.owner_id !== viewer.id && !reportedByViewer.has(row.id) && canSee(viewer, {
      ownerId: row.owner_id, audience: row.audience === "kelompok" ? "kelompok" : "semua", groupId: row.group_id, status: row.status as "tampil", visibleAt: row.visible_at,
    }, now))
    .sort(newest);
}

/** "t~<visible_at>~<id>": the last photo of a page of Ditandai. */
export function encodeTaggedCursor(row: Pick<TaggedPhotoRow, "visible_at" | "id">): string {
  return `t~${row.visible_at}~${row.id}`;
}

export type TaggedCursor = { at: string; id: string };

/** The cursor of a request: null for none, `false` for one that is not ours (a 422). */
export function decodeTaggedCursor(raw: string | null | undefined): TaggedCursor | null | false {
  if (!raw) return null;
  if (raw.length > 120) return false;
  const [tag, at, id] = raw.split("~");
  if (tag !== "t" || !at || !Number.isFinite(Date.parse(at)) || !isUuid(id)) return false;
  return { at, id: id.toLowerCase() };
}

/** One page after the cursor (the first page without one), and the cursor of the next, null at the end. */
export function taggedPage(sorted: readonly TaggedPhotoRow[], cursor: TaggedCursor | null, limit = GALLERY_PAGE): { rows: TaggedPhotoRow[]; next: string | null } {
  const after = cursor ? sorted.filter(row => newest({ visible_at: cursor.at, id: cursor.id } as TaggedPhotoRow, row) < 0) : sorted;
  const rows = after.slice(0, limit);
  const last = rows.at(-1);
  return { rows, next: last && after.length > rows.length ? encodeTaggedCursor(last) : null };
}

/** "Bersama Sari, Dewi" without the language: the names the line is made of (the viewer's own word comes first, "kamu"). */
export function togetherNames(you: string, withNames: readonly string[]): string {
  return [you, ...withNames].join(", ");
}
