import { describe, expect, it } from "vitest";
import { CHAIR_D, CHAIR_W, PITCH, chairBox, chairPaths, roundedRect, seatPlan, type Box, type SeatLayout, type SeatPlan } from "./seating";

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const inside = (inner: Box, outer: Box) => inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01;

/** Every promise the plan makes: inside the room (margin, below the words), no chair on another or on a table. */
function check(plan: SeatPlan, box: Box, top = 0, margin = 10) {
  const room = { x: box.x + margin, y: box.y + Math.max(top, margin), w: box.w - margin * 2, h: box.h - Math.max(top, margin) - margin };
  expect(plan.area).toEqual(room);
  expect(plan.drawn).toBe(plan.chairs.length);
  expect(plan.drawn).toBeLessThanOrEqual(plan.capacity);
  const boxes = plan.chairs.map(chairBox);
  for (const [index, chair] of boxes.entries()) {
    expect(inside(chair, room), `chair ${index} inside`).toBe(true);
    for (const other of boxes.slice(index + 1)) expect(overlap(chair, other), `chair ${index} apart`).toBe(false);
    for (const fixed of [plan.table, plan.stage].filter((item): item is Box => !!item)) expect(overlap(chair, fixed), `chair ${index} off the table`).toBe(false);
    if (plan.roundTable) {
      const { cx, cy, r } = plan.roundTable;
      const nearX = Math.max(chair.x, Math.min(cx, chair.x + chair.w)), nearY = Math.max(chair.y, Math.min(cy, chair.y + chair.h));
      expect(Math.hypot(nearX - cx, nearY - cy)).toBeGreaterThanOrEqual(r);
    }
  }
  for (const item of [plan.table, plan.stage, plan.rug, ...plan.sofas].filter((item): item is Box => !!item)) expect(inside(item, room)).toBe(true);
  if (plan.roundTable) {
    const { cx, cy, r } = plan.roundTable;
    expect(inside({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, room)).toBe(true);
  }
}

describe("meeting table (rapat)", () => {
  const box = { x: 100, y: 200, w: 300, h: 170 };
  it("sits chairs on both long sides of a table along the long axis, facing it", () => {
    const plan = seatPlan({ box, capacity: 4, layout: "rapat", top: 50 });
    check(plan, box, 50);
    expect(plan.drawn).toBe(4);
    expect(plan.table!.w).toBeGreaterThan(plan.table!.h);
    expect(plan.chairs.map(chair => chair.facing).sort()).toEqual(["n", "n", "s", "s"]);
    // North of the table they face south, and the other way round.
    for (const chair of plan.chairs) expect(chair.facing === "s" ? chair.y < plan.table!.y : chair.y > plan.table!.y + plan.table!.h).toBe(true);
  });
  it("adds one chair at each end from 6 people up", () => {
    const five = seatPlan({ box, capacity: 5, layout: "rapat" });
    expect(five.chairs.filter(chair => chair.facing === "e" || chair.facing === "w")).toHaveLength(0);
    const six = seatPlan({ box, capacity: 6, layout: "rapat" });
    check(six, box);
    expect(six.chairs.filter(chair => chair.facing === "e")).toHaveLength(1);
    expect(six.chairs.filter(chair => chair.facing === "w")).toHaveLength(1);
    expect(six.drawn).toBe(6);
  });
  it("runs the table up a tall, narrow room", () => {
    const tall = { x: 505, y: 875, w: 125, h: 354 };
    const plan = seatPlan({ box: tall, capacity: 8, layout: "rapat", top: 80 });
    check(plan, tall, 80);
    expect(plan.drawn).toBe(8);
    expect(plan.table!.h).toBeGreaterThan(plan.table!.w);
    expect(new Set(plan.chairs.map(chair => chair.facing))).toEqual(new Set(["e", "w", "s", "n"]));
  });
  it("tightens the spacing before it drops chairs, and says how many it drew", () => {
    const small = { x: 0, y: 0, w: 200, h: 110 };
    const roomy = seatPlan({ box: small, capacity: 4, layout: "rapat" });
    const pitch = (plan: SeatPlan) => Math.abs(plan.chairs[1].x - plan.chairs[0].x);
    expect(pitch(roomy)).toBeCloseTo(PITCH);
    const tight = seatPlan({ box: small, capacity: 10, layout: "rapat" });
    check(tight, small);
    expect(pitch(tight)).toBeLessThan(PITCH);
    expect(pitch(tight)).toBeGreaterThanOrEqual(CHAIR_W + 3);
    const over = seatPlan({ box: small, capacity: 40, layout: "rapat" });
    check(over, small);
    expect(over.capacity).toBe(40);
    expect(over.drawn).toBeGreaterThan(0);
    expect(over.drawn).toBeLessThan(40);
  });
  it("sets out a table without chairs when the capacity is not filled in, and nothing when the room is too small", () => {
    const none = seatPlan({ box, capacity: null, layout: "rapat" });
    expect(none.drawn).toBe(0);
    expect(none.table).not.toBeNull();
    const tiny = seatPlan({ box: { x: 0, y: 0, w: 40, h: 40 }, capacity: 4, layout: "rapat" });
    expect(tiny.drawn).toBe(0);
    const covered = seatPlan({ box, capacity: 4, layout: "rapat", top: 400 });
    expect(covered.drawn).toBe(0);
    expect(covered.area.h).toBe(0);
  });
  it("can sit people round a round table", () => {
    const square = { x: 275, y: 590, w: 135, h: 160 };
    for (const capacity of [1, 2, 4, 6, 30]) {
      const plan = seatPlan({ box: square, capacity, layout: "rapat", round: true, top: 40 });
      check(plan, square, 40);
      expect(plan.roundTable).not.toBeNull();
      expect(plan.table).toBeNull();
      if (capacity <= 4) expect(plan.drawn).toBe(capacity);
    }
  });
});

describe("class rows (kelas)", () => {
  const box = { x: 200, y: 40, w: 400, h: 300 };
  it("faces every chair north, to a stage on the north wall, with a centre aisle", () => {
    const plan = seatPlan({ box, capacity: 24, layout: "kelas", top: 70 });
    check(plan, box, 70);
    expect(plan.drawn).toBe(24);
    expect(plan.stage!.y).toBe(plan.area.y);
    expect(plan.chairs.every(chair => chair.facing === "n" && chair.y > plan.stage!.y + plan.stage!.h)).toBe(true);
    const middle = box.x + box.w / 2;
    expect(plan.chairs.some(chair => Math.abs(chair.x - middle) < CHAIR_W / 2)).toBe(false);
    expect(plan.chairs.filter(chair => chair.x < middle).length).toBe(plan.chairs.filter(chair => chair.x > middle).length);
  });
  it("squeezes rows for a big group and caps what does not fit", () => {
    const forty = seatPlan({ box, capacity: 40, layout: "kelas", top: 70 });
    check(forty, box, 70);
    expect(forty.drawn).toBe(40);
    const many = seatPlan({ box, capacity: 500, layout: "kelas", top: 70 });
    check(many, box, 70);
    expect(many.drawn).toBeLessThan(500);
    expect(many.drawn).toBeGreaterThan(40);
  });
  it("keeps the stage with no capacity", () => {
    const plan = seatPlan({ box, capacity: 0, layout: "kelas" });
    expect(plan.drawn).toBe(0);
    expect(plan.stage).not.toBeNull();
  });
});

describe("lounge", () => {
  const box = { x: 20, y: 765, w: 380, h: 225 };
  it("seats people on two sofas facing each other over a coffee table, on a rug", () => {
    const plan = seatPlan({ box, capacity: 6, layout: "lounge", top: 70 });
    check(plan, box, 70);
    expect(plan.drawn).toBe(6);
    expect(plan.sofas).toHaveLength(2);
    expect(plan.table).not.toBeNull();
    expect(plan.rug).not.toBeNull();
    for (const sofa of plan.sofas) expect(overlap(sofa, plan.table!)).toBe(false);
    // Each cushion is on a sofa.
    for (const chair of plan.chairs) expect(plan.sofas.some(sofa => inside(chairBox(chair), sofa))).toBe(true);
  });
  it("keeps the sofas without capacity, and caps a crowd", () => {
    const none = seatPlan({ box, capacity: null, layout: "lounge", top: 70 });
    expect(none.drawn).toBe(0);
    expect(none.sofas).toHaveLength(2);
    const crowd = seatPlan({ box, capacity: 60, layout: "lounge", top: 70 });
    check(crowd, box, 70);
    expect(crowd.drawn).toBeLessThan(60);
  });
});

describe("chair drawing", () => {
  it("outlines a chair by its facing", () => {
    expect(chairBox({ x: 50, y: 50, facing: "s" })).toEqual({ x: 50 - CHAIR_W / 2, y: 50 - CHAIR_D / 2, w: CHAIR_W, h: CHAIR_D });
    expect(chairBox({ x: 50, y: 50, facing: "e" })).toEqual({ x: 50 - CHAIR_D / 2, y: 50 - CHAIR_W / 2, w: CHAIR_D, h: CHAIR_W });
  });
  it("draws all of a room's chairs as one seat path and one backrest path", () => {
    const plan = seatPlan({ box: { x: 0, y: 0, w: 300, h: 170 }, capacity: 8, layout: "rapat" });
    const { seat, back } = chairPaths(plan.chairs);
    expect(seat.match(/M/g)).toHaveLength(8);
    expect(back.match(/M/g)).toHaveLength(8);
    expect(chairPaths([])).toEqual({ seat: "", back: "" });
    expect(roundedRect({ x: 0, y: 0, w: 10, h: 10 }, 2)).toMatch(/^M2 0h6a2 2 0 0 1 2 2v6/);
  });
  it.each<SeatLayout>(["rapat", "kelas", "lounge"])("never leaves the box for %s, at any size", layout => {
    for (const w of [60, 125, 170, 240, 400]) for (const h of [60, 125, 170, 354]) for (const capacity of [0, 1, 3, 6, 12, 40]) {
      const box = { x: 7, y: 9, w, h };
      check(seatPlan({ box, capacity, layout, top: 30 }), box, 30);
    }
  });
});
