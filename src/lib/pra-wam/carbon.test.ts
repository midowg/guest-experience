import { describe, expect, it } from "vitest";
import { carbonFigure, carbonParts, carbonView, ownTripValid, personCarbonInput, splitPercent, tripLabel, tripValid, type CarbonInput } from "./carbon";

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
    expect(view.sources[2].note).toBe("Kereta 500 km · Bus 30 km");
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
  const settings = { nights: 2, mealsPerPerson: 6 };
  const trip = { from: "Kantor", to: "Venue", mode: "mobil" as const, km: 25, perVehicle: 5, roundTrip: true };
  const at = "2026-11-23T10:00:00Z";

  it("counts the group trip for everyone who has not said otherwise", () => {
    const input = personCarbonInput({ settings, trip }, null, 3);
    expect(input?.legs.map(leg => [leg.mode, leg.km, leg.sharedBy])).toEqual([["mobil", 25, 5], ["mobil", 25, 5]]);
    expect(carbonParts(input!).perjalanan).toBeCloseTo((2 * 25 * 0.21007) / 5, 6);
    expect(input).toMatchObject({ nights: 2, roomOccupants: 3, meals: 6 });
    expect(personCarbonInput({ settings, trip: { ...trip, mode: "kereta" } }, null, 1)?.legs[0].sharedBy).toBeUndefined();
  });

  it("counts a participant's own trip instead, alone in their vehicle", () => {
    const own = personCarbonInput({ settings, trip }, { own: { from: "Magelang", mode: "motor", km: 40, roundTrip: false }, answeredAt: at }, 2);
    expect(own?.legs).toEqual([{ mode: "motor", label: "Magelang", km: 40, sharedBy: 1 }]);
    const other = personCarbonInput({ settings, trip }, { own: { from: "Solo", mode: "lainnya", km: 0, roundTrip: true }, answeredAt: at }, 2);
    expect(other?.legs).toEqual([]);
    expect(carbonView(other).kind).toBe("ada");
  });

  it("waits for a complete trip, and checks a participant's distance", () => {
    expect(tripValid({ ...trip, to: " " })).toBe(false);
    expect(tripValid({ ...trip, perVehicle: 0 })).toBe(false);
    expect(tripValid({ ...trip, mode: "kereta", perVehicle: 0 })).toBe(true);
    expect(personCarbonInput({ settings, trip: { ...trip, km: 0 } }, null, 2)).toBeNull();
    expect(ownTripValid({ from: "Magelang", mode: "mobil", km: 0, roundTrip: true })).toBe(false);
    expect(ownTripValid({ from: "Magelang", mode: "mobil", km: 5000, roundTrip: true })).toBe(false);
    expect(ownTripValid({ from: "", mode: "lainnya", km: 0, roundTrip: true })).toBe(false);
  });

  it("names the trip and its legs", () => {
    expect(tripLabel(trip)).toBe("Kantor → Venue");
    const view = carbonView(personCarbonInput({ settings, trip }, null, 3));
    if (view.kind !== "ada") throw new Error("expected a figure");
    expect(view.sources.find(source => source.key === "perjalanan")?.note).toBe("Mobil 50 km");
  });
});

describe("Pra WAM and WAM 2026 count with the same factors", async () => {
  const { CARBON_FACTORS: wam } = await import("@/lib/main-wam/panitia/carbon");
  const { CARBON_FACTORS: pra } = await import("./carbon");
  it("keeps every shared factor equal", () => {
    const shared = ["keretaPerPenumpangKm", "busPerBusKm", "makanPerPorsi", "hotelPerKamarMalam"] as const;
    for (const key of shared) expect(pra[key]).toBe(wam[key]);
  });
});
