/*
 * The Mozaik (M06, RISET §9): photos fill a grid in which a text ("WAM 2026") or a picture from the
 * theme (slot "Huruf Mozaik", later the KV) stands out. Here, pure and tested:
 *   - the cells of the text, drawn with a small 5 × 7 pixel font and fitted to the grid;
 *   - the fixed order in which empty cells are filled (a seeded shuffle: the same every time, so a
 *     placed photo never moves and the mosaic never "flickers");
 *   - labels and sizes for "Tandai fotoku".
 */

import { t, type Lang } from "../i18n";

const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
};
const GLYPH_W = 5, GLYPH_H = 7, LETTER_GAP = 1, WORD_GAP = 3, LINE_GAP = 2;

/** The Mozaik's text: the event's name in capitals ("WAM 2026"), only what the font can draw. */
export function mosaicText(eventName: string | null | undefined): string {
  const text = (eventName ?? "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return text && [...text].some(char => FONT[char]) ? text : "WAM 2026";
}

type Bitmap = { width: number; height: number; at: (x: number, y: number) => string | null };

/** The text drawn in lines, each centred; null = empty, otherwise the character of that pixel. */
function draw(lines: string[]): Bitmap {
  const widthOf = (line: string) => [...line].reduce((sum, char, index) => sum + (char === " " ? WORD_GAP : GLYPH_W) + (index > 0 ? LETTER_GAP : 0), 0);
  const width = Math.max(1, ...lines.map(widthOf));
  const height = lines.length * GLYPH_H + (lines.length - 1) * LINE_GAP;
  const pixels: (string | null)[] = new Array(width * height).fill(null);
  lines.forEach((line, row) => {
    let x = Math.floor((width - widthOf(line)) / 2);
    const top = row * (GLYPH_H + LINE_GAP);
    [...line].forEach((char, index) => {
      if (index > 0) x += LETTER_GAP;
      if (char === " ") { x += WORD_GAP; return; }
      const glyph = FONT[char];
      if (glyph) for (let gy = 0; gy < GLYPH_H; gy++) for (let gx = 0; gx < GLYPH_W; gx++) if (glyph[gy][gx] === "#") pixels[(top + gy) * width + x + gx] = char;
      x += GLYPH_W;
    });
  });
  return { width, height, at: (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? null : pixels[y * width + x]) };
}

/** The ways to lay a text out: one line, or two lines broken at each space. */
function layouts(text: string): string[][] {
  const words = text.split(" ");
  const out: string[][] = [[text]];
  for (let cut = 1; cut < words.length; cut++) out.push([words.slice(0, cut).join(" "), words.slice(cut).join(" ")]);
  return out;
}

/**
 * The text on a grid of columns × rows: one character per cell, row by row, "." for the cells
 * outside it. The layout with the largest letters wins (a margin of one cell around); whole pixel
 * sizes when they fit, so the letters stay crisp.
 */
export function letterCells(columns: number, rows: number, text = "WAM 2026"): string {
  const cells = new Array(columns * rows).fill(".");
  const roomX = Math.max(1, columns - 2), roomY = Math.max(1, rows - 2);
  let best: { bitmap: Bitmap; scale: number } | null = null;
  for (const lines of layouts(text)) {
    const bitmap = draw(lines);
    const scale = Math.min(roomX / bitmap.width, roomY / bitmap.height);
    if (!best || scale > best.scale) best = { bitmap, scale };
  }
  if (!best) return cells.join("");
  const { bitmap } = best;
  const scale = best.scale >= 1 ? Math.floor(best.scale) : best.scale;
  const offsetX = (columns - bitmap.width * scale) / 2, offsetY = (rows - bitmap.height * scale) / 2;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // The pixel under the cell's centre.
      const char = bitmap.at(Math.floor((column + 0.5 - offsetX) / scale), Math.floor((row + 0.5 - offsetY) / scale));
      if (char) cells[row * columns + column] = char;
    }
  }
  return cells.join("");
}

/** The Beranda card's mini mosaic (the prototype's mosaic(54, 9)): one long line of text on a 54 × 9 grid. */
export const MINI_COLUMNS = 54, MINI_ROWS = 9;

