import { describe, expect, it } from "vitest";
import { tonnes } from "./format";
import { CARBON_FACTORS, carbonDataFrom, carbonEstimate, nightsBetween, type CarbonData } from "./carbon";

/*
 * The design's example (SPEC K09, Penpot 00b): 120 peserta, 1.440 porsi (120 × 4 hari × 3), 180
 * kamar-malam (60 kamar × 3 malam), 4 bus × 180 km, kereta Yogyakarta–Malang pergi-pulang. The
 * route's length is an example value (350 km one way, as the sample trips).
 */
const noBills = { listrikKwh: null, airM3: null, lpgKg: null, sampahKg: null };
const example: CarbonData = {
  people: 120,
  roomNights: 180,
  trainLegs: [{ km: 350, passengers: 120 }, { km: 350, passengers: 120 }],
  busLegs: [{ km: 180, buses: 4 }],
  portions: 1440,
  bills: noBills,
};

describe("Jejak karbon", () => {
  it("counts the design's example part by part, in kg CO₂e", () => {
    const result = carbonEstimate(example);
    expect(result.parts.makan).toBeCloseTo(1440 * 1.9, 6);          // 2.736 kg
    expect(result.parts.hotel).toBeCloseTo(180 * 40, 6);            // 7.200 kg (perkiraan)
    expect(result.parts.perjalanan).toBeCloseTo(4 * 180 * 0.89 + 2 * 350 * 120 * 0.0164, 6); // 640,8 + 1.377,6
    expect(result.kg).toBeCloseTo(11_954.4, 6);
    expect(result.hotelFrom).toBe("perkiraan");
    expect(result.empty).toBe(false);
  });

  it("gives tonnes with one decimal", () => {
    expect(carbonEstimate(example).tonnes).toBe(12);
    expect(tonnes(carbonEstimate(example).tonnes)).toBe("12,0");
    expect(carbonEstimate({ ...example, portions: 2160 }).tonnes).toBe(13.3); // +720 porsi = +1.368 kg
    expect(tonnes(13.6)).toBe("13,6");
  });

  it("uses the hotel's bills once all four are in, and the estimate before", () => {
    const bills = { listrikKwh: 4000, airM3: 600, lpgKg: 200, sampahKg: 900 };
    const withBills = carbonEstimate({ ...example, bills });
    expect(withBills.hotelFrom).toBe("tagihan");
    expect(withBills.parts.hotel).toBeCloseTo(4000 * 0.87 + 600 * 0.4 + 200 * 2.94 + 900 * 0.5, 6);
    const partial = carbonEstimate({ ...example, bills: { ...bills, sampahKg: null } });
    expect(partial.hotelFrom).toBe("perkiraan");
    expect(partial.parts.hotel).toBe(7200);
  });

  it("says what it counted, for the page that shows the sources", () => {
    expect(carbonEstimate({ ...example, rooms: 60, nights: 3 }).basis).toEqual({ people: 120, rooms: 60, nights: 3, roomNights: 180, portions: 1440, trainLegs: 2, busLegs: 1 });
    // A leg without km or riders was not counted, so it is not named.
    expect(carbonEstimate({ ...example, trainLegs: [{ km: 0, passengers: 5 }], busLegs: [{ km: 10, buses: 0 }] }).basis).toMatchObject({ trainLegs: 0, busLegs: 0, rooms: 0, nights: 0 });
  });

  it("is empty with nothing to count, and never negative", () => {
    const none = carbonEstimate({ people: 0, roomNights: 0, trainLegs: [], busLegs: [], portions: 0, bills: noBills });
    expect(none).toMatchObject({ kg: 0, tonnes: 0, empty: true });
    expect(carbonEstimate({ ...example, roomNights: -5, portions: -1, trainLegs: [{ km: -1, passengers: 10 }] }).kg).toBeCloseTo(640.8, 6);
  });

  it("keeps the design's factors", () => {
    expect(CARBON_FACTORS).toEqual({ keretaPerPenumpangKm: 0.0164, busPerBusKm: 0.89, makanPerPorsi: 1.9, hotelPerKamarMalam: 40, listrikPerKwh: 0.87, airPerM3: 0.4, lpgPerKg: 2.94, sampahPerKg: 0.5 });
  });
});

describe("Jejak karbon from Admin WAM's data", () => {
  it("counts trains by seats (or everyone), buses by vehicles, meals from the rundown, rooms × nights", () => {
    const trips = [
      { id: "k1", kind: "kereta" as const, distanceKm: 350, vehicles: null },
      { id: "k2", kind: "kereta" as const, distanceKm: 350, vehicles: null },
      { id: "b1", kind: "bus" as const, distanceKm: 180, vehicles: 4 },
      { id: "b2", kind: "bus" as const, distanceKm: null, vehicles: 4 },
      { id: "x", kind: "kumpul" as const, distanceKm: 3, vehicles: null },
    ];
    const meal = { kind: "makan" as const, status: "terbit" as const };
    const sessions = [...Array.from({ length: 12 }, () => meal), { kind: "makan" as const, status: "batal" as const }, { kind: "sesi" as const, status: "terbit" as const }];
    const data = carbonDataFrom({ people: 120, rooms: 60, nights: nightsBetween("2027-01-04", "2027-01-07"), trips, seats: new Map([["k1", 118]]), sessions, bills: noBills });
    expect(data).toEqual({
      people: 120, roomNights: 180, rooms: 60, nights: 3, portions: 1440, bills: noBills,
      trainLegs: [{ km: 350, passengers: 118 }, { km: 350, passengers: 120 }],
      busLegs: [{ km: 180, buses: 4 }],
    });
  });

  it("counts nights between the dates, 0 when unknown", () => {
    expect(nightsBetween("2027-01-04", "2027-01-07")).toBe(3);
    expect(nightsBetween("2027-01-04T15:30:00+07:00", "2027-01-07T10:00:00+07:00")).toBe(3);
    expect(nightsBetween(null, "2027-01-07")).toBe(0);
    expect(nightsBetween("2027-01-07", "2027-01-04")).toBe(0);
  });
});
