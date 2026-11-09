import { clockLabel, overlaps, wibTime, type Room } from "./appraisal";
import type { SeatLayout } from "./seating";

/*
 * The office floor plan, traced from the office's CAD drawing (1600 × 1043, the river on the left
 * and the road on the right): the site (grass, river, road, paving, yard, roofs, ramps, plants),
 * the upper building with rooms 1–19 and the office below it with
 * rooms 20–31, numbered in the trace's order. North is Limasan's side (the drawing's left), so the
 * plan here is that drawing turned a quarter clockwise: north (Limasan) is up, as the compass on
 * the plan says. The coordinates below are the drawing's, turned once when this module loads; the
 * SVG's viewBox is 0 0 PLAN_W PLAN_H.
 * WAM rooms live in the database (pw_rooms); they find their spot here by the spot the super admin
 * picked, else by name, so a room that is renamed or added without a spot is simply listed below
 * the plan.
 */

export type Rect = { x: number; y: number; w: number; h: number };
type Point = [number, number];

/** The drawing's size: its left edge (Limasan's side) becomes the top. */
const SOURCE_W = 1600;
const SOURCE_H = 1043;
/** A quarter turn clockwise: the drawing's left goes to the top, its top to the right. */
const turn = ({ x, y, w, h }: Rect): Rect => ({ x: SOURCE_H - y - h, y: x, w: h, h: w });
const turnPoint = ([x, y]: Point): Point => [SOURCE_H - y, x];
/** A box from its corners, in the drawing's coordinates. */
const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const n1 = (value: number) => Math.round(value * 10) / 10;
/** Polylines (in the drawing's coordinates) as one SVG path, turned. */
const pathOf = (lines: Point[][]) => lines.map(line => line.map(turnPoint).map(([x, y], index) => `${index ? "L" : "M"}${n1(x)} ${n1(y)}`).join("")).join("");

export const PLAN_W = SOURCE_H;
export const PLAN_H = SOURCE_W;
/** Both buildings and their terraces (every room, fixture and door is inside). */
export const BUILDING: Rect = turn(box(11, 30, 1530, 1003));

/**
 * The rooms as the trace numbers them (1–31), each the box drawn for it: its cell less 2 units all
 * round, so neighbours keep a gap. 20 is the Mushola (it was taken for Limasan until 9 Nov 2026);
 * Limasan, the pendopo, is the boarded terrace above it by the river (LIMASAN below); 26 is Main
 * Office's L (its bounding box).
 */
const SOURCE_ROOMS: Rect[] = ([
  [211, 50, 358, 180], [363, 50, 527, 180], [532, 50, 762, 180],
  [211, 184, 280, 298], [285, 184, 496, 392], [501, 184, 672, 392], [211, 303, 280, 392],
  [211, 397, 358, 527], [363, 397, 608, 527], [674, 184, 768, 223],
  [776, 43, 889, 223], [894, 43, 981, 130], [894, 135, 981, 223],
  [986, 43, 1074, 97], [986, 101, 1074, 223], [1078, 43, 1172, 97], [1177, 43, 1228, 97], [1232, 43, 1320, 97],
  [1078, 101, 1320, 223],
] as const).map(([x0, y0, x1, y1]) => box(x0 + 2, y0 + 2, x1 - 2, y1 - 2)).concat(
  box(299, 549, 413, 664),
  ...([[589, 562, 680, 675], [684, 562, 773, 675], [776, 565, 1050, 672], [1055, 565, 1145, 672], [560, 740, 667, 865]] as const)
    .map(([x0, y0, x1, y1]) => box(x0 + 2, y0 + 2, x1 - 2, y1 - 2)),
  box(742, 672, 1205, 1000),
  ...([[742, 815, 838, 893], [742, 893, 838, 975], [1205, 588, 1300, 760], [1205, 760, 1300, 885], [1205, 888, 1300, 1000]] as const)
    .map(([x0, y0, x1, y1]) => box(x0 + 2, y0 + 2, x1 - 2, y1 - 2)),
);
/** Room N's box on the plan (turned), N from 1 to 31. */
export const roomBox = (number: number): Rect => turn(SOURCE_ROOMS[number - 1]);
export const ROOM_COUNT = SOURCE_ROOMS.length;

