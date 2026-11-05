/*
 * Chairs drawn from a room's capacity, for the office floor plan (FloorPlan.tsx). Pure: a room's
 * box in plan units, how many people it holds and how it is set out go in; the furniture and every
 * chair's place and facing come out, all inside the box. Nothing is stored: the database only knows
 * the capacity, the plan picks the layout per spot (floor-plan.ts).
 */

export type Box = { x: number; y: number; w: number; h: number };
/**
 * "rapat": a meeting table along the room's long axis, chairs on both long sides (and one at each
 * end from 6 people up). "kelas": rows of chairs facing a stage on the north wall, split by a centre
 * aisle. "lounge": two sofas facing each other across a coffee table, on a rug.
 */
export type SeatLayout = "rapat" | "kelas" | "lounge";
/** The way the person sitting looks: a chair north of its table faces "s". */
export type Facing = "n" | "s" | "e" | "w";
/** A chair's middle, in plan units. */
export type Chair = { x: number; y: number; facing: Facing };

export type SeatPlan = {
  layout: SeatLayout;
  /** The people the room holds (0 when not filled in). */
  capacity: number;
  /** Chairs drawn: fewer than `capacity` when they do not fit even at the tightest spacing. */
  drawn: number;
  chairs: Chair[];
  /** The part of the box chairs and furniture stay in: inside the margin, below the words. */
  area: Box;
  /** Meeting table (rapat) or coffee table (lounge). */
  table: Box | null;
  /** A round meeting table instead of `table` (a small square room such as the pantry). */
  roundTable: { cx: number; cy: number; r: number } | null;
  /** The stage or screen on the north wall (kelas). */
  stage: Box | null;
  sofas: Box[];
  rug: Box | null;
};

/** A chair: its width along the table and its depth (seat and backrest). */
export const CHAIR_W = 26;
export const CHAIR_D = 22;
/** Between a chair and its table. */
const GAP = 5;
/** Chair to chair along a table: roomy, and the tightest before chairs are dropped. */
export const PITCH = 36;
export const PITCH_MIN = CHAIR_W + 3;
const TABLE_W_MIN = 18;
const TABLE_W_MAX = 70;
/** Class rows, front to back; and the centre aisle. */
const ROW = CHAIR_D + 18;
const ROW_MIN = CHAIR_D + 6;
const AISLE = 28;
const AISLE_MIN = 16;
const STAGE_H = 22;
const STAGE_GAP = 18;
/** Sofa cushions sit closer than chairs; the frame adds this round them. */
const CUSHION = CHAIR_W + 4;
const CUSHION_MIN = CHAIR_W + 1;
const SOFA_PAD = 4;
const LEG_ROOM = 12;
const ROUND_R_MIN = 8;

/** A chair's outline: CHAIR_W wide along the way it faces across, CHAIR_D deep. */
export function chairBox(chair: Chair): Box {
  const across = chair.facing === "n" || chair.facing === "s";
  const w = across ? CHAIR_W : CHAIR_D, h = across ? CHAIR_D : CHAIR_W;
  return { x: chair.x - w / 2, y: chair.y - h / 2, w, h };
}

const empty = (layout: SeatLayout, capacity: number, area: Box): SeatPlan => ({
  layout, capacity, drawn: 0, chairs: [], area, table: null, roundTable: null, stage: null, sofas: [], rug: null,
});

/**
 * Where the chairs go in a room. `box` is the room (plan units), `top` the space its name takes at
 * the top, `margin` the gap kept from the walls (default 10). When `capacity` chairs do not fit,
 * the spacing shrinks to its minimum first; past that only as many as fit are drawn (`drawn`).
 * Capacity 0 still sets out the furniture (a table, the stage, the sofas) without chairs.
 */
