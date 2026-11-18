import { samplePeople, sampleSessionIds } from "../sample";
import { letterCells, cellOrder } from "./mosaic";
import { HEART, type ReactionCount } from "./reactions";
import type { FeedPhoto, MosaicManifest, SessionCount } from "./types";

/*
 * Momen's sample data for dev-preview pages and tests (area B), on top of the fondasi's sample
 * people and rundown: the photos of the prototype (M01 Dimas at 10.02, M02 Fajar at 09.55, …) as
 * placeholders (no real pictures, the repo is public), the "Saring sesi" counts, and a Mozaik that is
 * 52% full. Never used outside dev-preview and tests.
 */

const D2 = "2027-01-05", D1 = "2027-01-04";
const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const uid = (n: number) => `00000000-0000-4000-8b00-${String(n).padStart(12, "0")}`;

/** The owner's kelompok as the cards show it (sample.ts: Arjuno = Kelompok 4, Kawi = 2, …). */
const GROUP_OF: Record<string, string> = {
  fajar: "Kelompok 4 · Arjuno", rani: "Kelompok 4 · Arjuno", sari: "Kelompok 4 · Arjuno", bima: "Kelompok 4 · Arjuno", ayu: "Kelompok 4 · Arjuno",
  raka: "Kelompok 4 · Arjuno", lina: "Kelompok 4 · Arjuno", tari: "Kelompok 4 · Arjuno", wawan: "Kelompok 4 · Arjuno", nina: "Kelompok 4 · Arjuno",
  dimas: "Kelompok 2 · Kawi", dewi: "Kelompok 3 · Welirang", yoga: "Kelompok 6 · Butak", gilang: "Kelompok 7 · Semeru", putri: "Kelompok 8 · Wilis",
  hana: "Kelompok 9 · Lawu", maya: "Kelompok 1 · Bromo", hadi: "Kelompok 5 · Panderman",
};

/** `total` reactions spread over the usual emoji (half the red heart, a quarter laughing, …), none for 0. */
export function sampleReactions(total: number, mine: string | null = null): ReactionCount[] {
  const shares: [string, number][] = [[HEART, 0.5], ["😂", 0.25], ["🔥", 0.5], ["👏", 1]];
  const out: ReactionCount[] = [];
  let left = total;
  for (const [emoji, share] of shares) {
    const n = share === 1 ? left : Math.ceil(left * share);
    if (n > 0) out.push({ emoji, count: n, mine: emoji === mine });
    left -= n;
    if (left <= 0) break;
  }
  return out;
}

type Seed = [key: string, date: string, time: string, reacted: number, extra?: Partial<FeedPhoto>];
function photo(n: number, [key, date, time, reacted, extra = {}]: Seed, viewerKey = "rani"): FeedPhoto {
  const person = samplePeople[key];
  return {
    id: uid(n), owner: { id: person.id, name: person.name, photo: null }, ownerGroup: GROUP_OF[key] ?? person.department,
    audience: "semua", sessionId: sampleSessionIds.pemaparan, width: 1280, height: 1600, takenAt: at(date, time), visibleAt: at(date, time),
    status: "tampil", reactions: sampleReactions(reacted), seen: false, mine: key === viewerKey, src: { kecil: null, besar: null }, ...extra,
  };
}

const ALL: Seed[] = [
  ["putri", D2, "10:04", 3], ["gilang", D2, "10:03", 1], ["dimas", D2, "10:02", 24], ["hana", D2, "10:00", 5], ["yoga", D2, "09:58", 7],
  ["dewi", D2, "09:57", 2], ["fajar", D2, "09:55", 10, { reactions: sampleReactions(10, HEART) }], ["nina", D2, "09:53", 4], ["wawan", D2, "09:48", 9], ["ayu", D2, "09:45", 0],
  ["maya", D2, "09:41", 6], ["raka", D2, "09:37", 2], ["lina", D2, "09:30", 1], ["tari", D2, "09:22", 3], ["bima", D2, "09:15", 8],
  ["hadi", D2, "08:58", 2], ["sari", D2, "08:41", 4], ["gilang", D2, "08:20", 0], ["putri", D2, "07:35", 5], ["yoga", D2, "07:10", 1],
  ["dewi", D2, "06:30", 3], ["hana", D1, "21:10", 11], ["dimas", D1, "19:45", 2], ["nina", D1, "17:20", 6],
];