type Side = "top" | "bottom" | "left" | "right";
export type PlanSpot = {
  label: string; rect: Rect;
  /** The outline to draw instead of `rect`, for a room that is not a plain box (Main Office's L). */
  shape?: Point[];
  /** Where its words (and chairs) sit, when not `rect` (a band of Main Office's wide part). */
  textRect?: Rect;
  /** How its chairs are set out (seating.ts); "rapat" when not given. No database field: the plan decides. */
  layout?: SeatLayout;
  /** A round table instead of a long one (the pantry). */
  round?: boolean;
  /** No table or chairs: its furniture is drawn as fixtures (Main Office's desks). */
  bare?: boolean;
  /** An open area rather than a room (Communal Space): a dashed edge, no shadow. */
  open?: boolean;
  /** A dashed line across the room where a partition can split it (Vasuki, rooms 2 and 3). */
  divider?: [Point, Point];
  /** Lines drawn on its floor (Limasan's roof seen from above). */
  marks?: Point[][];
  /** Its door: a break in the wall at `at` (0–1) along one side of `rect`, in the drawing's coordinates. */
  door?: { side: Side; at: number };
  /** The trace's room numbers it covers. */
  rooms: number[];
};
/** A spot as drawn: its layout filled in, its door and divider wall segments, its marks a path. */
export type DrawnSpot = Omit<PlanSpot, "door" | "layout" | "marks" | "divider"> & {
  layout: SeatLayout; door?: [Point, Point]; divider?: [Point, Point]; marks?: string;
};

/**
 * Every room drawn on the plan, in the drawing's coordinates (turned below). The named rooms keep
 * the keys they had on the old plan, so rooms already linked in the database keep their place;
 * every other numbered room is "ruang-N", "Ruang N", for the super admin to give a room by hand.
 */
const NAMED: Record<number, Omit<PlanSpot, "rect" | "rooms"> & { key: string }> = {
  20: { key: "mushola", label: "Mushola" },
  23: { key: "nagapadma", label: "Nagapadma", door: { side: "bottom", at: 0.5 } },
  24: { key: "ananta", label: "CFC Ananta Room", door: { side: "bottom", at: 0.5 } },
  // Its box is too small for a round table with chairs: a short meeting table instead.
  25: { key: "pantry", label: "Pantry", door: { side: "bottom", at: 0.5 } },
  // The L round rooms 27 and 28; its words in a band at the end of its wide part, clear of the desks.
  26: {
    key: "main-office", label: "Main Office", bare: true, door: { side: "left", at: 0.2 },
    shape: [[742, 672], [1205, 672], [1205, 1000], [1015, 1000], [1015, 985], [840, 985], [840, 815], [742, 815]],
    textRect: box(1144, 676, 1203, 996),
  },
  27: { key: "ruang-27", label: "Ruang 27", door: { side: "right", at: 0.5 } },
  28: { key: "antareja", label: "Antareja", door: { side: "right", at: 0.5 } },
  29: { key: "ruang-29", label: "Ruang 29", door: { side: "left", at: 0.5 } },
  30: { key: "ruang-30", label: "Ruang 30", door: { side: "left", at: 0.5 } },
  31: { key: "ruang-31", label: "Ruang 31", door: { side: "left", at: 0.5 } },
};

/**
 * Limasan (corrected 9 Nov 2026): the pendopo on the boarded terrace by the river, above the Mushola
 * on the plan. Not a numbered room of the trace; its roof (a hip roof seen from above) is drawn on it.
 * It keeps the key "limasan", so the WAM room linked to it moves here.
 */
const LIMASAN = box(60, 540, 190, 776);
const SOURCE_SPOTS: Record<string, PlanSpot> = {
  limasan: {
    label: "Limasan", rect: LIMASAN, layout: "kelas", rooms: [],
    marks: [[[60, 540], [125, 605], [190, 540]], [[60, 776], [125, 711], [190, 776]], [[125, 605], [125, 711]]],
  },
};
for (let number = 1; number <= SOURCE_ROOMS.length; number++) {
  if (number === 3) continue;
  if (number === 2) {
    // Rooms 2 and 3 are one room, Vasuki, that a partition can split in two.
    const two = SOURCE_ROOMS[1], three = SOURCE_ROOMS[2];
    const middle = (two.x + two.w + three.x) / 2;
    SOURCE_SPOTS.vasuki = {
      label: "Vasuki", rooms: [2, 3], rect: box(two.x, two.y, three.x + three.w, two.y + two.h),
      divider: [[middle, two.y + 4], [middle, two.y + two.h - 4]],
    };
    continue;
  }
  const { key, ...named } = NAMED[number] ?? { key: `ruang-${number}`, label: `Ruang ${number}` };
  SOURCE_SPOTS[key] = { ...named, rect: SOURCE_ROOMS[number - 1], rooms: [number] };
  // Communal Space: the open courtyard round the plant below Pantry.
  if (number === 25) SOURCE_SPOTS.communal = { label: "Communal Space", rect: box(500, 871, 738, 970), layout: "lounge", open: true, rooms: [],
    // Its words and sofas below the plant, which stays in view at its top.
    textRect: box(534, 871, 738, 970) };
}

/** The door as a wall segment, 30 units long, in the drawing's coordinates. */
function doorLine({ x, y, w, h }: Rect, door: NonNullable<PlanSpot["door"]>): [Point, Point] {
  const half = 15;
  if (door.side === "top" || door.side === "bottom") {
    const at = x + w * door.at, wall = door.side === "top" ? y : y + h;
    return [[at - half, wall], [at + half, wall]];
  }
  const at = y + h * door.at, wall = door.side === "left" ? x : x + w;
  return [[wall, at - half], [wall, at + half]];
}