export function seatPlan(input: { box: Box; capacity: number | null | undefined; layout: SeatLayout; top?: number; margin?: number; round?: boolean }): SeatPlan {
  const { box, layout } = input;
  const capacity = Math.max(0, Math.floor(Number(input.capacity) || 0));
  const margin = input.margin ?? 10;
  const top = Math.max(input.top ?? 0, margin);
  const area = { x: box.x + margin, y: box.y + top, w: box.w - margin * 2, h: box.h - top - margin };
  if (area.w <= 0 || area.h <= 0) return empty(layout, capacity, { ...area, w: Math.max(0, area.w), h: Math.max(0, area.h) });
  const plan = layout === "kelas" ? kelas(area, capacity) : layout === "lounge" ? lounge(area, capacity) : input.round ? round(area, capacity) : rapat(area, capacity);
  return { ...empty(layout, capacity, area), ...plan, drawn: plan.chairs.length };
}

type Layout = { chairs: Chair[] } & Partial<Pick<SeatPlan, "table" | "roundTable" | "stage" | "sofas" | "rug">>;

function rapat(area: Box, people: number): Layout {
  const flat = area.w >= area.h;
  const long = flat ? area.w : area.h, across = flat ? area.h : area.w;
  const reach = CHAIR_D + GAP;
  const sides = across >= reach * 2 + TABLE_W_MIN ? 2 : across >= reach + TABLE_W_MIN ? 1 : 0;
  if (!sides || long < CHAIR_W) return { chairs: [] };
  const tableW = Math.min(TABLE_W_MAX, across - reach * sides);

  const option = (ends: boolean) => {
    const run = long - (ends ? reach * 2 : 0);
    const want = Math.max(0, people - (ends ? 2 : 0));
    const most = Math.max(0, Math.floor(run / PITCH_MIN));
    const per = Math.min(Math.ceil(want / sides), most);
    const onSides = Math.min(want, per * sides);
    return { ends, run, per, onSides, pitch: per > 0 ? Math.min(PITCH, run / per) : PITCH, total: onSides + (ends ? 2 : 0) };
  };
  let best = option(false);
  if (people >= 6) {
    const withEnds = option(true);
    if (withEnds.run > 0 && withEnds.total >= best.total) best = withEnds;
  }
  const length = best.per > 0 ? best.per * best.pitch : Math.min(best.run, PITCH * 2);

  // Along: the table's middle is the area's. Across: the chairs and the table as one block, centred.
  const midAlong = flat ? area.x + area.w / 2 : area.y + area.h / 2;
  const block = reach * sides + tableW;
  const startAcross = (flat ? area.y + area.h / 2 : area.x + area.w / 2) - block / 2;
  const tableFrom = startAcross + reach;
  const tableMid = tableFrom + tableW / 2;
  const at = (along: number, over: number, facing: Facing): Chair => flat ? { x: along, y: over, facing } : { x: over, y: along, facing };

  const chairs: Chair[] = [];
  const first = Math.ceil(best.onSides / sides), second = best.onSides - first;
  const row = (count: number, over: number, facing: Facing) => {
    const from = midAlong - (count * best.pitch) / 2;
    for (let index = 0; index < count; index++) chairs.push(at(from + best.pitch * (index + 0.5), over, facing));
  };
  row(first, tableFrom - GAP - CHAIR_D / 2, flat ? "s" : "e");
  if (sides === 2) row(second, tableFrom + tableW + GAP + CHAIR_D / 2, flat ? "n" : "w");
  if (best.ends) {
    const off = length / 2 + GAP + CHAIR_D / 2;
    chairs.push(at(midAlong - off, tableMid, flat ? "e" : "s"), at(midAlong + off, tableMid, flat ? "w" : "n"));
  }
  const table = flat
    ? { x: midAlong - length / 2, y: tableFrom, w: length, h: tableW }
    : { x: tableFrom, y: midAlong - length / 2, w: tableW, h: length };
  return { chairs, table: length > 0 ? table : null };
}

