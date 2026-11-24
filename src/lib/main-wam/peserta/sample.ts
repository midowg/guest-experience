import { carbonEstimate, type CarbonData, type CarbonResult } from "../panitia/carbon";
import type { CarbonTravel } from "@/lib/pra-wam/carbon";
import { personalCarbonEstimate, type CarbonPageModel, type PersonalCarbonData, type PersonalCarbonResult } from "./carbon-saya";

/*
 * Sample Jejak karbon (dev-preview, tests, and the demo's fallback): the design's example, 120
 * people, 60 rooms × 3 nights, 1.440 meals, a train there and back and the shuttle, about 13 t
 * CO₂e before the hotel's bills. Names stay fictional.
 */

const noBills = { listrikKwh: null, airM3: null, lpgKg: null, sampahKg: null };

export const sampleCarbonData: CarbonData = {
  people: 120,
  roomNights: 180,
  rooms: 60,
  nights: 3,
  trainLegs: [{ km: 520, passengers: 120 }, { km: 520, passengers: 120 }],
  busLegs: [{ km: 180, buses: 4 }, { km: 180, buses: 4 }],
  portions: 1440,
  bills: noBills,
};

/** The estimate of the design's example; `over` changes what was counted (a smaller event, bills in). */
export const sampleCarbon = (over: Partial<CarbonData> = {}): CarbonResult => carbonEstimate({ ...sampleCarbonData, ...over });

/*
 * The person's own footprint in the same example (Jejak karbon per person, 24 Nov 2026): a seat on the
 * train both ways and the shuttle (4 buses of 30), a room shared by three for 3 nights,
 * 12 meals. About 113 kg CO₂e against the event average of 145 kg. Fictional.
 */
export const samplePersonalData: PersonalCarbonData = {
  legs: [
    { mode: "kereta", km: 520, sharedBy: 1, listed: true }, { mode: "kereta", km: 520, sharedBy: 1, listed: true },
    { mode: "bus", km: 180, sharedBy: 30, listed: true }, { mode: "bus", km: 180, sharedBy: 30, listed: true },
  ],
  nights: 3, roomOccupants: 3, meals: 12, hotelAverageKg: 94, hotelFromBills: false,
};

export const samplePersonalCarbon = (over: Partial<PersonalCarbonData> = {}, answer: CarbonTravel | null = null): PersonalCarbonResult => personalCarbonEstimate({ ...samplePersonalData, ...over }, answer);

/** Sample answers in Jejak karbon's calculator (fictional): small things only, and an own trip by car (a long way, round trip). */
export const sampleCarbonAnswer: CarbonTravel = { own: null, bottles: 6, laptopHours: 14, phoneCharges: 5, answeredAt: "2027-01-04T10:00:00+07:00" };
export const sampleCarbonOwnAnswer: CarbonTravel = { own: { from: "Magelang", mode: "mobil", km: 410, roundTrip: true }, bottles: 6, laptopHours: 14, phoneCharges: 5, answeredAt: "2027-01-04T10:00:00+07:00" };

/** The Jejak karbon page's model from the example (previews, tests): what it recounts from, with the options of the previews. */
export function sampleCarbonModel(options: { data?: Partial<PersonalCarbonData> | null; overall?: CarbonPageModel["overall"]; answer?: CarbonTravel | null; open?: boolean; storage?: "ok" | "waiting"; now: string }): CarbonPageModel {
  return {
    data: options.data === null ? null : { ...samplePersonalData, ...options.data },
    answer: options.answer ?? null,
    overall: options.overall === undefined ? sampleCarbon() : options.overall,
    open: options.open ?? true, storage: options.storage ?? "ok", now: options.now,
  };
}
