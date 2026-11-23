import "server-only";
import { demoSample } from "@/lib/main-wam/demo-sample";
import { QUICK_REACTIONS, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import { UMUM, type FeedPhoto, type FeedView, type MosaicManifest, type MosaicTile, type SessionCount } from "@/lib/main-wam/momen/types";
import { samplePeople, samplePhotos } from "@/lib/main-wam/sample";
import type { MainWamContext } from "./gate";
import { demoOn } from "./demo";

/*
 * Mode demo's Momen (docs/main-wam/KONTRAK.md §12): the sample photos (gradient fill, no picture and no
 * outside address: `src` is null, so the screens draw their own fill) with reactions, and a part-filled
 * Mosaic. Used only while Admin has the demo on and there is no real photo; made-up names only.
 */

/** The sample pictures (public/wam/demo/foto-01..12.svg): made-up scenes, local files, no outside address. */
const demoPicture = (index: number) => `/wam/demo/foto-${String((index % 12) + 1).padStart(2, "0")}.svg`;

/** A count spread over the quick reactions (most on the first), none of them the viewer's. */
function spread(total: number): ReactionCount[] {
  const shares = [0.5, 0.25, 0.15, 0.1];
  const list = shares.map((share, index) => ({ emoji: QUICK_REACTIONS[index], count: Math.round(total * share), mine: false })).filter(entry => entry.count > 0);
  if (!list.length && total > 0) list.push({ emoji: QUICK_REACTIONS[0], count: total, mine: false });
  return list;
}

/** The sample photos as feed photos, newest first; the sample's Rani is the viewer (so "Fotoku" has photos). */
function samplePhotoList(context: MainWamContext): FeedPhoto[] {
  const me = context.viewer;
  return demoSample(samplePhotos).map((photo, index) => {
    const mine = photo.ownerId === samplePeople.rani.id;
    return {
      id: photo.id, owner: mine ? { id: me.id, name: me.name, photo: me.photo } : { id: photo.owner.id, name: photo.owner.name, photo: null },
      audience: "semua", sessionId: photo.sessionId, width: photo.width, height: photo.height, takenAt: photo.takenAt, visibleAt: photo.visibleAt, status: "tampil",
      reactions: spread(photo.reactions), seen: mine, mine, src: { kecil: demoPicture(index), besar: demoPicture(index) },
    } satisfies FeedPhoto;
  }).sort((a, b) => Date.parse(b.visibleAt) - Date.parse(a.visibleAt));
}

type DemoQuery = { view: FeedView; session: string | null; limit: number; cursor?: unknown; direction?: string };

/** One page of the sample feed, or null when Mode demo is off (the caller answers as it did). */
export async function demoFeed(context: MainWamContext, query: DemoQuery): Promise<{ items: FeedPhoto[]; next: string | null; total: number; migrated: true } | null> {
  if (!(await demoOn())) return null;
  // The sample is one page: a request for more (a cursor) or for newer ones finds none.
  if (query.cursor || query.direction === "newer") return { items: [], next: null, total: 0, migrated: true };
  const all = samplePhotoList(context)
    .filter(photo => (query.view === "saya" ? photo.mine : true))
    .filter(photo => (query.session === null ? true : query.session === UMUM ? photo.sessionId === null : photo.sessionId === query.session));
  return { items: all.slice(0, query.limit), next: null, total: all.length, migrated: true };
}

/** The sample's photos per session. */
export async function demoSessionCounts(context: MainWamContext, view: FeedView): Promise<SessionCount[] | null> {
  if (!(await demoOn())) return null;
  const counts = new Map<string | null, number>();
  for (const photo of samplePhotoList(context).filter(item => (view === "saya" ? item.mine : true))) counts.set(photo.sessionId, (counts.get(photo.sessionId) ?? 0) + 1);
  return [...counts.entries()].map(([sessionId, photos]) => ({ sessionId, photos }));
}

/** The Mosaic part-filled: about two thirds of the letters' cells, a few of them the viewer's. */
export async function demoMosaic(empty: MosaicManifest): Promise<MosaicManifest | null> {
  if (!(await demoOn())) return null;
  const tiles: MosaicTile[] = [];
  [...empty.cells].forEach((cell, index) => {
    if (cell === ".") return;
    // A fixed pattern, so the picture does not change between polls.
    if ((index * 7 + Math.floor(index / empty.columns) * 3) % 10 >= 7) return;
    tiles.push({ cell: index, id: `00000000-0000-4000-8800-${String(index).padStart(12, "0")}`, src: demoPicture(index), mine: index % 23 === 0 });
  });
  return {
    ...empty, version: `demo-${tiles.length}`, tiles, filled: tiles.length, people: Math.min(18, Math.ceil(tiles.length / 3)),
    mine: tiles.filter(tile => tile.mine).length, complete: false, migrated: true,
  };
}
