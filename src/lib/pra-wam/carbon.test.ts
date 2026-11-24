import { describe, expect, it } from "vitest";
import { EMPTY_CARBON_SETUP, asCarbonSetup, carbonAnswerInputSchema, calculatorTiles, carbonFigure, carbonSetupSchema, carbonParts, carbonView, ownTripValid, personCarbonInput, splitPercent, tileKg, tripLabel, tripValid, type CarbonInput } from "./carbon";

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
    const own = personCarbonInput({ settings, trip }, { own: { from: "Magelang", mode: "motor", km: 40, roundTrip: false }, bottles: 0, laptopHours: 0, phoneCharges: 0, answeredAt: at }, 2);
    expect(own?.legs).toEqual([{ mode: "motor", label: "Magelang", km: 40, sharedBy: 1 }]);
    const other = personCarbonInput({ settings, trip }, { own: { from: "Solo", mode: "lainnya", km: 0, roundTrip: true }, bottles: 0, laptopHours: 0, phoneCharges: 0, answeredAt: at }, 2);
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

describe("the participant's calculator", () => {
  const setup = { settings: { nights: 2, mealsPerPerson: 6 }, trip: { from: "Kantor", to: "Venue", mode: "mobil" as const, km: 25, perVehicle: 5, roundTrip: true } };
  const travel = { own: null, bottles: 3, laptopHours: 10, phoneCharges: 2, answeredAt: "2026-11-24T01:00:00Z" };

  it("adds bottles to makan and laptop and phone to perangkat, on the group trip", () => {
    const input = personCarbonInput(setup, travel, 2)!;
    expect(input.legs).toHaveLength(2);
    const parts = carbonParts(input);
    expect(parts.makan).toBeCloseTo(6 * 1.9 + 3 * 0.1, 6);
    expect(parts.perangkat).toBeCloseTo((10 * 0.032 + 2 * 0.019) * 0.87, 6);
  });

  it("gives each tile its kilograms, and they add up to the total", () => {
    const input = personCarbonInput(setup, travel, 2)!;
    const tiles = calculatorTiles(input);
    const parts = carbonParts(input);
    expect(tiles.botol + tiles.laptop + tiles.hp + tiles.makan + tiles.kamar + tiles.perjalanan).toBeCloseTo(parts.perjalanan + parts.kamar + parts.makan + parts.perangkat, 6);
    expect(tileKg(tiles.laptop)).toBe("0,3 kg");
    expect(tileKg(0)).toBe("0 kg");
    expect(tileKg(62.7)).toBe("63 kg");
  });
});

describe("Pra WAM and WAM 2026 count with the same factors", async () => {
  const { CARBON_FACTORS: wam } = await import("@/lib/main-wam/panitia/carbon");
  const { CARBON_FACTORS: pra } = await import("./carbon");
  it("keeps every shared factor equal", () => {
    const shared = ["keretaPerPenumpangKm", "busPerBusKm", "makanPerPorsi", "hotelPerKamarMalam", "listrikPerKwh"] as const;
    for (const key of shared) expect(pra[key]).toBe(wam[key]);
  });
});

describe("what Admin Pra WAM saves", () => {
  it("accepts a sensible setup and refuses nonsense", () => {
    const good = { settings: { nights: 2, mealsPerPerson: 6 }, trip: { from: "Kantor", to: "Venue", mode: "mobil", km: 25, perVehicle: 6, roundTrip: true }, formOpen: true };
    expect(carbonSetupSchema.safeParse(good).success).toBe(true);
    expect(carbonSetupSchema.safeParse({ ...good, trip: { ...good.trip, km: 5000 } }).success).toBe(false);
    expect(carbonSetupSchema.safeParse({ ...good, settings: { ...good.settings, nights: 1.5 } }).success).toBe(false);
    expect(carbonSetupSchema.safeParse({ ...good, trip: { ...good.trip, mode: "pesawat" } }).success).toBe(false);
    expect(asCarbonSetup({ nope: true })).toEqual(EMPTY_CARBON_SETUP);
    expect(personCarbonInput(EMPTY_CARBON_SETUP, null, 2)).toBeNull();
  });
});

describe("Jejak karbon: what a participant may send", () => {
  it("takes the group trip or a complete own trip, and refuses too much", () => {
    expect(carbonAnswerInputSchema.safeParse({ own: null, bottles: 2, laptopHours: 4, phoneCharges: 1 }).success).toBe(true);
    expect(carbonAnswerInputSchema.safeParse({ own: { from: "Sleman", mode: "motor", km: 15, roundTrip: true }, bottles: 0, laptopHours: 0, phoneCharges: 0 }).success).toBe(true);
    expect(carbonAnswerInputSchema.safeParse({ own: { from: "Lain", mode: "lainnya", km: 0, roundTrip: true }, bottles: 0, laptopHours: 0, phoneCharges: 0 }).success).toBe(true);
    const bad = carbonAnswerInputSchema.safeParse({ own: { from: " ", mode: "mobil", km: 0, roundTrip: true }, bottles: 0, laptopHours: 0, phoneCharges: 0 });
    expect(bad.success ? "" : bad.error.issues[0].message).toBe("Isi asal dan jarak 1–3.000 km.");
    expect(carbonAnswerInputSchema.safeParse({ own: null, bottles: 51, laptopHours: 0, phoneCharges: 0 }).success).toBe(false);
    expect(carbonAnswerInputSchema.safeParse({ own: null, bottles: -1, laptopHours: 0, phoneCharges: 0 }).success).toBe(false);
  });
});
