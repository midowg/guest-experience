import "server-only";
import { createHash } from "node:crypto";
import { cellOrder, letterCells, maskCells, mosaicText } from "@/lib/main-wam/momen/mosaic";
import type { MosaicManifest, MosaicTile } from "@/lib/main-wam/momen/types";
import type { MainWamSettings } from "@/lib/main-wam/types";
import { databaseError } from "../../http";
import { readObject } from "../../r2";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { viewAddress, viewWindow } from "./storage";

/*
 * The Mozaik's manifest (M06, RISET §9): the grid, which cell belongs to the letters, and which
 * photo fills which cell. The phone polls it every 45 seconds and the venue TV will too (same shape;
 * the TV needs its own sign-in, see the report): it answers with an ETag checked before the manifest
 * is built (mosaicHead), so an unchanged mosaic costs two small queries and a 304. Before it answers
 * it places new photos (for everyone, shown, at least 5 minutes old) into empty cells, in a fixed
 * seeded order (mw_mosaic_place), so a placed photo never moves.
 */

const db = () => createPrivilegedClient();
/** RISET §8/§9: a photo shows on the big screens only after 5 minutes (time to report it). */
export const MOSAIC_MIN_AGE_SECONDS = 5 * 60;
/** Placing is cheap but needs a lock: at most once every 20 seconds per server. */
const PLACE_EVERY_MS = 20_000;
let lastPlaced = 0;

/** The cells of the theme's picture ("Huruf Mozaik"), or of the event's name; cached per picture and grid. */
const masks = new Map<string, string>();
export async function mosaicCells(settings: MainWamSettings): Promise<string> {
  const { columns, rows } = settings.moduleConfig.mozaik;
  const image = settings.theme.images.mosaic;
  const text = mosaicText(settings.event.name);
  if (!image) return letterCells(columns, rows, text);
  const cacheKey = `${image.key}:${image.version}:${columns}x${rows}`;
  const cached = masks.get(cacheKey);
  if (cached) return cached;
  let cells: string | null = null;
  try {
    const file = await readObject(image.key);
    if (file) {
      const sharp = (await import("sharp")).default;
      const source = sharp(Buffer.from(file.bytes));
      const stats = await source.stats();
      // A picture with transparency: inside = opaque. Without: inside = dark (on a light ground).
      const transparent = stats.channels.length === 4 && stats.channels[3].min < 255;
      const raw = await sharp(Buffer.from(file.bytes)).resize(columns, rows, { fit: "contain", background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 255, g: 255, b: 255, alpha: 1 } })
        .ensureAlpha().raw().toBuffer();
      const inside: boolean[] = [];
      for (let index = 0; index < columns * rows; index++) {
        const [r, g, b, a] = [raw[index * 4], raw[index * 4 + 1], raw[index * 4 + 2], raw[index * 4 + 3]];
        inside.push(transparent ? a >= 128 : 0.2126 * r + 0.7152 * g + 0.0722 * b < 128);
      }
      if (inside.some(Boolean)) cells = maskCells(inside);
    }
  } catch { cells = null; }
  const result = cells ?? letterCells(columns, rows, text);
  masks.set(cacheKey, result);
  return result;
}

type TileRow = { tile: number; photo_id: string; mw_photos: { owner_id: string; status: string; tile_key: string | null } | null };

/** What the cells are drawn from (the picture and its version, or the text) and the grid: the cells follow from it. */
export function cellsSource(settings: MainWamSettings): string {
  const { columns, rows } = settings.moduleConfig.mozaik;
  const image = settings.theme.images.mosaic;
  return `${image ? `gambar:${image.key}:${image.version}` : `teks:${mosaicText(settings.event.name)}`}:${columns}x${rows}`;
}