/** The spots as drawn: north (Limasan) up. */
export const PLAN_SPOTS: Record<string, DrawnSpot> = Object.fromEntries(Object.entries(SOURCE_SPOTS).map(([key, spot]) => [key, {
  label: spot.label, rect: turn(spot.rect), layout: spot.layout ?? "rapat", rooms: spot.rooms,
  ...(spot.round ? { round: true } : {}),
  ...(spot.bare ? { bare: true } : {}),
  ...(spot.open ? { open: true } : {}),
  ...(spot.shape ? { shape: spot.shape.map(turnPoint) } : {}),
  ...(spot.textRect ? { textRect: turn(spot.textRect) } : {}),
  ...(spot.divider ? { divider: spot.divider.map(turnPoint) as [Point, Point] } : {}),
  ...(spot.marks ? { marks: pathOf(spot.marks) } : {}),
  ...(spot.door ? { door: doorLine(spot.rect, spot.door).map(turnPoint) as [Point, Point] } : {}),
} satisfies DrawnSpot]));

/** How a spot's chairs are set out: Limasan in class rows, Communal Space as a lounge, the rest round a meeting table. */
export const spotLayout = (key: string): SeatLayout => PLAN_SPOTS[key]?.layout ?? "rapat";

/**
 * Chairs and tables are laid out (seating.ts) at this share of their size: the plan's rooms are
 * small next to seating's chairs, so a room's furniture is planned in a box 1/SEAT_SCALE as big
 * and drawn shrunk back.
 */
export const SEAT_SCALE = 0.4;

/*
 * The site round the rooms, drawn under them: areas (grass, river, road, paving, the yard, roofs,
 * ramps, gardens), their lines (ramp treads, terrace boards, roof ridges, porch marks), the
 * fountain and the way in.
 */
export type SiteKind = "grass" | "water" | "road" | "walk" | "pave" | "yard" | "garden" | "roof" | "ramp" | "pad" | "deck";
export type SiteArea = { kind: SiteKind; rect: Rect; r: number };
const area = (kind: SiteKind, x0: number, y0: number, x1: number, y1: number, r = 0): SiteArea => ({ kind, rect: turn(box(x0, y0, x1, y1)), r });
export const SITE: SiteArea[] = [
  area("grass", 0, 0, SOURCE_W, SOURCE_H), area("water", 0, 0, 16, SOURCE_H), area("road", 1582, 0, SOURCE_W, SOURCE_H), area("walk", 1556, 0, 1582, SOURCE_H),
  // The upper building: its plinth, the yard with two roofs, the ramps and stairs on the east.
  area("pave", 200, 38, 1530, 535, 14), area("yard", 705, 227, 1509, 525, 10), area("walk", 160, 298, 206, 397, 10), area("garden", 680, 232, 700, 517, 8),
  area("roof", 974, 310, 1153, 525, 6), area("roof", 1153, 310, 1335, 525, 6),
  area("ramp", 1355, 53, 1509, 212, 4), area("ramp", 1355, 356, 1509, 515, 4),
  area("walk", 1325, 43, 1352, 226, 4), area("walk", 1335, 341, 1352, 525, 4), area("walk", 1525, 30, 1556, 530, 4),
  // The office: the west terrace, steps and a ramp to the river, the garden, Limasan's deck, the courtyard, the east porch.
  area("pave", 11, 525, 206, 790, 10), area("walk", 60, 540, 190, 776, 8), area("pad", 75, 552, 160, 610, 10), area("pad", 75, 695, 160, 760, 10),
  area("ramp", 204, 755, 385, 840, 4), area("ramp", 205, 840, 318, 1000, 4),
  area("garden", 258, 535, 380, 750, 10), area("yard", 385, 535, 473, 786, 8), area("yard", 300, 805, 473, 975, 8),
  area("deck", 413, 558, 451, 655, 4), area("walk", 473, 532, 496, 975, 4), area("pave", 496, 552, 742, 974, 8),
  area("pave", 1300, 553, 1409, 1003, 8), area("walk", 1409, 532, 1525, 1003, 4),
];
const across = (x0: number, x1: number, from: number, to: number, step: number): Point[][] => {
  const lines: Point[][] = [];
  for (let y = from; y < to; y += step) lines.push([[x0, y], [x1, y]]);
  return lines;
};
/** The site's lines as one path per kind. */
export const SITE_LINES: { kind: "tread" | "board" | "ridge" | "mark"; d: string }[] = [
  { kind: "tread", d: pathOf([...across(1355, 1509, 67, 212, 14), ...across(1355, 1509, 370, 515, 14), ...across(204, 385, 765, 840, 10), ...across(205, 318, 852, 1000, 12)]) },
  { kind: "board", d: pathOf(across(64, 186, 552, 770, 22)) },
  { kind: "ridge", d: pathOf([[[974, 417], [1335, 417]]]) },
  { kind: "mark", d: pathOf(across(1370, 1384, 600, 1000, 30)) },
];
const [fountainX, fountainY] = turnPoint([543, 583]);
export const FOUNTAIN = { cx: fountainX, cy: fountainY, r: 18 };
/** The way in from the road: an arrow and its word. */
export const ENTRANCE = { arrow: ([[1485, 980], [1545, 995], [1485, 1010]] as Point[]).map(turnPoint), label: { x: 72, y: 1514 } };

