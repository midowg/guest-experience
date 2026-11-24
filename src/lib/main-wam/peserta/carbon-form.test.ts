import { describe, expect, it } from "vitest";
import { carbonAnswerInputSchema, carbonParts, personCarbonInput, type CarbonTravel } from "@/lib/pra-wam/carbon";
import {
  CARBON_EXTRA_LIMIT, answerOfDraft, carbonFormOpen, carbonPageFromModel, draftOf, draftProblems, kgText, personalCarbonEstimate, sameDraft, tripNote,
  type PersonalCarbonData,
} from "./carbon-saya";
import { sampleCarbonModel, samplePersonalData } from "./sample";

/* Jejak karbon WAM 2026 as a calculator like Pra WAM's: the same answers give the same kilograms (parity), the form's rules. */

const base: PersonalCarbonData = { legs: [], nights: 3, roomOccupants: 3, meals: 12, hotelAverageKg: 0, hotelFromBills: false };
const answer = (over: Partial<CarbonTravel> = {}): CarbonTravel => ({ own: null, bottles: 0, laptopHours: 0, phoneCharges: 0, answeredAt: "2027-01-04T10:00:00Z", ...over });

describe("parity with Pra WAM: the same input, the same kilograms", () => {
  const trip = { from: "Kantor", to: "Venue", mode: "mobil" as const, km: 120, perVehicle: 4, roundTrip: true };
  const cases: [string, CarbonTravel][] = [
    ["nothing told", answer()],
    ["small things", answer({ bottles: 6, laptopHours: 14, phoneCharges: 5 })],
    ["own trip by car, round trip", answer({ own: { from: "Magelang", mode: "mobil", km: 410, roundTrip: true }, bottles: 2 })],
    ["own trip by motorbike, one way", answer({ own: { from: "Solo", mode: "motor", km: 60, roundTrip: false }, laptopHours: 3 })],
    ["own trip by train", answer({ own: { from: "Jakarta", mode: "kereta", km: 800, roundTrip: true }, phoneCharges: 2 })],
    ["own trip, other (not counted)", answer({ own: { from: "Bali", mode: "lainnya", km: 0, roundTrip: true } })],
  ];
  for (const [name, told] of cases) {
    it(name, () => {
      // Pra WAM counts a person (its own function) from the same answer, a room of three, 3 nights, 12 meals; a car trip as the group's.
      const pra = personCarbonInput({ settings: { nights: 3, mealsPerPerson: 12 }, trip }, told, 3)!;
      const praParts = carbonParts(pra);
      // WAM 2026's person has the same group trip as a car (via their own legs in the data when there is no own trip).
      const data: PersonalCarbonData = {
        ...base,
        legs: told.own ? [] : [0, 1].map(() => ({ mode: "bus" as const, km: 120, sharedBy: 4, listed: true })),
      };
      const mine = personalCarbonEstimate(data, told);
      expect(mine.parts.hotel).toBeCloseTo(praParts.kamar, 9);
      expect(mine.parts.makan).toBeCloseTo(praParts.makan, 9);
      expect(mine.parts.perangkat).toBeCloseTo(praParts.perangkat, 9);
      // An own trip is the same sum; the group's trip differs in the vehicle (a bus here, a car there), so only compare when own.
      if (told.own) expect(mine.parts.perjalanan).toBeCloseTo(praParts.perjalanan, 9);
      expect(mine.kg).toBeCloseTo(mine.parts.hotel + mine.parts.perjalanan + mine.parts.makan + mine.parts.perangkat, 9);
    });
  }
});

describe("parity of the group's trip", () => {
  it("a train both ways and a bus shared by 30: the same sums as Pra WAM's legs", () => {
    const pra = carbonParts({ legs: [
      { mode: "kereta", label: "", km: 520 }, { mode: "kereta", label: "", km: 520 },
      { mode: "bus", label: "", km: 180, sharedBy: 30 }, { mode: "bus", label: "", km: 180, sharedBy: 30 },
    ], nights: 3, roomOccupants: 3, meals: 12 });
    const mine = personalCarbonEstimate(samplePersonalData);
    expect(mine.parts.perjalanan).toBeCloseTo(pra.perjalanan, 9);
    expect(mine.parts.hotel).toBeCloseTo(pra.kamar, 9);
    expect(mine.parts.makan).toBeCloseTo(pra.makan, 9);
  });
});

