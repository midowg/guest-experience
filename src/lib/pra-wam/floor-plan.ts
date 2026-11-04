import { clockLabel, overlaps, wibTime, type Room } from "./appraisal";

/*
 * The office floor plan, taken from "Werkudara Room Booking" (MAP_W, MAP_H, BLDG, DEF.floor.decor
 * and FLOOR_DEFAULT there). Coordinates are in plan units: the SVG's viewBox is 0 0 1600 1340.
 * WAM rooms live in the database (pw_rooms); they find their spot here by name, so a room that is
 * renamed or added without a spot is simply listed below the plan.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export const PLAN_W = 1600;
export const PLAN_H = 1340;
export const BUILDING: Rect = { x: 20, y: 95, w: 1540, h: 1225 };
/** Blocks that are not rooms (stairs, lift, storage): drawn plain. */
export const DECOR: Rect[] = [
  { x: 565, y: 302, w: 190, h: 238 }, { x: 870, y: 130, w: 228, h: 235 },
  { x: 1100, y: 110, w: 410, h: 245 }, { x: 670, y: 725, w: 200, h: 120 },
];

/**
 * Every room drawn on the plan, keyed by the slug the booking HTML uses. `rect` is the room's box
 * (its label sits in the middle); `shape`, when given, is the outline to draw instead, for a room
 * that is not a plain box (Main Office wraps round Antareja).
 */
export const PLAN_SPOTS: Record<string, { label: string; rect: Rect; shape?: [number, number][] }> = {
  "pak-bagus": { label: "Pak Bagus", rect: { x: 255, y: 165, w: 155, h: 135 } },
  vasuki: { label: "Vasuki", rect: { x: 412, y: 142, w: 453, h: 153 } },
  bs: { label: "BS", rect: { x: 255, y: 302, w: 310, h: 243 } },
  "pak-fadil": { label: "Pak Fadil", rect: { x: 250, y: 548, w: 163, h: 140 } },
  comms: { label: "Comms", rect: { x: 415, y: 540, w: 270, h: 148 } },
  ananta: { label: "CFC Ananta Room", rect: { x: 1105, y: 425, w: 410, h: 235 } },
  nagapadma: { label: "Nagapadma", rect: { x: 875, y: 710, w: 423, h: 125 } },
  "main-office": {
    label: "Main Office", rect: { x: 840, y: 842, w: 635, h: 368 },
    shape: [[840, 842], [1475, 842], [1475, 1210], [1020, 1210], [1020, 1030], [840, 1030]],
  },
  // Added by the owner (Nov 2026): Antareja in Main Office's lower-left corner, and the communal
  // space between Limasan and Pantry.
  antareja: { label: "Antareja", rect: { x: 840, y: 1040, w: 170, h: 170 } },
  communal: { label: "Communal Space", rect: { x: 350, y: 860, w: 225, h: 380 } },
  pantry: { label: "Pantry", rect: { x: 590, y: 930, w: 160, h: 135 } },
  limasan: { label: "Limasan", rect: { x: 40, y: 740, w: 300, h: 400 } },
};

