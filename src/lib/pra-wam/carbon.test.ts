import { describe, expect, it } from "vitest";
import { carbonFigure, carbonParts, carbonView, splitPercent, type CarbonInput } from "./carbon";

const trip: CarbonInput = {
  legs: [{ mode: "kereta", label: "pergi", km: 500 }, { mode: "bus", label: "shuttle", km: 30, sharedBy: 30 }],
  nights: 2, roomOccupants: 2, meals: 5,
};

describe("Pra WAM jejak karbon", () => {
  it("counts the person's own share", () => {
    const parts = carbonParts(trip);
    expect(parts.perjalanan).toBeCloseTo(500 * 0.0164 + (30 * 0.89) / 30, 6);
    expect(parts.kamar).toBe(40);
    expect(parts.makan).toBeCloseTo(9.5, 6);
  });

  it("says it biggest first, with shares that add up to 100", () => {
    const view = carbonView(trip);
    if (view.kind !== "ada") throw new Error("expected a figure");
    expect(view.sources.map(source => source.key)).toEqual(["kamar", "makan", "perjalanan"]);
    expect(view.sources.reduce((sum, source) => sum + source.percent, 0)).toBe(100);
    expect(view.total).toEqual({ value: "59", unit: "kg CO₂e" });
    expect(view.sources[0].note).toBe("2 malam, dibagi 2 orang sekamar");
    expect(view.sources[2].note).toBe("Kereta 500 km, shuttle 30 km");
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