describe("the person's answer in the estimate", () => {
  it("an own trip replaces the group's legs and is never 'assumed'", () => {
    const data = { ...base, legs: [{ mode: "kereta" as const, km: 520, sharedBy: 1, listed: false }] };
    expect(personalCarbonEstimate(data).assumed.perjalanan).toBe(true);
    const own = personalCarbonEstimate(data, answer({ own: { from: "Magelang", mode: "mobil", km: 100, roundTrip: true } }));
    expect(own.assumed.perjalanan).toBe(false);
    expect(own.basis.trainKm).toBe(0);
    expect(own.basis.carKm).toBe(200);
    expect(tripNote(own)).toBe("Berangkat sendiri · Mobil 200 km");
  });

  it("an incomplete own trip is ignored (the group's trip stays)", () => {
    const data = { ...base, legs: [{ mode: "kereta" as const, km: 520, sharedBy: 1, listed: true }] };
    const result = personalCarbonEstimate(data, answer({ own: { from: "", mode: "mobil", km: 0, roundTrip: true } }));
    expect(result.basis.trainKm).toBe(520);
  });

  it("devices and bottles are counted; the tiles say each one's kilograms", () => {
    const result = personalCarbonEstimate(base, answer({ bottles: 10, laptopHours: 10, phoneCharges: 10 }));
    expect(result.tiles.botol).toBeCloseTo(1, 9);
    expect(result.tiles.laptop).toBeCloseTo(10 * 0.032 * 0.87, 9);
    expect(result.tiles.hp).toBeCloseTo(10 * 0.019 * 0.87, 9);
    expect(result.parts.makan).toBeCloseTo(12 * 1.9 + 1, 9);
  });

  it("the page model recounts from a draft: the total follows what is typed", () => {
    const model = sampleCarbonModel({ now: "2027-01-04T10:00:00Z" });
    const before = carbonPageFromModel(model, null);
    const after = carbonPageFromModel(model, answer({ own: { from: "Magelang", mode: "mobil", km: 410, roundTrip: true } }));
    expect(before.result!.kg).toBeLessThan(after.result!.kg);
    expect(before.mine.kind === "ada" && before.mine.total.value).not.toBe(after.mine.kind === "ada" && after.mine.total.value);
  });

  it("nothing to count: no result", () => {
    const model = sampleCarbonModel({ data: null, overall: null, now: "2027-01-04T10:00:00Z" });
    expect(carbonPageFromModel(model, null).result).toBeNull();
  });
});

describe("the form's rules", () => {
  it("the limits are Pra WAM's: at the limit passes its schema, one over fails", () => {
    const ok = { own: null, bottles: CARBON_EXTRA_LIMIT.bottles, laptopHours: CARBON_EXTRA_LIMIT.laptopHours, phoneCharges: CARBON_EXTRA_LIMIT.phoneCharges };
    expect(carbonAnswerInputSchema.safeParse(ok).success).toBe(true);
    expect(carbonAnswerInputSchema.safeParse({ ...ok, bottles: 51 }).success).toBe(false);
    expect(carbonAnswerInputSchema.safeParse({ ...ok, laptopHours: 73 }).success).toBe(false);
    expect(carbonAnswerInputSchema.safeParse({ ...ok, phoneCharges: 21 }).success).toBe(false);
  });

  it("validation: an own trip needs a place and 1–3.000 km (none needed for Lainnya); extras over the limit are flagged; empty is fine", () => {
    const draft = draftOf(null);
    expect(draftProblems(draft).any).toBe(false);
    expect(draftProblems({ ...draft, own: { from: "", mode: "mobil", km: 10, roundTrip: true } }).own).toBe(true);
    expect(draftProblems({ ...draft, own: { from: "Solo", mode: "mobil", km: 3001, roundTrip: true } }).own).toBe(true);
    expect(draftProblems({ ...draft, own: { from: "Solo", mode: "mobil", km: 3000, roundTrip: true } }).own).toBe(false);
    expect(draftProblems({ ...draft, own: { from: "Solo", mode: "lainnya", km: 0, roundTrip: true } }).own).toBe(false);
    expect(draftProblems({ ...draft, bottles: "51" }).extra.bottles).toBe(true);
    expect(draftProblems({ ...draft, laptopHours: "72,5" }).extra.laptopHours).toBe(true);
    expect(draftProblems({ ...draft, phoneCharges: "-3" }).any).toBe(false);
  });

  it("a draft becomes an answer (comma decimals, empty = 0, never negative) and 'dirty' compares what it says", () => {
    const answered = answerOfDraft({ own: null, bottles: "", laptopHours: "2,5", phoneCharges: "-1" });
    expect([answered.bottles, answered.laptopHours, answered.phoneCharges]).toEqual([0, 2.5, 0]);
    expect(sameDraft(draftOf(null), { own: null, bottles: "0", laptopHours: "", phoneCharges: "" })).toBe(true);
    expect(sameDraft(draftOf(null), { ...draftOf(null), bottles: "1" })).toBe(false);
  });

  it("answers are taken until a week after the event's last day (WIB)", () => {
    expect(carbonFormOpen("2027-01-07", new Date("2027-01-10T00:00:00+07:00"))).toBe(true);
    expect(carbonFormOpen("2027-01-07", new Date("2027-01-15T00:00:00+07:00"))).toBe(false);
    expect(carbonFormOpen(null, new Date("2030-01-01"))).toBe(true);
  });

  it("kilograms of a tile: one decimal under 10, whole above, in the language's style", () => {
    expect(kgText(0.44)).toBe("0,4 kg");
    expect(kgText(0.44, "en")).toBe("0.4 kg");
    expect(kgText(42.4)).toBe("42 kg");
    expect(kgText(0)).toBe("0 kg");
  });

  it("the sample person has no name in what the page recounts from", () => {
    expect(JSON.stringify(sampleCarbonModel({ now: "2027-01-04T10:00:00Z" }))).not.toMatch(/Rani|Sari|Dimas/);
    expect(Object.keys(samplePersonalData).sort()).toEqual(["hotelAverageKg", "hotelFromBills", "legs", "meals", "nights", "roomOccupants"]);
  });
});
