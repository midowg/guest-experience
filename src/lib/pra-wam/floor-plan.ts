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

/** Every room drawn on the plan, keyed by the slug the booking HTML uses. */
export const PLAN_SPOTS: Record<string, { label: string; rect: Rect }> = {
  "pak-bagus": { label: "Pak Bagus", rect: { x: 255, y: 165, w: 155, h: 135 } },
  vasuki: { label: "Vasuki", rect: { x: 412, y: 142, w: 453, h: 153 } },
  bs: { label: "BS", rect: { x: 255, y: 302, w: 310, h: 243 } },
  "pak-fadil": { label: "Pak Fadil", rect: { x: 250, y: 548, w: 163, h: 140 } },
  comms: { label: "Comms", rect: { x: 415, y: 540, w: 270, h: 148 } },
  ananta: { label: "CFC Ananta Room", rect: { x: 1105, y: 425, w: 410, h: 235 } },
  nagapadma: { label: "Nagapadma", rect: { x: 875, y: 710, w: 423, h: 125 } },
  "main-office": { label: "Main Office", rect: { x: 840, y: 842, w: 635, h: 368 } },
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
};

/** Which spot a WAM room takes: by its name first, then by its slug; null when it has none. */
export function planKey(room: Pick<Room, "name" | "slug">): string | null {
  return ROOM_SPOTS[normalizeRoomName(room.name)] ?? ROOM_SPOTS[normalizeRoomName(room.slug ?? "")] ?? null;
}

/**
 * The plan for a list of WAM rooms: the rooms with a spot, the spots no WAM room takes (drawn grey,
 * never bookable), and the WAM rooms without a spot (listed below the plan).
 */
export function layoutRooms<R extends Pick<Room, "id" | "name" | "slug">>(rooms: R[]) {
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
export const fitText = (label: string, width: number, max: number) => Math.max(14, Math.min(max, (width - 24) / (Math.max(label.length, 3) * 0.68)));
