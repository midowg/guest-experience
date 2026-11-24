import { describe, expect, it } from "vitest";
import { CARBON_FACTORS, carbonDataFrom, carbonEstimate } from "../panitia/carbon";
import { samplePeople } from "../sample";
import { compareWithAverage, carbonPageView, personalCarbonDataFrom, personalCarbonEstimate, personalCarbonView, personalFigure, type PersonalCarbonData } from "./carbon-saya";
import { sampleCarbon, sampleCarbonData, samplePersonalCarbon, samplePersonalData } from "./sample";

/* Jejak karbon per person (WAM 2026): the same factors as the event's total, the person's own seats, room and meals. */

const NOW = new Date("2027-01-04T21:00:00+07:00");
const F = CARBON_FACTORS;
const none: PersonalCarbonData = { legs: [], nights: 0, roomOccupants: 0, meals: 0, hotelAverageKg: 0, hotelFromBills: false };

describe("the person's estimate", () => {
  it("a train: kilometres × the per-passenger factor, nothing shared", () => {
    const r = personalCarbonEstimate({ ...none, legs: [{ mode: "kereta", km: 520, sharedBy: 1, listed: true }, { mode: "kereta", km: 520, sharedBy: 1, listed: true }] });
    expect(r.parts.perjalanan).toBeCloseTo(1040 * F.keretaPerPenumpangKm, 6);
    expect(r.basis.trainKm).toBe(1040);
    expect(r.assumed.perjalanan).toBe(false);
    expect(r.hotelFrom).toBe("rata");
  });

  it("a bus: its kilometres split between those on it (the bus is counted per bus-km)", () => {
    const r = personalCarbonEstimate({ ...none, legs: [{ mode: "bus", km: 180, sharedBy: 30, listed: true }] });
    expect(r.parts.perjalanan).toBeCloseTo((180 * F.busPerBusKm) / 30, 6);
    expect(personalCarbonEstimate({ ...none, legs: [{ mode: "bus", km: 180, sharedBy: 0, listed: true }] }).parts.perjalanan).toBeCloseTo(180 * F.busPerBusKm, 6);
  });

  it("the room's nights are split by who sleeps in it; alone takes the whole room", () => {
    expect(personalCarbonEstimate({ ...none, nights: 3, roomOccupants: 3 }).parts.hotel).toBeCloseTo((3 * F.hotelPerKamarMalam) / 3, 6);
    const alone = personalCarbonEstimate({ ...none, nights: 3, roomOccupants: 1 });
    expect(alone.parts.hotel).toBeCloseTo(3 * F.hotelPerKamarMalam, 6);
    expect(alone.hotelFrom).toBe("kamar");
  });

  it("room not known: the average share of the event, said as assumed; the bills in: their share, split evenly", () => {
    const unknown = personalCarbonEstimate({ ...none, nights: 3, roomOccupants: 0, hotelAverageKg: 94 });
    expect(unknown.parts.hotel).toBe(94);
    expect(unknown.hotelFrom).toBe("rata");
    expect(unknown.assumed.hotel).toBe(true);
    const bills = personalCarbonEstimate({ ...none, nights: 3, roomOccupants: 2, hotelAverageKg: 80, hotelFromBills: true });
    expect(bills.parts.hotel).toBe(80);
    expect(bills.hotelFrom).toBe("tagihan");
  });

  it("meals: a portion each", () => {
    expect(personalCarbonEstimate({ ...none, meals: 12 }).parts.makan).toBeCloseTo(12 * F.makanPerPorsi, 6);
  });

  it("no data at all: empty, and the view is 'belum' (waiting for data)", () => {
    const r = personalCarbonEstimate(none);
    expect(r.empty).toBe(true);
    expect(personalCarbonView(r, null, NOW)).toEqual({ kind: "belum" });
    expect(personalCarbonView(null, null, NOW)).toEqual({ kind: "belum" });
  });

  it("garbage numbers count as nothing", () => {
    const r = personalCarbonEstimate({ ...none, legs: [{ mode: "kereta", km: Number.NaN, sharedBy: 1, listed: true }, { mode: "bus", km: -5, sharedBy: 2, listed: true }], meals: -3 });
    expect(r.empty).toBe(true);
  });
});