/** "CFC Ananta Room" → "cfc ananta room"; slugs normalize the same way ("cfc-ananta" → "cfc ananta"). */
export const normalizeRoomName = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Normalized WAM room name (or slug) → its spot on the plan. */
const ROOM_SPOTS: Record<string, string> = {
  "cfc ananta room": "ananta", "cfc ananta": "ananta", "ananta room": "ananta", ananta: "ananta",
  nagapadma: "nagapadma",
  vasuki: "vasuki",
  limasan: "limasan",
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
/** Smallest name and subtitle on screen, in CSS px: below that a label is not readable. */
export const NAME_MIN_PX = 9;
export const SUB_MIN_PX = 9;

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

export type SpotText = {
  name: string[]; nameSize: number;
  sub: string[]; subSize: number;
  /** The zoom from which the subtitle is readable (≥ SUB_MIN_PX); Infinity when it never fits the box. */
  subFrom: number;
};

/**
 * How a spot's words sit in its box, in plan units: the name on one line or, when that lets it be
 * bigger, two; never smaller on screen than NAME_MIN_PX (a short box may let it run a little past
 * its edges rather than be unreadable). The subtitle breaks at " · " and spaces, up to three
 * lines, and shows only once the plan is zoomed enough for it to be readable. `unitPx` is screen
 * px per plan unit with the plan fitted (zoom 1); without it the plan is taken as 860px wide.
 */
export function spotText(input: { name: string; sub: string; rect: Pick<Rect, "w" | "h">; main?: boolean; unitPx?: number }): SpotText {
  const { name, sub, rect, main } = input;
  const unitPx = input.unitPx && input.unitPx > 0 ? input.unitPx : 860 / PLAN_W;
  const pad = 24, room = rect.w - pad;
  const floor = Math.min(NAME_MIN_PX / unitPx, 72);
  const top = Math.max(main ? 46 : 34, floor);
  const fit = (lines: string[]) => Math.min(top, room / (Math.max(...lines.map(line => line.length), 3) * CHAR), (rect.h - pad) / (lines.length * 1.2));
  const one = name ? [name] : [];
  const half = Math.ceil(name.length / 2);
  const two = name.includes(" ") ? wrapWords(name, half, 2) : one;
  // Two lines only when they win by a clear margin: one line reads more easily.
  const nameLines = two.length > 1 && fit(two) > fit(one) * 1.25 ? two : one;
  const nameSize = name ? Math.max(fit(nameLines), floor) : 0;
  const nameH = nameLines.length * nameSize * 1.2;
  if (!sub) return { name: nameLines, nameSize, sub: [], subSize: 0, subFrom: Infinity };

  const subTop = main ? 28 : 23;
  const parts = sub.split(" · ");
  const options = [[sub], parts.length > 1 ? [parts[0], parts.slice(1).join(" · ")] : wrapWords(sub, Math.ceil(sub.length / 2), 2), wrapWords(sub, Math.ceil(sub.length / 3), 3)];
  let best: { lines: string[]; size: number } = { lines: [], size: 0 };
  for (const lines of options) {
    const size = Math.min(subTop, room / (Math.max(...lines.map(line => line.length), 3) * CHAR));
    // It must fit under the name, with a gap.
    if (nameH + size * 0.5 + lines.length * size * 1.2 > rect.h - pad / 2) continue;
    if (size > best.size * 1.15) best = { lines, size };
  }
  if (!best.lines.length) return { name: nameLines, nameSize, sub: [], subSize: 0, subFrom: Infinity };
  return { name: nameLines, nameSize, sub: best.lines, subSize: best.size, subFrom: Math.max(1, SUB_MIN_PX / (best.size * unitPx)) };
}

/** "Maks 8 orang · TV, Whiteboard": a room's capacity, fewest people and facilities, for the plan. */
export function roomSpec(room: Pick<Room, "capacity" | "minPeople"> & { facilities?: string[] | null }): string {
  const { capacity, minPeople } = room;
  const people = capacity
    ? minPeople ? `Maks ${capacity} · min ${minPeople}` : `Maks ${capacity} orang`
    : minPeople ? `Min ${minPeople} orang · kapasitas belum diisi` : "Kapasitas belum diisi";
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

/** Spots that a WAM room is named after; the others (people's desks, Comms) carry no name on the plan. */
const ROOM_SPOT_KEYS = new Set(Object.values(ROOM_SPOTS));
export const isRoomSpot = (key: string) => ROOM_SPOT_KEYS.has(key);
const EXTRA_SPOTS = Object.keys(PLAN_SPOTS).filter(key => !ROOM_SPOT_KEYS.has(key));

/**
 * A spot's name for people: a room spot's label ("Vasuki"), else "Spot tambahan 1"… in plan order,
 * so the plan and the super admin never show whose desk a spot was.
 */
export function spotTitle(key: string): string {
  if (isRoomSpot(key)) return PLAN_SPOTS[key].label;
  const index = EXTRA_SPOTS.indexOf(key);
  return index >= 0 ? `Spot tambahan ${index + 1}` : key;
}

/*
 * Zooming and panning the plan like a map. The view is the part of the plan in the box: its zoom
 * (1 = the whole plan fitted) and the plan point at the box's top-left corner, in plan units.
 */
export type PlanView = { scale: number; x: number; y: number };
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const FIT_VIEW: PlanView = { scale: 1, x: 0, y: 0 };

/** The view kept within 1×–4× and with the plan filling the box (never pulled off it). */
export function clampView(view: PlanView): PlanView {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(view.scale) ? view.scale : 1));
  const x = Math.min(PLAN_W - PLAN_W / scale, Math.max(0, view.x || 0));
  const y = Math.min(PLAN_H - PLAN_H / scale, Math.max(0, view.y || 0));
  return { scale, x, y };
}

/**
 * The view at `scale` that keeps the plan point which was under `from` (a point in the box as a
 * share of its width and height, 0–1) now under `to`: zooming at a point (from = to), panning
 * (same scale) and a pinch (both) in one.
 */
export function moveView(start: PlanView, scale: number, from: [number, number], to: [number, number]): PlanView {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
  const px = start.x + from[0] * PLAN_W / start.scale, py = start.y + from[1] * PLAN_H / start.scale;
  return clampView({ scale: next, x: px - to[0] * PLAN_W / next, y: py - to[1] * PLAN_H / next });
}

/** Zoom by `factor` about a point of the box (shares, default its middle). */
export const zoomView = (view: PlanView, factor: number, at: [number, number] = [0.5, 0.5]) => moveView(view, view.scale * factor, at, at);

/** Pans the least that brings `rect` into view (centred when it is bigger than the view). */
export function revealRect(view: PlanView, rect: Rect, margin = 40): PlanView {
  const w = PLAN_W / view.scale, h = PLAN_H / view.scale;
  const axis = (start: number, size: number, from: number, length: number) => {
    if (length + margin * 2 >= size) return from + length / 2 - size / 2;
    if (from - margin < start) return from - margin;
    if (from + length + margin > start + size) return from + length + margin - size;
    return start;
  };
  return clampView({ scale: view.scale, x: axis(view.x, w, rect.x, rect.w), y: axis(view.y, h, rect.y, rect.h) });
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

/** Every spot key with its label, for a picker. */
export const planSpotOptions = () => Object.keys(PLAN_SPOTS).map(key => ({ key, label: spotTitle(key) }));
