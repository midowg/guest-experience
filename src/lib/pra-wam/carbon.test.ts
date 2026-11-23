import { describe, expect, it } from "vitest";
import { OTHER_ROUTE, carbonFigure, carbonParts, carbonView, personCarbonInput, routeLabel, routeUse, routeValid, splitPercent, travelAnswered, type CarbonInput } from "./carbon";

const trip: CarbonInput = {
  legs: [{ mode: "kereta", label: "pergi", km: 500 }, { mode: "bus", label: "shuttle", km: 30, sharedBy: 30 }],
  nights: 2, roomOccupants: 2, meals: 5,
};

describe("Pra WAM jejak karbon", () => {
  it("counts the person's own share", () => {
    const parts = carbonParts(trip);
    expect(parts.perjalanan).toBeCloseTo(500 * 0.0164 + (30 * 0.89) / 30, 6);
    expect(parts.kamar).toBeCloseTo(62.7, 6);
    expect(parts.makan).toBeCloseTo(9.5, 6);
  });

  it("says it biggest first, with shares that add up to 100", () => {
    const view = carbonView(trip);
    if (view.kind !== "ada") throw new Error("expected a figure");
    expect(view.sources.map(source => source.key)).toEqual(["kamar", "makan", "perjalanan"]);
    expect(view.sources.reduce((sum, source) => sum + source.percent, 0)).toBe(100);
    expect(view.total).toEqual({ value: "81", unit: "kg CO₂e" });
    expect(view.sources[0].note).toBe("2 malam, sekamar berdua");
    expect(view.sources[2].note).toBe("Kereta 500 km · bus 30 km");
  });

  it("is 'belum' with nothing to count", () => {
    expect(carbonView(null)).toEqual({ kind: "belum" });
    expect(carbonView({ legs: [], nights: 0, roomOccupants: 1, meals: 0 })).toEqual({ kind: "belum" });
  });

  it("formats small and large figures", () => {
    expect(carbonFigure(0.4)).toEqual({ value: "<1", unit: "kg CO₂e" });
    expect(carbonFigure(1250)).toEqual({ value: "1,3", unit: "t CO₂e" });
    expect(splitPercent([1, 1, 1])).toEqual([34, 33, 33]);
  });
});

describe("who fills what", () => {
  const settings = { nights: 2, mealsPerPerson: 6, shuttleKm: 27, shuttlePerBus: 30, groupBusPerBus: 40 };
  const routes = [{ id: "r1", from: "Jakarta", mode: "kereta" as const, km: 513 }, { id: "r2", from: "Solo", mode: "bus" as const, km: 60 }];
  const at = "2026-11-23T10:00:00Z";

  it("makes a person's input from the panitia's route, their answer and their room", () => {
    const input = personCarbonInput({ settings, routes }, { routeId: "r1", roundTrip: true, shuttle: true, answeredAt: at }, 3);
    expect(input?.legs.map(leg => [leg.mode, leg.km, leg.sharedBy])).toEqual([["kereta", 513, undefined], ["kereta", 513, undefined], ["bus", 27, 30], ["bus", 27, 30]]);
    expect(input).toMatchObject({ nights: 2, roomOccupants: 3, meals: 6 });
    expect(personCarbonInput({ settings, routes }, { routeId: "r2", roundTrip: false, shuttle: false, answeredAt: at }, 2)?.legs).toEqual([{ mode: "bus", label: "Solo", km: 60, sharedBy: 40 }]);
  });

  it("counts kamar and makan for Lainnya, and waits for an answer", () => {
    const other = personCarbonInput({ settings, routes }, { routeId: OTHER_ROUTE, roundTrip: true, shuttle: false, answeredAt: at }, 2);
    expect(other?.legs).toEqual([]);
    expect(carbonView(other).kind).toBe("ada");
    expect(personCarbonInput({ settings, routes }, null, 2)).toBeNull();
  });

  it("drops an answer whose route was removed, and knows which routes are in use", () => {
    expect(travelAnswered({ routeId: "gone", roundTrip: true, shuttle: true, answeredAt: at }, routes)).toBe(false);
    const use = routeUse([{ travel: { routeId: "r1", roundTrip: true, shuttle: true, answeredAt: at } }, { travel: null }, { travel: { routeId: "r1", roundTrip: false, shuttle: true, answeredAt: at } }]);
    expect(use.get("r1")).toBe(2);
    expect(routeValid({ from: "Bandung", km: 380 })).toBe(true);
    expect(routeValid({ from: " ", km: 380 })).toBe(false);
    expect(routeValid({ from: "Bandung", km: 0 })).toBe(false);
  });

  it("names a route the way the participant picks it", () => {
    expect(routeLabel(routes[0])).toBe("Jakarta · Kereta · 513 km");
  });
});

describe("Pra WAM and WAM 2026 count with the same factors", async () => {
  const { CARBON_FACTORS: wam } = await import("@/lib/main-wam/panitia/carbon");
  const { CARBON_FACTORS: pra } = await import("./carbon");
  it("keeps every shared factor equal", () => {
    expect(pra).toEqual({ keretaPerPenumpangKm: wam.keretaPerPenumpangKm, busPerBusKm: wam.busPerBusKm, makanPerPorsi: wam.makanPerPorsi, hotelPerKamarMalam: wam.hotelPerKamarMalam });
  });
});
