import { describe, expect, it } from "vitest";
import { wibInstant, type Room } from "./appraisal";
import {
  BUILDING, FIT_VIEW, FIXTURES, NAME_MIN_PX, PLAN_H, PLAN_SPOTS, PLAN_W, ROOM_COUNT, SITE, SUB_MIN_PX, ZOOM_MAX, clampView, facilitiesProblem, fitText, isRoomSpot, layoutRooms, moveView,
  normalizeRoomName, parseFacilities, pickableTone, placeRooms, planKey, planSpotOptions, quietName, revealRect, roomBox, roomSeats, roomSpec, roomStatus, spotLayout, spotText, spotTitle,
  spotWords, wordsBand, wrapWords, zoomView, SEAT_SCALE, type Rect,
} from "./floor-plan";
import { seatPlan } from "./seating";

const within = (inner: Rect, outer: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const apart = (a: Rect, b: Rect) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
const corners = ({ x, y, w, h }: Rect): [number, number][] => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
/** Whether a point is inside a polygon or on its edge. */
function inside(shape: [number, number][], [px, py]: [number, number]) {
  let hit = false;
  for (let index = 0, last = shape.length - 1; index < shape.length; last = index++) {
    const [x1, y1] = shape[index], [x2, y2] = shape[last];
    const onEdge = (px - x1) * (y2 - y1) === (py - y1) * (x2 - x1) && px >= Math.min(x1, x2) && px <= Math.max(x1, x2) && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
    if (onEdge) return true;
    if ((y1 > py) !== (y2 > py) && px < (x2 - x1) * (py - y1) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
}

const room = (name: string, slug = name.toLowerCase().replace(/\s+/g, "-"), bookable = true): Room => ({ id: slug, slug, name, kind: "utama", capacity: null, bookable, minPeople: null, planKey: null, facilities: [] });
/** The rooms as seeded in production (migration 202611040001). */
const production = [
  room("CFC Ananta Room", "cfc-ananta"), room("Nagapadma"), room("Vasuki"),
  room("Limasan", "limasan", false), room("Pantry", "pantry", false), room("Main Office", "main-office", false), room("Communal Space", "komunal", false), room("Antareja"),
];

describe("room names on the plan", () => {
  it("normalizes case, spaces and punctuation", () => {
    expect(normalizeRoomName("  CFC  Ananta-Room ")).toBe("cfc ananta room");
    expect(normalizeRoomName("main-office")).toBe("main office");
  });
  it("places every production room that has a spot, by name", () => {
    expect(production.map(planKey)).toEqual(["ananta", "nagapadma", "vasuki", "limasan", "pantry", "main-office", "communal", "antareja"]);
  });
  it("falls back to the slug when the name changes, and ignores unknown rooms", () => {
    expect(planKey({ name: "Ruang Ananta (CFC)", slug: "cfc-ananta" })).toBe("ananta");
    expect(planKey({ name: "Ruang baru", slug: "ruang-baru" })).toBeNull();
  });
  it("splits rooms into placed, other spots (not WAM) and unplaced", () => {
    const { placed, others, unplaced } = layoutRooms(production);
    expect(placed.map(item => item.key).sort()).toEqual(["ananta", "antareja", "communal", "limasan", "main-office", "nagapadma", "pantry", "vasuki"]);
    const numbered = [1, ...Array.from({ length: 16 }, (_, index) => index + 4), 21, 22, 27, 29, 30, 31];
    expect(others.map(item => item.key).sort()).toEqual(["mushola", ...numbered.map(number => `ruang-${number}`)].sort());
    expect(unplaced).toEqual([]);
  });
  it("gives a spot to one room only", () => {
    const { placed, unplaced } = layoutRooms([room("Vasuki", "vasuki"), room("vasuki", "vasuki-2")]);
    expect(placed).toHaveLength(1);
    expect(unplaced.map(item => item.slug)).toEqual(["vasuki-2"]);
  });
  it("is turned so north (Limasan) is up: river along the top, the office on the west, the upper building on the east", () => {
    expect(PLAN_W).toBe(1043);
    expect(PLAN_H).toBe(1600);
    expect(PLAN_H).toBeGreaterThan(PLAN_W);
    const spot = (key: string) => PLAN_SPOTS[key].rect;
    expect(spot("limasan").y).toBeLessThan(spot("communal").y);
    expect(spot("limasan").y).toBeLessThan(spot("nagapadma").y);
    expect(spot("ananta").y).toBeGreaterThan(spot("nagapadma").y);
    // Main Office is west of Nagapadma; the upper building (Vasuki, Ruang 19) east of the office.
    expect(spot("main-office").x).toBeLessThan(spot("nagapadma").x);
    expect(spot("vasuki").x).toBeGreaterThan(spot("nagapadma").x + spot("nagapadma").w);
    expect(spot("ruang-19").x).toBeGreaterThan(spot("main-office").x + spot("main-office").w);
    // The river is the top strip, the road the bottom one.
    const water = SITE.find(item => item.kind === "water")!.rect, road = SITE.find(item => item.kind === "road")!.rect;
    expect(water).toMatchObject({ x: 0, y: 0, w: PLAN_W });
    expect(road.y + road.h).toBe(PLAN_H);
    expect(within(BUILDING, { x: 0, y: 0, w: PLAN_W, h: PLAN_H })).toBe(true);
  });
  it("gives every numbered room a spot, the named rooms keeping their keys", () => {
    expect(ROOM_COUNT).toBe(31);
    const named: Record<string, number> = { mushola: 20, nagapadma: 23, ananta: 24, pantry: 25, "main-office": 26, antareja: 28 };
    for (const [key, number] of Object.entries(named)) {
      expect(PLAN_SPOTS[key].rect, key).toEqual(roomBox(number));
      expect(PLAN_SPOTS[key].rooms).toEqual([number]);
    }
    for (let number = 1; number <= ROOM_COUNT; number++) {
      const covered = Object.values(PLAN_SPOTS).filter(spot => spot.rooms.includes(number));
      expect(covered, `room ${number}`).toHaveLength(1);
      const key = Object.keys(PLAN_SPOTS).find(item => PLAN_SPOTS[item].rooms.includes(number))!;
      if (!Object.values(named).includes(number) && number !== 2 && number !== 3) {
        expect(key).toBe(`ruang-${number}`);
        expect(PLAN_SPOTS[key].label).toBe(`Ruang ${number}`);
      }
    }
    // 31 traced rooms (2 and 3 one spot, Vasuki), Communal Space and Limasan's terrace.
    expect(Object.keys(PLAN_SPOTS)).toHaveLength(32);
    for (const gone of ["pak-bagus", "bs", "pak-fadil", "comms"]) expect(PLAN_SPOTS[gone]).toBeUndefined();
    expect(PLAN_SPOTS.ananta.label).toBe("CFC Ananta Room");
  });
  it("has Vasuki as one spot over rooms 2 and 3, with a dashed divider between them", () => {
    const vasuki = PLAN_SPOTS.vasuki, two = roomBox(2), three = roomBox(3);
    expect(vasuki.rooms).toEqual([2, 3]);
    expect(within(two, vasuki.rect)).toBe(true);
    expect(within(three, vasuki.rect)).toBe(true);
    const [[x1, y1], [x2, y2]] = vasuki.divider!;
    // Across the room (turned: a horizontal line), between the two boxes.
    expect(y1).toBe(y2);
    const [first, second] = [two, three].sort((a, b) => a.y - b.y);
    expect(y1).toBeGreaterThanOrEqual(first.y + first.h);
    expect(y1).toBeLessThanOrEqual(second.y);
    expect(Math.min(x1, x2)).toBeGreaterThanOrEqual(vasuki.rect.x);
    expect(Math.max(x1, x2)).toBeLessThanOrEqual(vasuki.rect.x + vasuki.rect.w);
  });
  it("puts Communal Space round the courtyard plant, clear of Pantry and every room", () => {
    const communal = PLAN_SPOTS.communal;
    expect(communal.open).toBe(true);
    expect(apart(communal.rect, PLAN_SPOTS.pantry.rect)).toBe(true);
    for (const [key, spot] of Object.entries(PLAN_SPOTS)) if (key !== "communal") expect(apart(communal.rect, spot.rect), key).toBe(true);
    const plants = FIXTURES.filter(item => item.kind === "plant");
    expect(plants.some(plant => within(plant.rect, communal.rect))).toBe(true);
  });
  it("keeps Main Office's L clear of rooms 27 and 28, its words in its wide part", () => {
    const office = PLAN_SPOTS["main-office"];
    expect(office.shape).toHaveLength(8);
    expect(office.bare).toBe(true);
    for (const key of ["ruang-27", "antareja"]) {
      const { x, y, w, h } = PLAN_SPOTS[key].rect;
      expect(inside(office.shape!, [x + w / 2, y + h / 2]), key).toBe(false);
      expect(within(PLAN_SPOTS[key].rect, office.rect)).toBe(true);
    }
    const words = office.textRect!;
    expect(within(words, office.rect)).toBe(true);
    for (const corner of corners(words)) expect(inside(office.shape!, corner)).toBe(true);
    expect(words.w).toBeGreaterThan(words.h * 4);
  });
  it("sets out Limasan in class rows, Communal Space as a lounge, the rest round a table", () => {
    expect(spotLayout("limasan")).toBe("kelas");
    expect(spotLayout("communal")).toBe("lounge");
    expect(["nagapadma", "ananta", "vasuki", "antareja", "pantry", "main-office", "ruang-5"].map(spotLayout)).toEqual(Array(7).fill("rapat"));
    expect(spotLayout("gudang")).toBe("rapat");
    expect(PLAN_SPOTS.pantry.round).toBeUndefined();
    expect(PLAN_SPOTS.limasan.marks).toMatch(/^M/);
    // Limasan is the pendopo on the terrace above the Mushola (room 20), not room 20 itself (9 Nov 2026).
    expect(PLAN_SPOTS.mushola.label).toBe("Mushola");
    expect(PLAN_SPOTS.limasan.rooms).toEqual([]);
    expect(PLAN_SPOTS.limasan.rect.y + PLAN_SPOTS.limasan.rect.h).toBeLessThanOrEqual(PLAN_SPOTS.mushola.rect.y);
  });
  it("puts each door on its room's wall, and the fixtures where no room is (plants) or inside Main Office", () => {
    const doors = Object.entries(PLAN_SPOTS).filter(([, spot]) => spot.door);
    expect(doors.map(([key]) => key)).toEqual(expect.arrayContaining(["nagapadma", "ananta", "pantry", "antareja", "main-office"]));
    for (const [key, spot] of doors) {
      const [[x1, y1], [x2, y2]] = spot.door!;
      const { x, y, w, h } = spot.rect;
      const onWall = (x1 === x2 && (x1 === x || x1 === x + w)) || (y1 === y2 && (y1 === y || y1 === y + h));
      expect(onWall, `${key}'s door`).toBe(true);
    }
    const office = PLAN_SPOTS["main-office"];
    for (const fixture of FIXTURES) {
      expect(within(fixture.rect, BUILDING)).toBe(true);
      if (fixture.kind === "plant") {
        for (const [key, spot] of Object.entries(PLAN_SPOTS)) if (key !== "communal") expect(apart(fixture.rect, spot.rect), `plant clear of ${key}`).toBe(true);
      } else {
        for (const corner of corners(fixture.rect)) expect(inside(office.shape!, corner), fixture.kind).toBe(true);
        expect(apart(fixture.rect, office.textRect!)).toBe(true);
      }
    }
    expect(FIXTURES.filter(item => item.kind === "plant").length).toBeGreaterThanOrEqual(2);
    expect(FIXTURES.filter(item => item.kind === "desk")).toHaveLength(10);
  });
  it("keeps every spot inside the building, and no two rooms on top of each other", () => {
    const spots = Object.entries(PLAN_SPOTS);
    for (const [key, { rect }] of spots) expect(within(rect, BUILDING), key).toBe(true);
    for (const [a, one] of spots) for (const [b, two] of spots) {
      // Main Office's box holds rooms 27 and 28 beside its L (checked above).
      if (a >= b || a === "main-office" || b === "main-office") continue;
      expect(apart(one.rect, two.rect), `${a} and ${b}`).toBe(true);
    }
  });
});

describe("room status", () => {
  const now = new Date("2026-11-04T02:05:00Z"); // Rabu 4 Nov, 09.05 WIB
  const span = { startsAt: wibInstant("2026-11-05", "09:00"), endsAt: wibInstant("2026-11-05", "10:00") };
  const hold = (start: string, end: string, mine = false) => ({ startsAt: wibInstant("2026-11-05", start), endsAt: wibInstant("2026-11-05", end), mine });

  it("is free when nothing overlaps (touching ends do not)", () => {
    expect(roomStatus({ bookable: true, span, now, holds: [hold("10:00", "11:00")] })).toEqual({ tone: "free", text: "Kosong 09.00–10.00" });
  });
  it("is taken by someone else first, then by you", () => {
    expect(roomStatus({ bookable: true, span, now, holds: [hold("09:30", "11:00")] })).toEqual({ tone: "busy", text: "Terpakai 09.30–11.00" });
    expect(roomStatus({ bookable: true, span, now, holds: [hold("08:30", "09:30", true)] })).toEqual({ tone: "mine", text: "Booking kamu 08.30–09.30" });
    expect(roomStatus({ bookable: true, span, now, holds: [hold("08:30", "09:30", true), hold("09:30", "10:00")] }).tone).toBe("busy");
  });
  it("cannot be booked when the room is not bookable, the hours are gone or not chosen", () => {
    expect(roomStatus({ bookable: false, span, now, holds: [] })).toEqual({ tone: "off", text: "Tidak bisa dibooking" });
    expect(roomStatus({ bookable: true, span, now: new Date("2026-11-05T04:00:00Z"), holds: [] }).tone).toBe("closed");
    expect(roomStatus({ bookable: true, span: null, now, holds: [] }).tone).toBe("closed");
  });
  it("skips the past check without now (panitia recording a session)", () => {
    expect(roomStatus({ bookable: true, span, holds: [] }).tone).toBe("free");
  });
  it("warns when the room is too small, and still lets it be picked", () => {
    const status = roomStatus({ bookable: true, span, now, holds: [], capacity: 4, needed: 6 });
    expect(status).toEqual({ tone: "small", text: "Kurang 2 kursi" });
    expect(pickableTone(status.tone)).toBe(true);
    expect(pickableTone("busy")).toBe(false);
  });
});

describe("text sizing", () => {
  it("fits the label in the box, between 14 and the maximum", () => {
    expect(fitText("Vasuki", 453, 46)).toBe(46);
    expect(fitText("CFC Ananta Room", 410, 46)).toBeCloseTo(386 / (15 * 0.68));
    expect(fitText("Kosong 09.00–10.00", 100, 23)).toBe(14);
  });
});

describe("spots the super admin picked", () => {
  it("win over a room that only matches by name, which goes unplaced", () => {
    const picked = { ...room("Komunal"), planKey: "nagapadma" };
    const { placed, unplaced } = placeRooms([room("Nagapadma"), room("Vasuki"), picked]);
    expect(placed.find(item => item.key === "nagapadma")?.room.name).toBe("Komunal");
    expect(unplaced.map(item => item.name)).toEqual(["Nagapadma"]);
  });
  it("ignore a picked key the plan does not have", () => {
    expect(placeRooms([{ ...room("Gudang"), planKey: "gudang" }]).unplaced).toHaveLength(1);
  });
});

describe("room specification", () => {
  const spec = (capacity: number | null, minPeople: number | null, facilities: string[] = []) => roomSpec({ capacity, minPeople, facilities });
  it("says capacity, fewest people and facilities", () => {
    expect(spec(8, null, ["TV", "Whiteboard"])).toBe("Muat 8 orang · TV, Whiteboard");
    expect(spec(4, 1)).toBe("Muat 4 orang · min 1");
    expect(spec(null, null)).toBe("Kapasitas belum diisi");
    expect(spec(null, 4)).toBe("Min 4 orang · kapasitas belum diisi");
  });
  it("shows three facilities and counts the rest", () => {
    expect(spec(10, null, ["TV", "AC", "Whiteboard", "Proyektor", "Speaker"])).toBe("Muat 10 orang · TV, AC, Whiteboard +2");
    expect(roomSpec({ capacity: 6, minPeople: null })).toBe("Muat 6 orang");
  });
  it("names the chairs under a room's name on the plan", () => {
    expect(roomSeats({ capacity: 4 })).toBe("4 kursi");
    expect(roomSeats({ capacity: null })).toBe("Kapasitas belum diisi");
  });
});

describe("facility tags", () => {
  it("are split at commas, trimmed, and kept once", () => {
    expect(parseFacilities(" tv, Whiteboard,,  AC  dingin , TV ")).toEqual(["tv", "Whiteboard", "AC dingin"]);
    expect(parseFacilities("")).toEqual([]);
  });
  it("are at most 8, each 2–30 characters", () => {
    expect(facilitiesProblem(["TV", "AC"])).toBeNull();
    expect(facilitiesProblem(Array.from({ length: 9 }, (_, index) => `Alat ${index}`))).toBe("Paling banyak 8 fasilitas.");
    expect(facilitiesProblem(["X"])).toMatch(/2 sampai 30 karakter/);
    expect(facilitiesProblem(["a".repeat(31)])).toMatch(/2 sampai 30 karakter/);
  });
});

describe("spot names", () => {
  it("name the rooms' spots, and every other spot Ruang N, so the super admin can give it a room", () => {
    expect(spotTitle("vasuki")).toBe("Vasuki");
    expect(spotTitle("communal")).toBe("Communal Space");
    expect(spotTitle("ananta")).toBe("CFC Ananta Room");
    expect(["ruang-1", "ruang-12", "ruang-27"].map(spotTitle)).toEqual(["Ruang 1", "Ruang 12", "Ruang 27"]);
    expect(isRoomSpot("ruang-5")).toBe(false);
    expect(isRoomSpot("antareja")).toBe(true);
    const options = planSpotOptions();
    expect(options).toHaveLength(32);
    expect(options.slice(0, 9).map(option => option.key).sort()).toEqual(["ananta", "antareja", "communal", "limasan", "main-office", "mushola", "nagapadma", "pantry", "vasuki"]);
    expect(options[9]).toEqual({ key: "ruang-1", label: "Ruang 1" });
    expect(options.map(option => option.label).join(" ")).not.toMatch(/Pak|BS|Comms|Spot tambahan/);
  });
  it("show a room's quiet name only once it is readable", () => {
    const small = roomBox(17);
    const phone = 360 / PLAN_W;
    expect(quietName("Ruang 17", small, phone)).toBeNull();
    const zoomed = quietName("Ruang 17", small, phone * 4)!;
    expect(zoomed.size * phone * 4).toBeGreaterThanOrEqual(NAME_MIN_PX);
    expect(zoomed.lines).toEqual(["Ruang", "17"]);
    expect(quietName("Ruang 5", roomBox(5), 860 / PLAN_W)?.lines).toEqual(["Ruang 5"]);
  });
});

describe("words in a spot", () => {
  it("wraps words into lines", () => {
    expect(wrapWords("Maks 8 orang TV Whiteboard", 12, 2)).toEqual(["Maks 8 orang", "TV Whiteboard"]);
    expect(wrapWords("satu dua tiga empat", 4, 2)).toEqual(["satu", "dua tiga empat"]);
  });
  it("keeps names readable on a 360px phone, and shows the specification once zoomed", () => {
    const phone = 300 / PLAN_W;
    const nagapadma = spotText({ name: "Nagapadma", sub: "Maks 8 orang · TV, Whiteboard", rect: PLAN_SPOTS.nagapadma.rect, unitPx: phone });
    expect(nagapadma.nameSize * phone).toBeGreaterThanOrEqual(NAME_MIN_PX);
    expect(nagapadma.sub.length).toBeGreaterThan(0);
    expect(nagapadma.subFrom).toBeGreaterThan(1);
    expect(nagapadma.subFrom).toBeLessThanOrEqual(ZOOM_MAX);
    expect(nagapadma.subSize * phone * nagapadma.subFrom).toBeCloseTo(SUB_MIN_PX);
  });
  it("turns the words of a tall, narrow room so they stay inside it, and keeps the others upright", () => {
    for (const unitPx of [300 / PLAN_W, 860 / PLAN_W]) {
      for (const key of ["nagapadma", "vasuki"]) {
        const rect = PLAN_SPOTS[key].rect;
        const text = spotText({ name: PLAN_SPOTS[key].label, sub: "Muat 8 orang · min 2", rect, unitPx });
        expect(text.rotate).toBe(true);
        // Along the box's length, the name fits inside it.
        expect(Math.max(...text.name.map(line => line.length)) * 0.6 * text.nameSize).toBeLessThanOrEqual(rect.h);
        expect(text.name.length * text.nameSize * 1.2).toBeLessThanOrEqual(rect.w);
      }
    }
    const limasan = spotText({ name: "Limasan", sub: "Muat 40 orang · min 10", rect: PLAN_SPOTS.limasan.rect, unitPx: 860 / PLAN_W });
    // Limasan is square: upright, its specification on two lines.
    expect(limasan.rotate).toBe(false);
    expect(limasan.sub.join(" · ")).toBe("Muat 40 orang · min 10");
  });
  it("keeps the names of the small rooms inside their walls, shown once they are readable", () => {
    for (const unitPx of [300 / PLAN_W, 343 / PLAN_W, 860 / PLAN_W]) {
      for (const key of ["ananta", "antareja"]) {
        const { rect, label } = PLAN_SPOTS[key];
        const words = spotWords({ name: label, sub: "Muat 4 orang", rect, unitPx });
        const along = Math.max(...words.name.map(line => line.length)) * 0.6 * words.nameSize;
        // Never past the walls: upright the widest line fits the width; turned it fits the height.
        expect(along, `${key} at ${unitPx}`).toBeLessThanOrEqual((words.rotate ? rect.h : rect.w) - 4 + 1e-6);
        // And across the lines, under the room's top and bottom padding.
        const across = words.name.length * 1.2 * words.nameSize;
        expect(across, `${key} lines at ${unitPx}`).toBeLessThanOrEqual((words.rotate ? rect.w - 4 : rect.h - 22) + 1e-6);
        // Shown from the zoom at which it is readable (at once when it already is), never beyond 4×.
        const from = words.nameFrom ?? 1;
        expect(words.nameSize * unitPx * from, `${key} readable`).toBeGreaterThanOrEqual(NAME_MIN_PX - 0.01);
        expect(from).toBeLessThanOrEqual(ZOOM_MAX);
      }
    }
    // On a desktop CFC Ananta Room shows its name at once; on a phone after a little zoom.
    expect(spotWords({ name: "CFC Ananta Room", sub: "", rect: PLAN_SPOTS.ananta.rect, unitPx: 860 / PLAN_W }).nameFrom ?? 1).toBe(1);
  });
  it("shows the specification at once on a desktop", () => {
    // A roomy box (CFC Ananta's before 5 Nov).
    const ananta = spotText({ name: "CFC Ananta Room", sub: "Maks 12 orang · TV", rect: { w: 235, h: 410 }, main: true, unitPx: 860 / PLAN_W });
    expect(ananta.subFrom).toBe(1);
    expect(ananta.nameSize).toBeGreaterThan(30);
  });
  it("keeps a room's words at its top, leaving the rest for its chairs", () => {
    const desktop = 860 / PLAN_W, phone = 300 / PLAN_W;
    const antareja = spotWords({ name: "Antareja", sub: "4 kursi", rect: PLAN_SPOTS.antareja.rect, main: true, unitPx: desktop });
    expect(antareja.rotate).toBe(false);
    expect(antareja.sub).toEqual(["4 kursi"]);
    expect(antareja.band).toBeLessThanOrEqual(PLAN_SPOTS.antareja.rect.h * 0.65);
    expect(antareja.band).toBe(wordsBand(antareja));
    // Below the words its four chairs fit, laid out at seating's size and drawn at SEAT_SCALE.
    const k = 1 / SEAT_SCALE, { x, y, w, h } = PLAN_SPOTS.antareja.rect;
    expect(seatPlan({ box: { x: x * k, y: y * k, w: w * k, h: h * k }, capacity: 4, layout: "rapat", top: antareja.band * k }).drawn).toBe(4);
    // Narrow rooms: the name stays inside (two lines or turned) and the chairs start lower. (On a
    // 300px phone CFC Ananta is 30 × 57 px: its name cannot fit at a readable size until zoomed.)
    for (const [unitPx, key] of [[desktop, "nagapadma"], [desktop, "ananta"], [phone, "nagapadma"]] as const) {
      const rect = PLAN_SPOTS[key].rect;
      const words = spotWords({ name: PLAN_SPOTS[key].label, sub: "4 kursi", rect, main: true, unitPx });
      const longest = Math.max(...words.name.map(line => line.length)) * 0.6 * words.nameSize;
      if (words.rotate) {
        expect(longest).toBeLessThanOrEqual(words.band);
        expect(words.name.length * words.nameSize * 1.2).toBeLessThanOrEqual(rect.w);
      } else expect(longest).toBeLessThanOrEqual(rect.w - 8);
      expect(words.nameSize * unitPx).toBeGreaterThanOrEqual(NAME_MIN_PX);
      expect(words.band).toBeLessThanOrEqual(rect.h);
    }
    const phoneWords = spotWords({ name: "Nagapadma", sub: "8 kursi", rect: PLAN_SPOTS.nagapadma.rect, main: true, unitPx: phone });
    expect(phoneWords.rotate).toBe(true);
    expect(phoneWords.band).toBeGreaterThan(PLAN_SPOTS.nagapadma.rect.h * 0.4);
  });
  it("breaks a long name in a narrow box", () => {
    const narrow = spotText({ name: "Communal Space", sub: "", rect: { w: 225, h: 380 }, unitPx: 860 / PLAN_W });
    expect(narrow.name).toEqual(["Communal", "Space"]);
    expect(narrow.sub).toEqual([]);
  });
});

describe("zoom and pan", () => {
  it("clamps the zoom to 1×–4× and keeps the plan in the box", () => {
    expect(clampView({ scale: 9, x: -50, y: 99999 })).toEqual({ scale: 4, x: 0, y: PLAN_H - PLAN_H / 4 });
    expect(clampView({ scale: 0.2, x: 300, y: 300 })).toEqual(FIT_VIEW);
  });
  it("zooms about a point, keeping it under the finger", () => {
    const view = zoomView(FIT_VIEW, 2, [0.25, 0.5]);
    expect(view.scale).toBe(2);
    // The plan point at a quarter of the width stays there.
    expect(view.x + 0.25 * PLAN_W / 2).toBeCloseTo(0.25 * PLAN_W);
    expect(zoomView(view, 0.5)).toEqual(FIT_VIEW);
  });
  it("pans with the finger and stops at the plan's edges", () => {
    const view = { scale: 2, x: 400, y: 300 };
    const moved = moveView(view, 2, [0.5, 0.5], [0.4, 0.5]);
    expect(moved.x).toBeCloseTo(400 + 0.1 * PLAN_W / 2);
    expect(moved.y).toBe(300);
    expect(moveView(view, 2, [0.5, 0.5], [5, 5])).toMatchObject({ x: 0, y: 0 });
  });
  it("brings a room into view", () => {
    const view = { scale: 2, x: 0, y: 0 };
    const rect = PLAN_SPOTS.ananta.rect;
    const shown = revealRect(view, rect);
    expect(shown.x).toBeLessThanOrEqual(rect.x);
    expect(shown.x + PLAN_W / 2).toBeGreaterThanOrEqual(rect.x + rect.w);
    expect(shown.y).toBeLessThanOrEqual(rect.y);
    expect(shown.y + PLAN_H / 2).toBeGreaterThanOrEqual(rect.y + rect.h);
    // Taller than the view at 4×: centred on it.
    const office = PLAN_SPOTS["main-office"].rect;
    expect(revealRect({ scale: 4, x: 0, y: 0 }, office).y + PLAN_H / 8).toBeCloseTo(office.y + office.h / 2);
    expect(revealRect({ scale: 1, x: 0, y: 0 }, rect)).toEqual(FIT_VIEW);
  });
});