function round(area: Box, people: number): Layout {
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
  const half = Math.min(area.w, area.h) / 2;
  const ringAt = (count: number, radius: number): Chair[] => Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const facing: Facing = Math.abs(dx) > Math.abs(dy) + 1e-9 ? (dx > 0 ? "w" : "e") : (dy > 0 ? "n" : "s");
    return { x: cx + radius * dx, y: cy + radius * dy, facing };
  });
  // The table reaches to GAP short of the nearest chair.
  const tableR = (chairs: Chair[], radius: number) => chairs.length
    ? Math.min(...chairs.map(chairBox).map(box => Math.hypot(Math.max(box.x - cx, 0, cx - box.x - box.w), Math.max(box.y - cy, 0, cy - box.y - box.h)))) - GAP
    : radius - GAP - CHAIR_D / 2;
  const fits = (chairs: Chair[], radius: number, spare: number) => {
    const boxes = chairs.map(chairBox);
    if (boxes.some(box => box.x < area.x || box.y < area.y || box.x + box.w > area.x + area.w || box.y + box.h > area.y + area.h)) return false;
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const one = boxes[a], two = boxes[b];
      if (one.x < two.x + two.w + spare && two.x < one.x + one.w + spare && one.y < two.y + two.h + spare && two.y < one.y + one.h + spare) return false;
    }
    return tableR(chairs, radius) >= ROUND_R_MIN;
  };
  // Most people first; for each count roomy spacing, then tight; the smallest ring that works.
  const start = ROUND_R_MIN + GAP + CHAIR_D / 2;
  for (let count = Math.min(people, 16); count > 0; count--) {
    for (const spare of [6, 1]) {
      for (let radius = start; radius <= half; radius += 1) {
        const chairs = ringAt(count, radius);
        if (fits(chairs, radius, spare)) return { chairs, roundTable: { cx, cy, r: tableR(chairs, radius) } };
      }
    }
  }
  return { chairs: [], roundTable: { cx, cy, r: Math.max(6, Math.min(half - 4, start)) } };
}

function kelas(area: Box, people: number): Layout {
  const stageH = Math.min(STAGE_H, area.h * 0.15);
  const stage = { x: area.x + area.w * 0.12, y: area.y, w: area.w * 0.76, h: stageH };
  const rowsTop = stage.y + stageH + STAGE_GAP;
  const height = area.y + area.h - rowsTop;
  const mid = area.x + area.w / 2;

  type Grid = { columns: number[]; rows: number; pitchRow: number };
  const grid = (share: number): Grid => {
    const pitch = PITCH_MIN + share * (PITCH - PITCH_MIN);
    const pitchRow = ROW_MIN + share * (ROW - ROW_MIN);
    const aisle = AISLE_MIN + share * (AISLE - AISLE_MIN);
    const perHalf = Math.floor((area.w - aisle) / 2 / pitch);
    const columns: number[] = [];
    if (perHalf >= 1) {
      // Nearest the aisle first, left and right in turn: a short row gathers in the middle.
      for (let index = 0; index < perHalf; index++) columns.push(mid - aisle / 2 - pitch * (index + 0.5), mid + aisle / 2 + pitch * (index + 0.5));
    } else {
      const count = Math.floor(area.w / pitch);
      for (let index = 0; index < count; index++) columns.push(mid + pitch * (index - (count - 1) / 2));
    }
    const rows = height >= CHAIR_D ? 1 + Math.floor((height - CHAIR_D) / pitchRow) : 0;
    return { columns, rows, pitchRow };
  };
  let chosen = grid(1);
  for (const share of [1, 0.75, 0.5, 0.25, 0]) {
    chosen = grid(share);
    if (chosen.columns.length * chosen.rows >= people) break;
  }
  const chairs: Chair[] = [];
  for (let row = 0; row < chosen.rows && chairs.length < people; row++) {
    const y = rowsTop + CHAIR_D / 2 + row * chosen.pitchRow;
    for (const x of chosen.columns) {
      if (chairs.length >= people) break;
      chairs.push({ x, y, facing: "n" });
    }
  }
  return { chairs, stage: stageH > 0 ? stage : null };
}

