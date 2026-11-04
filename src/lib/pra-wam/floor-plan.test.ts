import { describe, expect, it } from "vitest";
import { wibInstant, type Room } from "./appraisal";
import {
  BUILDING, FIT_VIEW, NAME_MIN_PX, PLAN_H, PLAN_SPOTS, PLAN_W, SUB_MIN_PX, ZOOM_MAX, clampView, facilitiesProblem, fitText, isRoomSpot, layoutRooms, moveView, normalizeRoomName,
  parseFacilities, pickableTone, placeRooms, planKey, planSpotOptions, revealRect, roomSpec, roomStatus, spotText, spotTitle, wrapWords, zoomView,
} from "./floor-plan";

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
    expect(others.map(item => item.key).sort()).toEqual(["bs", "comms", "pak-bagus", "pak-fadil"]);
    expect(unplaced).toEqual([]);
  });
  it("gives a spot to one room only", () => {
    const { placed, unplaced } = layoutRooms([room("Vasuki", "vasuki"), room("vasuki", "vasuki-2")]);
    expect(placed).toHaveLength(1);
    expect(unplaced.map(item => item.slug)).toEqual(["vasuki-2"]);
  });
  it("is turned so north (Limasan) is up: Limasan along the top, Main Office at the bottom", () => {
    const top = (key: string) => PLAN_SPOTS[key].rect.y;
    expect(top("limasan")).toBeLessThan(top("communal"));
    expect(top("limasan")).toBeLessThan(BUILDING.y + 40);
    // Main Office is west of Nagapadma, CFC Ananta in the south.
    expect(PLAN_SPOTS["main-office"].rect.x).toBeLessThan(PLAN_SPOTS.nagapadma.rect.x);
    expect(top("ananta")).toBeGreaterThan(top("limasan"));
    expect(PLAN_H).toBeGreaterThan(PLAN_W);
    expect(BUILDING.x + BUILDING.w + 20).toBe(PLAN_W);
    expect(BUILDING.y + BUILDING.h + 20).toBe(PLAN_H);
    // Main Office's words sit inside its L.
    const office = PLAN_SPOTS["main-office"];
    const words = office.textRect!;
    expect(words.x).toBeGreaterThanOrEqual(office.rect.x);
    expect(words.y + words.h).toBeLessThanOrEqual(office.rect.y + office.rect.h);
  });
  it("keeps every spot inside the building", () => {
    for (const { rect } of Object.values(PLAN_SPOTS)) {
      expect(rect.x).toBeGreaterThanOrEqual(BUILDING.x);
      expect(rect.y).toBeGreaterThanOrEqual(BUILDING.y);
      expect(rect.x + rect.w).toBeLessThanOrEqual(BUILDING.x + BUILDING.w);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BUILDING.y + BUILDING.h);
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
  it("keep room spots' labels and never name a desk", () => {
    expect(spotTitle("vasuki")).toBe("Vasuki");
    expect(spotTitle("communal")).toBe("Communal Space");
    expect(["pak-bagus", "bs", "pak-fadil", "comms"].map(spotTitle)).toEqual(["Spot tambahan 1", "Spot tambahan 2", "Spot tambahan 3", "Spot tambahan 4"]);
    expect(isRoomSpot("pak-bagus")).toBe(false);
    expect(planSpotOptions().map(option => option.label).join(" ")).not.toMatch(/Pak|BS|Comms/);
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
    expect(limasan.rotate).toBe(false);
    expect(limasan.sub).toEqual(["Muat 40 orang · min 10"]);
  });
  it("shows the specification at once on a desktop", () => {
    const ananta = spotText({ name: "CFC Ananta Room", sub: "Maks 12 orang · TV", rect: PLAN_SPOTS.ananta.rect, main: true, unitPx: 860 / PLAN_W });
    expect(ananta.subFrom).toBe(1);
    expect(ananta.nameSize).toBeGreaterThan(30);
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
    expect(revealRect({ scale: 4, x: 0, y: 0 }, rect).y + PLAN_H / 8).toBeCloseTo(rect.y + rect.h / 2);
    expect(revealRect({ scale: 1, x: 0, y: 0 }, rect)).toEqual(FIT_VIEW);
  });
});