/**
 * Fixed furniture that is not a room's chairs: Main Office's desks with their stools and its inner
 * garden, and plants (two circles) round the site and in the courtyard.
 */
export type Fixture = { kind: "desk" | "stool" | "garden" | "plant"; rect: Rect };
const desks = (x0: number, y0: number, columns: number, rows: number): Fixture[] => {
  const items: Fixture[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = x0 + column * 70, y = y0 + row * 56;
    items.push({ kind: "desk", rect: box(x, y, x + 46, y + 22) });
    for (let seat = 0; seat < 2; seat++) items.push({ kind: "stool", rect: box(x + 6 + seat * 22, y + 25, x + 18 + seat * 22, y + 34) });
  }
  return items;
};
const plant = (x: number, y: number, d = 22): Fixture => ({ kind: "plant", rect: box(x - d / 2, y - d / 2, x + d / 2, y + d / 2) });
export const FIXTURES: Fixture[] = [
  { kind: "garden", rect: box(1058, 703, 1142, 786) } as Fixture,
  ...desks(880, 700, 2, 1), ...desks(880, 820, 4, 2),
  plant(730, 300), plant(1290, 280), plant(900, 480), plant(1340, 680), plant(1340, 800), plant(520, 900), plant(440, 600),
].map(item => ({ ...item, rect: turn(item.rect) }));

/** "CFC Ananta Room" → "cfc ananta room"; slugs normalize the same way ("cfc-ananta" → "cfc ananta"). */
export const normalizeRoomName = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Normalized WAM room name (or slug) → its spot on the plan. */
const ROOM_SPOTS: Record<string, string> = {
  "cfc ananta room": "ananta", "cfc ananta": "ananta", "ananta room": "ananta", ananta: "ananta",
  nagapadma: "nagapadma",
  vasuki: "vasuki",
  limasan: "limasan",
  mushola: "mushola", musholla: "mushola", musala: "mushola",
  pantry: "pantry",
  "main office": "main-office",
  antareja: "antareja",
  "communal space": "communal", communal: "communal", komunal: "communal",
};

/**
 * Which spot a WAM room takes: the one the super admin picked, else by its name, then by its slug;
 * null when it has none.
 */
export function planKey(room: Pick<Room, "name" | "slug"> & { planKey?: string | null }): string | null {
  if (room.planKey && PLAN_SPOTS[room.planKey]) return room.planKey;
  return ROOM_SPOTS[normalizeRoomName(room.name)] ?? ROOM_SPOTS[normalizeRoomName(room.slug ?? "")] ?? null;
}

/**
 * The plan for a list of WAM rooms: the rooms with a spot, the spots no WAM room takes (drawn grey,
 * never bookable), and the WAM rooms without a spot (listed below the plan).
 */
export function layoutRooms<R extends Pick<Room, "id" | "name" | "slug"> & { planKey?: string | null }>(rooms: R[]) {
  const placed: { key: string; room: R; rect: Rect }[] = [];
  const unplaced: R[] = [];
  const taken = new Set<string>();
  for (const room of rooms) {
    const key = planKey(room);
    if (key && !taken.has(key)) { taken.add(key); placed.push({ key, room, rect: PLAN_SPOTS[key].rect }); }
    else unplaced.push(room);
  }
  const others = Object.entries(PLAN_SPOTS).filter(([key]) => !taken.has(key)).map(([key, spot]) => ({ key, ...spot }));
  return { placed, others, unplaced };
}

/** How a room shows on the plan; `small` is free but too small for the people chosen. */
export type PlanTone = "free" | "busy" | "mine" | "small" | "off" | "closed";
export type PlanStatus = { tone: PlanTone; text: string };
export type PlanHold = { startsAt: string; endsAt: string; mine?: boolean };

const spanLabel = (span: PlanHold) => `${clockLabel(wibTime(span.startsAt))}–${clockLabel(wibTime(span.endsAt))}`;

/**
 * A room's status for the chosen hours (`span`), as the HTML's statusFor() but for a span rather
 * than "now": not bookable, past, taken (by someone or by you), too small, or free. Without `now`
 * hours in the past are not marked (panitia may record a session afterwards).
 */