function lounge(area: Box, people: number): Layout {
  const flat = area.w >= area.h;
  const long = flat ? area.w : area.h, across = flat ? area.h : area.w;
  const depth = CHAIR_D + SOFA_PAD * 2;
  const sides = across >= depth * 2 + LEG_ROOM * 2 + 14 ? 2 : across >= depth + LEG_ROOM + 14 ? 1 : 0;
  if (!sides) return { chairs: [] };
  const run = long - SOFA_PAD * 2;
  const most = Math.max(0, Math.floor(run / CUSHION_MIN));
  const per = people > 0 ? Math.min(Math.ceil(people / sides), most) : Math.min(3, most);
  if (per <= 0) return { chairs: [] };
  const pitch = Math.min(CUSHION, run / per);
  const sofaLen = per * pitch + SOFA_PAD * 2;
  const tableAcross = Math.min(34, across - (depth + LEG_ROOM) * sides);
  const tableLen = Math.max(Math.min(40, sofaLen), Math.min(sofaLen * 0.6, long * 0.5));

  const midAlong = flat ? area.x + area.w / 2 : area.y + area.h / 2;
  const block = (depth + LEG_ROOM) * sides + tableAcross;
  const start = (flat ? area.y + area.h / 2 : area.x + area.w / 2) - block / 2;
  const box = (along: number, over: number, alongLen: number, overLen: number): Box => flat
    ? { x: along, y: over, w: alongLen, h: overLen } : { x: over, y: along, w: overLen, h: alongLen };
  const at = (along: number, over: number, facing: Facing): Chair => flat ? { x: along, y: over, facing } : { x: over, y: along, facing };

  const sofas: Box[] = [];
  const chairs: Chair[] = [];
  const seated = Math.min(people, per * sides);
  const counts = sides === 2 ? [Math.ceil(seated / 2), Math.floor(seated / 2)] : [seated];
  const tableFrom = start + depth + LEG_ROOM;
  const sofaFrom = [start, tableFrom + tableAcross + LEG_ROOM];
  for (let side = 0; side < sides; side++) {
    sofas.push(box(midAlong - sofaLen / 2, sofaFrom[side], sofaLen, depth));
    const over = sofaFrom[side] + depth / 2;
    const facing: Facing = side === 0 ? (flat ? "s" : "e") : (flat ? "n" : "w");
    const count = counts[side];
    const from = midAlong - (count * pitch) / 2;
    for (let index = 0; index < count; index++) chairs.push(at(from + pitch * (index + 0.5), over, facing));
  }
  const table = box(midAlong - tableLen / 2, tableFrom, tableLen, tableAcross);
  const spread = Math.max(sofaLen, tableLen);
  const rugLong = Math.min(long, spread + 20), rugAcross = Math.min(across, block + 12);
  const rug = box(midAlong - rugLong / 2, start + block / 2 - rugAcross / 2, rugLong, rugAcross);
  return { chairs, sofas, table, rug };
}

const n1 = (value: number) => Math.round(value * 10) / 10;
/** A rounded rectangle as path commands. */
export function roundedRect({ x, y, w, h }: Box, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M${n1(x + r)} ${n1(y)}h${n1(w - r * 2)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(r)} ${n1(r)}v${n1(h - r * 2)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(-r)} ${n1(r)}`
    + `h${n1(r * 2 - w)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(-r)} ${n1(-r)}v${n1(r * 2 - h)}a${n1(r)} ${n1(r)} 0 0 1 ${n1(r)} ${n1(-r)}z`;
}

const BACK = 6;
/**
 * Every chair as two paths, for one <path> each per room: the seats (rounded) and the backrests
 * (a bar along the side the person turns their back to).
 */
export function chairPaths(chairs: Chair[]): { seat: string; back: string } {
  let seat = "", back = "";
  for (const chair of chairs) {
    const { x, y, w, h } = chairBox(chair);
    const bar: Box = chair.facing === "s" ? { x, y, w, h: BACK } : chair.facing === "n" ? { x, y: y + h - BACK, w, h: BACK }
      : chair.facing === "e" ? { x, y, w: BACK, h } : { x: x + w - BACK, y, w: BACK, h };
    const cushion: Box = chair.facing === "s" ? { x: x + 2, y: y + BACK - 2, w: w - 4, h: h - BACK + 1 } : chair.facing === "n" ? { x: x + 2, y: y + 1, w: w - 4, h: h - BACK + 1 }
      : chair.facing === "e" ? { x: x + BACK - 2, y: y + 2, w: w - BACK + 1, h: h - 4 } : { x: x + 1, y: y + 2, w: w - BACK + 1, h: h - 4 };
    seat += roundedRect(cushion, 5);
    back += roundedRect(bar, 3);
  }
  return { seat, back };
}