describe("the person's data from Admin WAM", () => {
  const trips = [
    { id: "k1", kind: "kereta" as const, distanceKm: 520, vehicles: null },
    { id: "b1", kind: "bus" as const, distanceKm: 180, vehicles: 4 },
    { id: "b2", kind: "bus" as const, distanceKm: 90, vehicles: 2 },
    { id: "t1", kind: "tiba" as const, distanceKm: null, vehicles: null },
    { id: "k0", kind: "kereta" as const, distanceKm: null, vehicles: null },
  ];
  const sessions = [{ kind: "makan" as const, status: "terbit" as const }, { kind: "makan" as const, status: "draf" as const }, { kind: "sesi" as const, status: "terbit" as const }] as never[];
  const base = { people: 120, nights: 3, roomOccupants: 2, trips, sessions, overall: sampleCarbon() };

  it("a leg with a seat list counts only for those on it; one without a list counts for everyone, as assumed", () => {
    const data = personalCarbonDataFrom({ ...base, seatCount: new Map([["k1", 100]]), mySeats: new Set(["k1"]) });
    expect(data.legs.map(leg => [leg.mode, leg.km, leg.listed])).toEqual([["kereta", 520, true], ["bus", 180, false], ["bus", 90, false]]);
    // Without a list the bus's riders are everyone over its buses: 120 / 4 and 120 / 2.
    expect(data.legs.filter(leg => leg.mode === "bus").map(leg => leg.sharedBy)).toEqual([30, 60]);
    const notOnIt = personalCarbonDataFrom({ ...base, seatCount: new Map([["k1", 100], ["b1", 120]]), mySeats: new Set() });
    expect(notOnIt.legs.map(leg => leg.km)).toEqual([90]);
  });

  it("only published meals count; trips with no km and non-travel steps are left out", () => {
    const data = personalCarbonDataFrom({ ...base, seatCount: new Map(), mySeats: new Set() });
    expect(data.meals).toBe(1);
    expect(data.legs).toHaveLength(3);
  });

  it("the hotel's share of the event, evenly; flagged when it comes from the bills", () => {
    const data = personalCarbonDataFrom({ ...base, seatCount: new Map(), mySeats: new Set() });
    expect(data.hotelAverageKg).toBeCloseTo(sampleCarbon().parts.hotel / 120, 6);
    expect(data.hotelFromBills).toBe(false);
    const billed = sampleCarbon({ bills: { listrikKwh: 4000, airM3: 600, lpgKg: 200, sampahKg: 900 } });
    expect(personalCarbonDataFrom({ ...base, overall: billed, seatCount: new Map(), mySeats: new Set() }).hotelFromBills).toBe(true);
    expect(personalCarbonDataFrom({ ...base, overall: null, seatCount: new Map(), mySeats: new Set() }).hotelAverageKg).toBe(0);
  });

  it("everyone in the event sums to the event's total when each has a seat, a seat per bus and rooms are full", () => {
    // 4 people, 2 rooms of 2, one train (all seated), one bus with 2 vehicles (all seated), 2 meals.
    const people = 4;
    const t = [{ id: "k", kind: "kereta" as const, distanceKm: 500, vehicles: null }, { id: "b", kind: "bus" as const, distanceKm: 100, vehicles: 2 }];
    const meals = [{ kind: "makan" as const, status: "terbit" as const }, { kind: "makan" as const, status: "terbit" as const }] as never[];
    const seatCount = new Map([["k", 4], ["b", 4]]);
    const total = carbonEstimate(carbonDataFrom({ people, rooms: 2, nights: 2, trips: t, seats: seatCount, sessions: meals, bills: { listrikKwh: null, airM3: null, lpgKg: null, sampahKg: null } }));
    const each = personalCarbonEstimate(personalCarbonDataFrom({ people, nights: 2, roomOccupants: 2, trips: t, seatCount, mySeats: new Set(["k", "b"]), sessions: meals, overall: total }));
    expect(each.kg * people).toBeCloseTo(total.kg, 6);
  });
});