export function roomStatus(input: {
  bookable: boolean; holds: PlanHold[]; span: { startsAt: string; endsAt: string } | null; now?: Date;
  capacity?: number | null; needed?: number;
}): PlanStatus {
  const { bookable, holds, span, now, capacity, needed } = input;
  if (!bookable) return { tone: "off", text: "Tidak bisa dibooking" };
  if (!span) return { tone: "closed", text: "Pilih jam dulu" };
  if (now && new Date(span.endsAt) <= now) return { tone: "closed", text: "Jam sudah lewat" };
  const hits = holds.filter(hold => overlaps(hold, span)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const other = hits.find(hold => !hold.mine);
  if (other) return { tone: "busy", text: `Terpakai ${spanLabel(other)}` };
  if (hits.length) return { tone: "mine", text: `Booking kamu ${spanLabel(hits[0])}` };
  if (capacity != null && needed != null && needed > capacity) return { tone: "small", text: `Kurang ${needed - capacity} kursi` };
  return { tone: "free", text: `Kosong ${spanLabel(span)}` };
}

/** Whether a room in this status can be picked on the plan. */
export const pickableTone = (tone: PlanTone) => tone === "free" || tone === "small";

/**
 * Font size in plan units that fits `label` in a box `width` wide (the HTML's fitText): never below
 * 14 and never above `max`.
 */
export const fitText = (label: string, width: number, max: number, min = 14) => Math.max(min, Math.min(max, (width - 24) / (Math.max(label.length, 3) * 0.68)));

/** Width of one character of the plan's bold label font, as a share of the font size. */
const CHAR = 0.6;
/** Smallest name and subtitle on screen, in CSS px: below that a label is not readable (the subtitle is short, so a little smaller). */
export const NAME_MIN_PX = 9;
export const SUB_MIN_PX = 8;

/**
 * Words of `text` broken into at most `maxLines` lines, each at most `chars` characters where the
 * words allow it (a longer word keeps its own line). The last line takes whatever words are left.
 */
export function wrapWords(text: string, chars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last != null && (last.length + 1 + word.length <= chars || lines.length >= maxLines)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * The quiet name of a spot no room takes ("Ruang 12"): on one line or, when that lets it be
 * clearly bigger, two ("Ruang" / "12"), as big as the box allows up to `max` plan units. Null when
 * it would be smaller on screen than NAME_MIN_PX at `px` screen px per plan unit (the plan's zoom
 * included): a map's small names show once zoomed in.
 */
export function quietName(name: string, rect: Pick<Rect, "w" | "h">, px: number, max = 28): { lines: string[]; size: number } | null {
  if (!name) return null;
  const fit = (lines: string[]) => Math.min(max, (rect.w - 10) / (Math.max(...lines.map(line => line.length)) * CHAR), (rect.h - 8) / (lines.length * 1.2));
  const one = [name];
  const two = name.includes(" ") ? wrapWords(name, Math.ceil(name.length / 2), 2) : one;
  const best = two.length > 1 && fit(two) > fit(one) * 1.15 ? { lines: two, size: fit(two) } : { lines: one, size: fit(one) };
  return best.size * px >= NAME_MIN_PX ? best : null;
}

export type SpotText = {
  name: string[]; nameSize: number;
  sub: string[]; subSize: number;
  /** The zoom from which the subtitle is readable (≥ SUB_MIN_PX); Infinity when it never fits the box. */
  subFrom: number;
  /** The words run up the box (turned a quarter anticlockwise): a tall, narrow room. */
  rotate: boolean;
  /** The zoom from which the name is shown (it is shrunk to fit a tiny room); 1 or absent: always. */
  nameFrom?: number;
};

/**
 * How a spot's words sit in its box, in plan units: the name on one line or, when that lets it be
 * bigger, two; never smaller on screen than NAME_MIN_PX. The subtitle breaks at " · " and spaces,
 * up to three lines, and shows only once the plan is zoomed enough for it to be readable. A tall,
 * narrow room (Nagapadma, Vasuki) whose name would run past its sides, or whose subtitle would not
 * fit, has its words turned to run along its length instead. `unitPx` is screen px per plan unit
 * with the plan fitted (zoom 1); without it the plan is taken as 860px wide.
 */
export function spotText(input: TextInput): SpotText {
  return strip(chooseText(input));
}

type TextInput = {
  name: string; sub: string; rect: Pick<Rect, "w" | "h">; main?: boolean; unitPx?: number;
  /** The share (0–1) of the box's height the words may take, from its top; the whole box by default. */
  band?: number;
  /** Smaller words, the subtitle shrunk to fit under the name: a room whose chairs are drawn below. */
  compact?: boolean;
};

function chooseText(input: TextInput): SpotText & { spills: boolean } {
  const { rect } = input;
  const share = Math.min(1, Math.max(0.1, input.band ?? 1));
  const upright = layText({ ...input, rect: { w: rect.w, h: rect.h * share } });
  // A squat box keeps its words upright, unless they still run past the walls there.
  if (rect.h <= rect.w * 1.3 && !upright.spills) return upright;
  const turned = layText({ ...input, rect: { w: rect.h * share, h: rect.w } });
  // Upright reads more easily: turn only when the name runs past the sides, or the subtitle does
  // not show at all or is broken in the middle of its parts ("Muat 6 / orang · / min 1").
  const parts = input.sub ? input.sub.split(" · ").length : 0;
  const awkward = (text: SpotText) => !!input.sub && (text.subFrom > 1 || text.sub.length > parts);
  const better = (upright.spills && !turned.spills) || (awkward(upright) && !awkward(turned) && !turned.spills);
  return better ? { ...turned, rotate: true } : upright;
}

/** Plan units the words take down from the top of their box (with its padding), the subtitle included. */
export function wordsBand(text: SpotText): number {
  const along = (lines: string[], size: number) => lines.length ? Math.max(...lines.map(line => line.length)) * CHAR * size : 0;
  if (text.rotate) return WORDS_TOP + Math.max(along(text.name, text.nameSize), along(text.sub, text.subSize)) + WORDS_BOTTOM;
  const subH = text.sub.length ? text.subSize * 0.5 + text.sub.length * text.subSize * 1.2 : 0;
  return WORDS_TOP + text.name.length * text.nameSize * 1.2 + subH + WORDS_BOTTOM;
}
/** Room above and below the words when they sit at the top of a room. */
export const WORDS_TOP = 12;
export const WORDS_BOTTOM = 10;

/**
 * A room's words at its top, with its chairs below (FloorPlan.tsx): as spotText, but the words keep
 * to the top 40% of the box, or more when that is what keeps the name inside and the subtitle
 * there (a narrow room such as Nagapadma: two lines, or turned to run down the room), and up to
 * 55% for the subtitle to be readable without zooming. `band` is how far down they reach, which
 * is where the chairs start.
 */
export function spotWords(input: Omit<TextInput, "band">): SpotText & { band: number } {
  const done = (text: SpotText & { spills: boolean }, share: number) => !text.spills && (!input.sub || (text.sub.length > 0 && (text.subFrom <= 1 || share >= 0.55)));
  const shares = [0.4, 0.55, 0.7, 1];
  const first = chooseText({ ...input, band: shares[0], compact: true });
  let text = first;
  for (let index = 1; index < shares.length && !done(text, shares[index - 1]); index++) text = chooseText({ ...input, band: shares[index], compact: true });
  // A name too long for the room even with all of it (a tiny phone screen) keeps the small band:
  // it runs past the walls either way, and the chairs stay.
  const kept = strip(text.spills ? first : text);
  // A name that still runs past the walls at the readable size (one word in a tiny room, such as
  // Antareja on a phone) is shrunk to fit inside and only shown once zoomed in enough to read it;
  // until then the room keeps its name in its label and tooltip.
  // Both ways: along the lines, and across them (three lines of "CFC / Ananta / Room" in a squat box).
  const along = Math.max(0, ...kept.name.map(line => line.length)) * CHAR * kept.nameSize;
  const across = kept.name.length * 1.2 * kept.nameSize;
  const room = (kept.rotate ? input.rect.h : input.rect.w) - 4;
  const depth = kept.rotate ? input.rect.w - 4 : input.rect.h - WORDS_TOP - WORDS_BOTTOM;
  const shrink = Math.min(1, along > 0 ? room / along : 1, across > 0 && depth > 0 ? depth / across : 1);
  const words = shrink < 1 ? { ...kept, nameSize: kept.nameSize * shrink, nameFrom: 1 / shrink } : kept;
  return { ...words, band: Math.min(input.rect.h, wordsBand(words)) };
}

const strip = (text: SpotText & { spills: boolean }): SpotText => {
  const { name, nameSize, sub, subSize, subFrom, rotate } = text;
  return { name, nameSize, sub, subSize, subFrom, rotate };
};

function layText(input: TextInput): SpotText & { spills: boolean } {
  const { name, sub, rect, main, compact } = input;
  const unitPx = input.unitPx && input.unitPx > 0 ? input.unitPx : 860 / PLAN_W;
  // The padding shrinks in a small room (CFC Ananta), so its name and chairs both fit.
  const pad = Math.min(24, Math.max(10, rect.w * 0.14)), room = rect.w - pad;
  const floor = Math.min(NAME_MIN_PX / unitPx, 72);
  const top = Math.max(compact ? (main ? 26 : 22) : main ? 46 : 34, floor);
  const longest = (lines: string[]) => Math.max(...lines.map(line => line.length), 3);
  const fit = (lines: string[]) => Math.min(top, room / (longest(lines) * CHAR), (rect.h - pad) / (lines.length * 1.2));
  const one = name ? [name] : [];
  const half = Math.ceil(name.length / 2);
  const two = name.includes(" ") ? wrapWords(name, half, 2) : one;
  // Two lines only when they win by a clear margin: one line reads more easily. But a name that
  // runs past the walls at its readable size breaks into two or three lines when that keeps it in
  // ("CFC Ananta Room" in its small box on a phone), or into the least wide of them.
  const widthAt = (lines: string[]) => longest(lines) * CHAR * Math.max(fit(lines), floor);
  const fitsWidth = (lines: string[]) => widthAt(lines) <= rect.w - 8;
  const three = name.split(" ").length > 2 ? wrapWords(name, Math.ceil(name.length / 3), 3) : two;
  let nameLines = two.length > 1 && fit(two) > fit(one) * 1.25 ? two : one;
  if (name && !fitsWidth(nameLines)) {
    const options = [one, two, three].filter(lines => lines.length > 0);
    nameLines = options.find(fitsWidth) ?? options.reduce((best, lines) => widthAt(lines) < widthAt(best) ? lines : best);
  }
  const nameSize = name ? Math.max(fit(nameLines), floor) : 0;
  // Held at the readable floor, a long name can be wider than its box.
  const spills = !!name && longest(nameLines) * CHAR * nameSize > rect.w - 8;
  const nameH = nameLines.length * nameSize * 1.2;
  const none = { name: nameLines, nameSize, sub: [], subSize: 0, subFrom: Infinity, rotate: false, spills };
  if (!sub) return none;

  // The subtitle may grow to the readable size where the box allows, but stays below the name.
  const subTop = Math.min(Math.max(compact ? 15 : main ? 28 : 23, SUB_MIN_PX / unitPx), Math.max(nameSize * (compact ? 0.8 : 0.95), 1));
  const parts = sub.split(" · ");
  const options = [[sub], parts.length > 1 ? [parts[0], parts.slice(1).join(" · ")] : wrapWords(sub, Math.ceil(sub.length / 2), 2), wrapWords(sub, Math.ceil(sub.length / 3), 3)];
  let best: { lines: string[]; size: number } = { lines: [], size: 0 };
  for (const lines of options) {
    const wide = Math.min(subTop, room / (longest(lines) * CHAR));
    // Compact: shrunk to the height left under the name rather than dropped.
    const size = compact ? Math.min(wide, (rect.h - pad / 2 - nameH) / (0.5 + lines.length * 1.2) - 0.01) : wide;
    if (size <= 0) continue;
    // It must fit under the name, with a gap.
    if (nameH + size * 0.5 + lines.length * size * 1.2 > rect.h - pad / 2) continue;
    // A clearly bigger option wins, and so does any bigger one while the best is still too small to read.
    if (size > best.size * 1.15 || (size > best.size && best.size * unitPx < SUB_MIN_PX)) best = { lines, size };
  }
  if (!best.lines.length) return none;
  return { ...none, sub: best.lines, subSize: best.size, subFrom: Math.max(1, SUB_MIN_PX / (best.size * unitPx)) };
}

/** "Muat 8 orang · min 2": how many people a room holds and the fewest it is booked for. */
export function roomPeople(room: Pick<Room, "capacity" | "minPeople">): string {
  const { capacity, minPeople } = room;
  if (capacity) return minPeople ? `Muat ${capacity} orang · min ${minPeople}` : `Muat ${capacity} orang`;
  return minPeople ? `Min ${minPeople} orang · kapasitas belum diisi` : "Kapasitas belum diisi";
}

/** "8 kursi": the line under a room's name on the plan (its chairs are drawn from the same number). */
export const roomSeats = (room: Pick<Room, "capacity">) => room.capacity ? `${room.capacity} kursi` : "Kapasitas belum diisi";

/** "Muat 8 orang · min 2 · TV, Whiteboard": the room's people and facilities, for lists and tooltips. */
export function roomSpec(room: Pick<Room, "capacity" | "minPeople"> & { facilities?: string[] | null }): string {
  const people = roomPeople(room);
  const facilities = (room.facilities ?? []).map(item => item.trim()).filter(Boolean);
  if (!facilities.length) return people;
  const shown = facilities.slice(0, 3).join(", ");
  return `${people} · ${shown}${facilities.length > 3 ? ` +${facilities.length - 3}` : ""}`;
}

/** Facility tags a room can carry: at most 8, each 2–30 characters. */
export const FACILITY_LIMITS = { count: 8, min: 2, max: 30 } as const;

/**
 * "tv, Whiteboard,, AC , tv" → ["tv", "Whiteboard", "AC"]: the super admin's comma-separated
 * facilities, trimmed, inner spaces collapsed and repeats (any case) dropped. Not validated: an
 * over-long tag stays so the form can say what is wrong.
 */
export function parseFacilities(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(",")) {
    const tag = raw.replace(/\s+/g, " ").trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key); tags.push(tag);
  }
  return tags;
}

