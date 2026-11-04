import { describe, expect, it } from "vitest";
import { wibInstant, type Room } from "./appraisal";
import { BUILDING, PLAN_SPOTS, fitText, layoutRooms, normalizeRoomName, pickableTone, placeRooms, planKey, roomStatus } from "./floor-plan";

const room = (name: string, slug = name.toLowerCase().replace(/\s+/g, "-"), bookable = true): Room => ({ id: slug, slug, name, kind: "utama", capacity: null, bookable, minPeople: null, planKey: null });
/** The rooms as seeded in production (migration 202611040001). */
const production = [
  room("CFC Ananta Room", "cfc-ananta"), room("Nagapadma"), room("Vasuki"),
  room("Limasan", "limasan", false), room("Pantry", "pantry", false), room("Main Office", "main-office", false), room("Komunal", "komunal", false),
];

describe("room names on the plan", () => {
  it("normalizes case, spaces and punctuation", () => {
    expect(normalizeRoomName("  CFC  Ananta-Room ")).toBe("cfc ananta room");
    expect(normalizeRoomName("main-office")).toBe("main office");
  });
  it("places every production room that has a spot, by name", () => {
    expect(production.map(planKey)).toEqual(["ananta", "nagapadma", "vasuki", "limasan", "pantry", "main-office", null]);
  });
  it("falls back to the slug when the name changes, and ignores unknown rooms", () => {
    expect(planKey({ name: "Ruang Ananta (CFC)", slug: "cfc-ananta" })).toBe("ananta");
    expect(planKey({ name: "Ruang baru", slug: "ruang-baru" })).toBeNull();
  });
  it("splits rooms into placed, other spots (not WAM) and unplaced", () => {
    const { placed, others, unplaced } = layoutRooms(production);
    expect(placed.map(item => item.key).sort()).toEqual(["ananta", "limasan", "main-office", "nagapadma", "pantry", "vasuki"]);
    expect(others.map(item => item.key).sort()).toEqual(["bs", "comms", "pak-bagus", "pak-fadil"]);
    expect(unplaced.map(item => item.name)).toEqual(["Komunal"]);
  });
  it("gives a spot to one room only", () => {
    const { placed, unplaced } = layoutRooms([room("Vasuki", "vasuki"), room("vasuki", "vasuki-2")]);
    expect(placed).toHaveLength(1);
    expect(unplaced.map(item => item.slug)).toEqual(["vasuki-2"]);
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
    expect(placeRooms([{ ...room("Komunal"), planKey: "gudang" }]).unplaced).toHaveLength(1);
  });
});