describe("the view", () => {
  it("the example: kilograms, biggest source first, tips for the sources, an estimate against the average", () => {
    const view = personalCarbonView(samplePersonalCarbon(), sampleCarbon(), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.total).toEqual({ value: "113", unit: "kg CO₂e" });
    expect(view.sources.map(s => [s.key, s.amount, s.swatch])).toEqual([["hotel", "≈63 kg", 1], ["perjalanan", "28 kg", 2], ["makan", "23 kg", 3]]);
    expect(view.sources.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
    expect(view.compare).toEqual({ state: "lower", average: "145 kg", text: "22% di bawah rata-rata peserta" });
    expect(view.tips).toHaveLength(3);
    expect(view.complete).toBe(true);
    expect(view.updated).toBe("Sen, 4 Jan · 21.00");
  });

  it("an assumed ticket or room is marked (≈, 'tiketmu belum terdata') and the view is not complete", () => {
    const view = personalCarbonView(samplePersonalCarbon({ legs: [{ mode: "kereta", km: 1000, sharedBy: 1, listed: false }], roomOccupants: 0 }), sampleCarbon(), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.complete).toBe(false);
    expect(view.sources.find(s => s.key === "perjalanan")).toMatchObject({ amount: "≈16 kg", note: "Kereta 1.000 km · tiketmu belum terdata" });
    expect(view.sources.find(s => s.key === "hotel")!.note).toBe("Rata-rata peserta, kamarmu belum terdata");
  });

  it("compares with the average: below, near (within 5 %), above, none without an average", () => {
    expect(compareWithAverage(100, 200)).toEqual({ state: "lower", percent: 50 });
    expect(compareWithAverage(103, 100)).toEqual({ state: "near", percent: 3 });
    expect(compareWithAverage(150, 100)).toEqual({ state: "higher", percent: 50 });
    expect(compareWithAverage(150, null)).toBeNull();
    expect(compareWithAverage(0, 100)).toBeNull();
  });

  it("figures are whole kilograms, '<1' under one, English number style", () => {
    expect(personalFigure(144.6)).toEqual({ value: "145", unit: "kg CO₂e" });
    expect(personalFigure(1234)).toEqual({ value: "1.234", unit: "kg CO₂e" });
    expect(personalFigure(0.4)).toEqual({ value: "<1", unit: "kg CO₂e" });
    expect(personalFigure(1234, "en")).toEqual({ value: "1,234", unit: "kg CO₂e" });
  });

  it("the page view: the event's numbers (total, participants, average) beside the person's", () => {
    const page = carbonPageView(samplePersonalCarbon(), sampleCarbon(), NOW);
    expect(page.overall).toMatchObject({ kind: "ada", total: { value: "17,4", unit: "t CO₂e" }, people: "120", average: "145 kg" });
    expect(carbonPageView(null, sampleCarbon(), NOW).mine).toEqual({ kind: "belum" });
    expect(carbonPageView(null, null, NOW)).toEqual({ mine: { kind: "belum" }, overall: { kind: "belum" } });
  });

  it("privacy: nothing in the page view names another person (only totals and the person's own numbers)", () => {
    const json = JSON.stringify(carbonPageView(samplePersonalCarbon(), sampleCarbon(), NOW));
    for (const person of Object.values(samplePeople)) expect(json).not.toContain(person.name);
    expect(Object.keys(samplePersonalData).sort()).toEqual(Object.keys(none).sort());
    expect(sampleCarbonData.people).toBe(120);
  });
});