/** What is wrong with a list of facility tags, or null. */
export function facilitiesProblem(tags: string[]): string | null {
  const { count, min, max } = FACILITY_LIMITS;
  if (tags.length > count) return `Paling banyak ${count} fasilitas.`;
  const bad = tags.find(tag => tag.length < min || tag.length > max);
  return bad ? `Setiap fasilitas ${min} sampai ${max} karakter ("${bad.length > 12 ? `${bad.slice(0, 12)}…` : bad}").` : null;
}

/** Spots that a WAM room is named after (Vasuki, Pantry…); the others are "Ruang N". */
const ROOM_SPOT_KEYS = new Set(Object.values(ROOM_SPOTS));
export const isRoomSpot = (key: string) => ROOM_SPOT_KEYS.has(key);

/** A spot's name for people: a room spot's label ("Vasuki"), else "Ruang N" after the trace's number. */
export const spotTitle = (key: string): string => PLAN_SPOTS[key]?.label ?? key;

/*
 * Zooming and panning the plan like a map. The view is the part of the plan in the box: its zoom
 * (1 = the whole plan fitted) and the plan point at the box's top-left corner, in plan units.
 */
export type PlanView = { scale: number; x: number; y: number };
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const FIT_VIEW: PlanView = { scale: 1, x: 0, y: 0 };
/**
 * The plan's size as drawn: upright (north up, PLAN_W × PLAN_H) or, on a desktop, turned a quarter
 * to lie landscape (north to the left, PLAN_H × PLAN_W). Every view below is in these units.
 */
