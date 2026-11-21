import { describe, expect, it } from "vitest";
import { carbonEstimate } from "../panitia/carbon";
import { carbonCatalog, carbonFigure, carbonShort, carbonView, perPersonKg, splitPercent } from "./carbon";
import { sampleCarbon } from "./sample";

/* Jejak karbon for the person (E01): the sources' order and shares, rounding in kg and tonnes, and the words. */

const NOW = new Date("2027-01-04T21:00:00+07:00");

describe("shares", () => {
  it("add up to exactly 100 (largest remainder), and are 0 when there is nothing", () => {
    expect(splitPercent([1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitPercent([7200, 3664, 2736])).toEqual([53, 27, 20]);
    expect(splitPercent([50, 50])).toEqual([50, 50]);
    expect(splitPercent([1, 0, 0])).toEqual([100, 0, 0]);
    expect(splitPercent([0, 0])).toEqual([0, 0]);
    expect(splitPercent([-5, 5])).toEqual([0, 100]);
    for (const parts of [[13, 29, 58], [3333, 3333, 3334], [0.4, 0.4, 0.2]]) expect(splitPercent(parts).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("kilograms and tonnes", () => {
  it("tonnes with one decimal from 0,1 t, whole kilograms below it, never 0,0 t", () => {
    expect(carbonFigure(13_640)).toEqual({ value: "13,6", unit: "t CO₂e" });
    expect(carbonFigure(99.4)).toEqual({ value: "99", unit: "kg CO₂e" });
    expect(carbonFigure(99.6)).toEqual({ value: "0,1", unit: "t CO₂e" });
    expect(carbonFigure(0.3)).toEqual({ value: "<1", unit: "kg CO₂e" });
    expect(carbonFigure(1_240_000)).toEqual({ value: "1.240,0", unit: "t CO₂e" });
    expect(carbonFigure(13_640, "en")).toEqual({ value: "13.6", unit: "t CO₂e" });
    expect(carbonShort(7_200)).toBe("7,2 t");
    expect(carbonShort(480)).toBe("0,5 t");
    expect(carbonShort(45)).toBe("45 kg");
  });

  it("per person: whole kilograms, at least 1, none without people", () => {
    expect(perPersonKg(13_640, 120)).toBe(114);
    expect(perPersonKg(10, 120)).toBe(1);
    expect(perPersonKg(5000, 0)).toBeNull();
    expect(perPersonKg(0, 10)).toBeNull();
  });
});

describe("the page's view", () => {
  it("the design's example: biggest source first, with share, note and the colour in that order", () => {
    const view = carbonView(sampleCarbon(), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.total).toEqual({ value: "13,3", unit: "t CO₂e" });
    expect(view.perPerson).toBe("±111 kg per orang");
    expect(view.updated).toBe("Sen, 4 Jan · 21.00");
    expect(view.sources.map(source => [source.key, source.amount, source.percent, source.note, source.swatch])).toEqual([
      ["hotel", "≈7,2 t", 54, "60 kamar × 3 malam", 1],
      ["perjalanan", "3,3 t", 25, "Kereta, shuttle", 2],
      ["makan", "2,7 t", 21, "1.440 porsi", 3],
    ]);
    expect(view.sources.reduce((sum, source) => sum + source.percent, 0)).toBe(100);
    expect(view.barLabel).toBe("Hotel 54%, Perjalanan 25%, Makan 21%");
  });

  it("the hotel is no estimate once its bills are in, and says where the number comes from", () => {
    const view = carbonView(sampleCarbon({ bills: { listrikKwh: 4000, airM3: 600, lpgKg: 200, sampahKg: 900 } }), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    const hotel = view.sources.find(source => source.key === "hotel")!;
    expect(hotel.amount).not.toContain("≈");
    expect(hotel.note).toBe("Dari tagihan hotel");
  });

  it("leaves a source with nothing in it out, and writes small events in kilograms", () => {
    const view = carbonView(sampleCarbon({ people: 6, roomNights: 0, rooms: 0, nights: 0, trainLegs: [], busLegs: [], portions: 12 }), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.sources.map(source => source.key)).toEqual(["makan"]);
    expect(view.sources[0]).toMatchObject({ amount: "23 kg", percent: 100, note: "12 porsi", swatch: 1 });
    expect(view.total).toEqual({ value: "23", unit: "kg CO₂e" });
    expect(view.perPerson).toBe("±4 kg per orang");
  });

  it("room-nights when the rooms and nights are not known apart", () => {
    const view = carbonView(sampleCarbon({ rooms: 0, nights: 0 }), NOW);
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.sources.find(source => source.key === "hotel")!.note).toBe("180 kamar-malam");
  });

  it("nothing to count, or not readable: belum", () => {
    expect(carbonView(null, NOW)).toEqual({ kind: "belum" });
    expect(carbonView(carbonEstimate({ people: 0, roomNights: 0, trainLegs: [], busLegs: [], portions: 0, bills: { listrikKwh: null, airM3: null, lpgKg: null, sampahKg: null } }), NOW)).toEqual({ kind: "belum" });
  });

  it("speaks English with its own number style", () => {
    const view = carbonView(sampleCarbon(), NOW, "en");
    if (view.kind !== "ada") throw new Error("expected a number");
    expect(view.total.value).toBe("13.3");
    expect(view.perPerson).toBe("±111 kg per person");
    expect(view.sources[0]).toMatchObject({ title: "Hotel", note: "60 rooms × 3 nights" });
    expect(view.sources[2].note).toBe("1,440 meals");
    expect(view.updated).toBe("Mon, 4 Jan · 21:00");
  });

  it("the catalogue lists every factor the estimate counts with, from the one table", () => {
    expect(carbonCatalog().map(row => [row.name, row.value, row.unit])).toEqual([
      ["Kereta", "0,0164", "kg per penumpang-km"],
      ["Bus", "0,89", "kg per bus-km"],
      ["Makan", "1,9", "kg per porsi"],
      ["Hotel", "40", "kg per kamar-malam"],
      ["Listrik", "0,87", "kg per kWh"],
      ["Air", "0,4", "kg per m³"],
      ["LPG", "2,94", "kg per kg"],
      ["Sampah", "0,5", "kg per kg"],
    ]);
    expect(carbonCatalog("en")[0]).toEqual({ key: "kereta", name: "Train", value: "0.0164", unit: "kg per passenger-km" });
  });
});
