import { describe, expect, it } from "vitest";
import { carbonFigure, carbonParts, carbonView, parsePastedTravel, personCarbonInput, splitPercent, travelComplete, type CarbonInput } from "./carbon";

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

describe("Pra WAM and WAM 2026 count with the same factors", async () => {
  const { CARBON_FACTORS: wam } = await import("@/lib/main-wam/panitia/carbon");
  const { CARBON_FACTORS: pra } = await import("./carbon");
  it("keeps every shared factor equal", () => {
    expect(pra).toEqual({ keretaPerPenumpangKm: wam.keretaPerPenumpangKm, busPerBusKm: wam.busPerBusKm, makanPerPorsi: wam.makanPerPorsi, hotelPerKamarMalam: wam.hotelPerKamarMalam });
  });
});

describe("what the panitia fill", () => {
  const settings = { nights: 2, mealsPerPerson: 6, shuttleKm: 27, shuttlePerBus: 30, groupBusPerBus: 40 };

  it("makes a person's input from the event, their travel and their room", () => {
    const input = personCarbonInput(settings, { from: "Jakarta", mode: "kereta", km: 513, roundTrip: true, shuttle: true }, 3);
    expect(input?.legs.map(leg => [leg.mode, leg.km, leg.sharedBy])).toEqual([["kereta", 513, undefined], ["kereta", 513, undefined], ["bus", 27, 30], ["bus", 27, 30]]);
    expect(input).toMatchObject({ nights: 2, roomOccupants: 3, meals: 6 });
    expect(personCarbonInput(settings, { from: "Solo", mode: "bus", km: 60, roundTrip: false, shuttle: false }, 2)?.legs).toEqual([{ mode: "bus", label: "Solo", km: 60, sharedBy: 40 }]);
  });

  it("waits for how a person comes, and how far", () => {
    expect(personCarbonInput(settings, null, 2)).toBeNull();
    expect(travelComplete({ from: "", mode: "kereta", km: 0, roundTrip: true, shuttle: true })).toBe(false);
    expect(travelComplete({ from: "", mode: "lainnya", km: 0, roundTrip: true, shuttle: false })).toBe(true);
  });

  it("reads rows pasted from Excel and matches them by name", () => {
    const pasted = "Nama\tKota asal\tModa\tKm\nrani contoh\tJakarta\tKereta\t513\nOrang Lain\tBandung\tBus\t400\nBima Contoh;Semarang;bis;1.120\nCici\tx\tKereta\tdua";
    const result = parsePastedTravel(pasted, ["Rani Contoh", "Bima Contoh", "Cici"]);
    expect(result.rows.map(row => [row.match, row.from, row.mode, row.km])).toEqual([["Rani Contoh", "Jakarta", "kereta", 513], ["Bima Contoh", "Semarang", "bus", 1120]]);
    expect(result.unknown.map(row => row.name)).toEqual(["Orang Lain"]);
    expect(result.bad).toEqual([5]);
  });
});