export type PlanSize = { w: number; h: number };
export const UPRIGHT: PlanSize = { w: PLAN_W, h: PLAN_H };
export const LANDSCAPE: PlanSize = { w: PLAN_H, h: PLAN_W };
/** A rect of the upright plan, where it lies on the landscape plan (turned a quarter anticlockwise). */
export const landscapeRect = (rect: Rect): Rect => ({ x: rect.y, y: PLAN_W - rect.x - rect.w, w: rect.h, h: rect.w });

/** The view kept within 1×–4× and with the plan filling the box (never pulled off it). */
export function clampView(view: PlanView, size: PlanSize = UPRIGHT): PlanView {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(view.scale) ? view.scale : 1));
  const x = Math.min(size.w - size.w / scale, Math.max(0, view.x || 0));
  const y = Math.min(size.h - size.h / scale, Math.max(0, view.y || 0));
  return { scale, x, y };
}

/**
 * The view at `scale` that keeps the plan point which was under `from` (a point in the box as a
 * share of its width and height, 0–1) now under `to`: zooming at a point (from = to), panning
 * (same scale) and a pinch (both) in one.
 */
export function moveView(start: PlanView, scale: number, from: [number, number], to: [number, number], size: PlanSize = UPRIGHT): PlanView {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
  const px = start.x + from[0] * size.w / start.scale, py = start.y + from[1] * size.h / start.scale;
  return clampView({ scale: next, x: px - to[0] * size.w / next, y: py - to[1] * size.h / next }, size);
}