/** M01: 24 new photos for everyone (the third is Dimas, 10.02, 24 reactions). */
export const sampleFeedSemua: FeedPhoto[] = ALL.map((seed, index) => photo(index + 1, seed));

/** M05 Galeri: 21 photos (Fajar's, Raka's and Wawan's carry the lock: an earlier version sent them only to the kelompok). */
export const sampleGalleryAll: FeedPhoto[] = (["rani", "fajar", "sari", "bima", "ayu", "raka", "lina", "tari", "wawan", "nina", "rani", "fajar", "sari", "bima", "ayu", "raka", "lina", "tari", "wawan", "nina", "fajar"] as const)
  .map((key, index) => photo(200 + index, [key, index < 15 ? D2 : D1, `${String(10 - Math.floor(index / 4)).padStart(2, "0")}:${String(59 - (index % 4) * 13).padStart(2, "0")}`, index % 5,
    { audience: index === 1 || index === 5 || index === 8 ? "kelompok" : "semua", seen: true }]));

/** M05 Fotoku: Rani's six photos (one only for the kelompok, one in review). */
export const sampleGalleryMine: FeedPhoto[] = [0, 1, 2, 3, 4, 5].map(index => photo(300 + index, ["rani", D2, `0${9 - Math.floor(index / 3)}:${String(50 - index * 7).padStart(2, "0")}`, index,
  { audience: index === 2 ? "kelompok" : "semua", status: index === 4 ? "ditinjau" : "tampil", seen: true }]));

/** "Saring sesi" (M01__status#pilih-sesi): only sessions with photos, Umum last. */
export const sampleSessionCounts: SessionCount[] = [
  { sessionId: sampleSessionIds.pemaparan, photos: 24 }, { sessionId: sampleSessionIds["sarapan-2"], photos: 12 }, { sessionId: sampleSessionIds.wellness, photos: 18 },
  { sessionId: sampleSessionIds["sharing-ai"], photos: 21 }, { sessionId: sampleSessionIds["makan-malam-1"], photos: 15 }, { sessionId: sampleSessionIds.pembukaan, photos: 40 },
  { sessionId: null, photos: 46 },
];
/** "Semua sesi · 486 foto" in the sheet and the gallery. */
export const SAMPLE_TOTAL = 486;

/** The prototype's Mozaik grid (M06: 30 × 20 = 600 cells). */
export const SAMPLE_MOSAIC_GRID = { columns: 30, rows: 20 } as const;

/**
 * A Mozaik filled to `share` of its cells (M06: 312 of 600, 52%), in the real fill order, with
 * `mine` of the viewer's photos in it (4 at 52%). Tiles have no picture (placeholders).
 */
export function sampleMosaic(share = 0.52, mine = 4, grid: { columns: number; rows: number } = SAMPLE_MOSAIC_GRID): MosaicManifest {
  const { columns, rows } = grid;
  const total = columns * rows;
  const filled = Math.round(total * share);
  const order = cellOrder(columns, rows, "WAM 2026");
  const cells = letterCells(columns, rows, "WAM 2026");
  // Mine: spread over the letters, as the prototype numbers them (W, A, 2, 6).
  const placed = order.slice(0, filled);
  const letterPlaced = placed.filter(cell => cells[cell] !== ".");
  const step = Math.max(1, Math.floor(letterPlaced.length / Math.max(1, mine)));
  const mineCells = new Set(letterPlaced.filter((_, index) => index % step === 0).slice(0, mine));
  const tiles = placed.map((cell, index) => ({ cell, id: uid(1000 + index), src: null, mine: mineCells.has(cell) }));
  return {
    version: `sample-${filled}`, columns, rows, cells, tiles, filled, total, people: filled >= total ? 118 : 86, mine: mineCells.size,
    updatedAt: at(D2, "10:05"), complete: filled >= total, migrated: true,
  };
}