/**
 * The manifest's version, for the ETag: what the cells are drawn from, the tiles shown (cell, photo;
 * a fingerprint the database makes in one small query), the day the tiles' view addresses are
 * signed in (storage.ts VIEW_POLICY.ubin), and the person ("mine"). Unchanged between polls while
 * the mosaic is the same, also across the hour (audit R3), so the phone and the TV keep their tiles.
 */
export function mosaicVersionOf(input: { cells: string; tiles: string; viewerId: string; now: number }): string {
  return createHash("sha256").update(`${viewWindow("ubin", input.now).signedAt}|${input.cells}|${input.tiles}|${input.viewerId}`).digest("hex").slice(0, 24);
}

export type MosaicHead = { version: string; migrated: boolean };
const NOT_MIGRATED: MosaicHead = { version: "kosong", migrated: false };

/**
 * Step one of every poll, before anything heavy (audit R3): places new photos (at most every 20
 * seconds per server) and answers the version. No picture is read and no address is signed here;
 * an unchanged mosaic is answered 304 from this alone.
 */
export async function mosaicHead(context: MainWamContext, now = new Date()): Promise<MosaicHead> {
  const { settings, viewer } = context;
  const { columns, rows } = settings.moduleConfig.mozaik;
  if (Date.now() - lastPlaced > PLACE_EVERY_MS) {
    const { error } = await db().rpc("mw_mosaic_place", { p_order: cellOrder(columns, rows, mosaicText(settings.event.name)), p_min_age_seconds: MOSAIC_MIN_AGE_SECONDS });
    if (error) { if (mwMissing(error)) return NOT_MIGRATED; databaseError({ message: error.message ?? "", code: error.code }); }
    lastPlaced = Date.now();
  }
  const { data, error } = await db().rpc("mw_mosaic_version", { p_total: columns * rows });
  if (error) { if (mwMissing(error)) return NOT_MIGRATED; databaseError({ message: error.message ?? "", code: error.code }); }
  return { version: mosaicVersionOf({ cells: cellsSource(settings), tiles: String(data ?? ""), viewerId: viewer.id, now: now.getTime() }), migrated: true };
}

/**
 * The manifest for one person ("mine" marks their tiles); `migrated: false` before 202611200201.
 * `head` is the version step one answered (the ETag sent with this manifest); tiles placed in
 * between show now and change the version of the next poll.
 */
export async function mosaicManifest(context: MainWamContext, now = new Date(), given?: MosaicHead): Promise<MosaicManifest> {
  const { settings, viewer } = context;
  const { columns, rows } = settings.moduleConfig.mozaik;
  const total = columns * rows;
  const head = given ?? await mosaicHead(context, now);
  const cells = await mosaicCells(settings);
  const empty: MosaicManifest = { version: NOT_MIGRATED.version, columns, rows, cells, tiles: [], filled: 0, total, people: 0, mine: 0, updatedAt: now.toISOString(), complete: false, migrated: false };
  if (!head.migrated) return empty;
  const { data, error } = await db().from("mw_mosaic_tiles").select("tile,photo_id,mw_photos!inner(owner_id,status,tile_key)")
    .eq("mw_photos.status", "tampil").lt("tile", total).order("tile").limit(6400);
  if (error) { if (mwMissing(error)) return empty; databaseError({ message: error.message ?? "", code: error.code }); }
  const placed = ((data ?? []) as unknown as TileRow[]).filter(row => row.mw_photos?.tile_key);
  const owners = new Set(placed.map(row => row.mw_photos!.owner_id));
  const tiles: MosaicTile[] = await Promise.all(placed.map(async row => ({
    cell: row.tile, id: row.photo_id, src: await viewAddress(row.mw_photos!.tile_key, "ubin", now.getTime()), mine: row.mw_photos!.owner_id === viewer.id,
  })));
  return {
    version: head.version, columns, rows, cells, tiles, filled: tiles.length, total, people: owners.size, mine: tiles.filter(tile => tile.mine).length,
    updatedAt: now.toISOString(), complete: tiles.length >= total, migrated: true,
  };
}