/** Zoom by `factor` about a point of the box (shares, default its middle). */
export const zoomView = (view: PlanView, factor: number, at: [number, number] = [0.5, 0.5], size: PlanSize = UPRIGHT) => moveView(view, view.scale * factor, at, at, size);

/** Pans the least that brings `rect` into view (centred when it is bigger than the view). */
export function revealRect(view: PlanView, rect: Rect, margin = 40, size: PlanSize = UPRIGHT): PlanView {
  const w = size.w / view.scale, h = size.h / view.scale;
  const axis = (start: number, size: number, from: number, length: number) => {
    if (length + margin * 2 >= size) return from + length / 2 - size / 2;
    if (from - margin < start) return from - margin;
    if (from + length + margin > start + size) return from + length + margin - size;
    return start;
  };
  return clampView({ scale: view.scale, x: axis(view.x, w, rect.x, rect.w), y: axis(view.y, h, rect.y, rect.h) }, size);
}

/**
 * As layoutRooms, but a spot the super admin picked for a room (`planKey`) wins over a room that
 * only matches the spot by name, which then goes to `unplaced`. `unplaced` keeps the given order.
 */
export function placeRooms<R extends Pick<Room, "id" | "name" | "slug"> & { planKey?: string | null }>(rooms: R[]) {
  const picked = (room: R) => !!room.planKey && !!PLAN_SPOTS[room.planKey];
  const { placed, others, unplaced } = layoutRooms([...rooms.filter(picked), ...rooms.filter(room => !picked(room))]);
  return { placed, others, unplaced: rooms.filter(room => unplaced.includes(room)) };
}

/** Every spot key with its label, for a picker: the named rooms first, then Ruang 1, Ruang 4… in number order. */
export const planSpotOptions = () => {
  const keys = Object.keys(PLAN_SPOTS);
  const ordered = [...keys.filter(isRoomSpot), ...keys.filter(key => !isRoomSpot(key))];
  return ordered.map(key => ({ key, label: spotTitle(key) }));
};