/**
 * The mini mosaic, apart from the big grid (its own mapping; the manifest, its version and the TV are untouched):
 * the text on one line in 54 × 9, and which of its cells show as photographed. The share of the big grid's letter
 * cells that hold a photo is carried over to the mini letters, in a fixed seeded order, so the same state always
 * draws the same mini mosaic.
 */
export function miniMosaic(big: { columns: number; rows: number; cells: ArrayLike<string>; filledCells: readonly number[] }, text = "WAM 2026"): { columns: number; rows: number; cells: string; lit: Set<number> } {
  const cells = letterCells(MINI_COLUMNS, MINI_ROWS, text);
  const letters = (value: string) => value !== ".";
  let bigLetters = 0;
  for (let index = 0; index < big.columns * big.rows; index++) if (letters(big.cells[index] ?? ".")) bigLetters++;
  const bigFilled = new Set(big.filledCells).size === 0 ? 0 : big.filledCells.filter(cell => letters(big.cells[cell] ?? ".")).length;
  const miniLetters = [...cells].filter(letters).length;
  const count = bigLetters > 0 ? Math.min(miniLetters, Math.round((Math.min(bigFilled, bigLetters) / bigLetters) * miniLetters)) : 0;
  const lit = new Set(cellOrder(MINI_COLUMNS, MINI_ROWS, "mini").filter(index => letters(cells[index])).slice(0, count));
  return { columns: MINI_COLUMNS, rows: MINI_ROWS, cells, lit };
}

/** A mask from a picture (true = inside), as one character per cell: "#" inside, "." outside. */
export const maskCells = (inside: readonly boolean[]) => inside.map(value => (value ? "#" : ".")).join("");

/** A 32-bit hash of a text (FNV-1a), the seed of the order. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

/** A small seeded random generator (mulberry32): the same seed, the same numbers. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The order in which the cells of a grid are filled: a shuffle fixed by the seed (Fisher–Yates). */
export function cellOrder(columns: number, rows: number, seed: string): number[] {
  const order = Array.from({ length: columns * rows }, (_, index) => index);
  const random = seededRandom(hashSeed(`${seed}|${columns}x${rows}`));
  for (let index = order.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  return order;
}

/** "huruf W", "angka 2", or where else the cell is. */
export function cellLabel(char: string | undefined, lang: Lang = "id"): string {
  if (!char || char === ".") return t(lang, "momen.mos.cellBackground");
  if (char === "#") return t(lang, "momen.mos.cellImage");
  return t(lang, /\d/.test(char) ? "momen.mos.cellDigit" : "momen.mos.cellLetter", { c: char });
}

/** Whole percent, rounded down so "100%" means complete. */
export const mosaicPercent = (filled: number, total: number) => (total > 0 ? Math.min(100, Math.floor((filled / total) * 100)) : 0);

/** The smallest block of cells holding all the given cells (for zooming to "my" photos). */
export function cellBounds(cells: readonly number[], columns: number): { left: number; top: number; right: number; bottom: number } | null {
  if (!cells.length || columns <= 0) return null;
  const xs = cells.map(cell => cell % columns), ys = cells.map(cell => Math.floor(cell / columns));
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Cells shown square: the side of one cell and the grid's offset inside a box (gap between cells). */
export function gridGeometry(box: { width: number; height: number }, columns: number, rows: number, gap = 1): { cell: number; left: number; top: number } {
  const cell = Math.max(1, Math.min((box.width - gap * (columns - 1)) / columns, (box.height - gap * (rows - 1)) / rows));
  return { cell, left: (box.width - (cell * columns + gap * (columns - 1))) / 2, top: (box.height - (cell * rows + gap * (rows - 1))) / 2 };
}

/** The palette colour (0–7, the tokens --mw-mosaic-1..8) of a cell: fixed by its place, so the letters never change colour between draws (the prototype's seeded pick). */
export const paletteIndex = (cell: number) => (Math.imul(cell + 1, 2654435761) >>> 0) % 8;
