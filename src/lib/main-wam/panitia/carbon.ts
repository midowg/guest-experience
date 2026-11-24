import type { CarbonInputs, MwSession, MwTrip } from "../types";

/*
 * Jejak karbon of the event, for Jejak karbon's page (ANALISA_FITUR_16NOV §3, SPEC K09 and
 * Penpot "00b Detail emisi & contoh"). Nobody fills a form for it: it is counted from what Admin WAM
 * already holds (people, HR's room pairing, the trips, the rundown's meals) and, after the event,
 * the hotel's bills. Pure: the server gathers the data (src/lib/server/main-wam/panitia/carbon.ts).
 *
 * Factors (kg CO₂e, all "perlu dicek" in the design):
 *   kereta 0,0164 per penumpang-km · bus 0,89 per bus-km · makan 1,9 per porsi
 *   hotel ≈62,7 per kamar-malam (DEFRA 2025, Indonesia; was 40 until 23 Nov 2026) while the bills are not in, otherwise
 *   listrik 0,87/kWh · air 0,4/m³ · LPG 2,94/kg · sampah 0,5/kg
 */

export const CARBON_FACTORS = {
  keretaPerPenumpangKm: 0.0164,
  busPerBusKm: 0.89,
  makanPerPorsi: 1.9,
  hotelPerKamarMalam: 62.7,
  listrikPerKwh: 0.87,
  airPerM3: 0.4,
  lpgPerKg: 2.94,
  sampahPerKg: 0.5,
} as const;

/** What the estimate needs, already counted. */
export type CarbonData = {
  /** People at the event (meals, and train passengers when a leg has no seats listed). */
  people: number;
  /** Rooms in use × nights. */
  roomNights: number;
  /** The two factors of `roomNights`, for the page that says "60 kamar × 3 malam" (0 or left out: not known). */
  rooms?: number;
  nights?: number;
  /** Each train leg: its km and how many ride it. */
  trainLegs: { km: number; passengers: number }[];
  /** Each bus leg: its km and how many buses run it. */
  busLegs: { km: number; buses: number }[];
  /** Meals served (porsi). */
  portions: number;
  /** The hotel's bills (Admin WAM → Info acara, after the event). */
  bills: Pick<CarbonInputs, "listrikKwh" | "airM3" | "lpgKg" | "sampahKg">;
};

/** What was counted, in the words of the page: "60 kamar × 3 malam", "1.440 porsi", the kinds of trip. */
export type CarbonBasis = { people: number; rooms: number; nights: number; roomNights: number; portions: number; trainLegs: number; busLegs: number };

export type CarbonResult = {
  /** Everything, kg CO₂e. */
  kg: number;
  /** Tonnes rounded to one decimal (13.6). */
  tonnes: number;
  parts: { perjalanan: number; hotel: number; makan: number };
  /** The hotel part from the four bills, or the estimate per kamar-malam. */
  hotelFrom: "tagihan" | "perkiraan";
  /** Nothing to count yet (no people, rooms, trips or meals). */
  empty: boolean;
  basis: CarbonBasis;
};

const positive = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const billsComplete = (bills: CarbonData["bills"]) => [bills.listrikKwh, bills.airM3, bills.lpgKg, bills.sampahKg].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0);

/** The estimate, in kg and tonnes. The hotel's bills replace the per-room estimate once all four are in. */
export function carbonEstimate(data: CarbonData): CarbonResult {
  const f = CARBON_FACTORS;
  const kereta = data.trainLegs.reduce((sum, leg) => sum + positive(leg.km) * positive(leg.passengers) * f.keretaPerPenumpangKm, 0);
  const bus = data.busLegs.reduce((sum, leg) => sum + positive(leg.km) * positive(leg.buses) * f.busPerBusKm, 0);
  const makan = positive(data.portions) * f.makanPerPorsi;
  const fromBills = billsComplete(data.bills);
  const hotel = fromBills
    ? positive(data.bills.listrikKwh) * f.listrikPerKwh + positive(data.bills.airM3) * f.airPerM3 + positive(data.bills.lpgKg) * f.lpgPerKg + positive(data.bills.sampahKg) * f.sampahPerKg
    : positive(data.roomNights) * f.hotelPerKamarMalam;
  const kg = kereta + bus + makan + hotel;
  return {
    kg, tonnes: Math.round(kg / 100) / 10,
    parts: { perjalanan: kereta + bus, hotel, makan },
    hotelFrom: fromBills ? "tagihan" : "perkiraan",
    empty: kg <= 0,
    basis: {
      people: positive(data.people), rooms: positive(data.rooms), nights: positive(data.nights), roomNights: positive(data.roomNights), portions: positive(data.portions),
      trainLegs: data.trainLegs.filter(leg => positive(leg.km) > 0 && positive(leg.passengers) > 0).length, busLegs: data.busLegs.filter(leg => positive(leg.km) > 0 && positive(leg.buses) > 0).length,
    },
  };
}

/** Nights between check-in and check-out dates ("2027-01-04" → "2027-01-07" = 3); 0 when unknown. */
export function nightsBetween(first: string | null | undefined, last: string | null | undefined): number {
  if (!first || !last) return 0;
  const days = Math.round((Date.parse(`${last.slice(0, 10)}T12:00:00Z`) - Date.parse(`${first.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/**
 * The estimate's data from what Admin WAM holds: trips (kereta: km × the seats listed for it, or
 * everyone; bus: km × buses), the rundown's meals that are not cancelled (each a portion per
 * person), and rooms × nights.
 */
export function carbonDataFrom(input: {
  people: number;
  rooms: number;
  nights: number;
  trips: Pick<MwTrip, "id" | "kind" | "distanceKm" | "vehicles">[];
  /** Seats listed per trip id (people on that leg). */
  seats: ReadonlyMap<string, number>;
  sessions: Pick<MwSession, "kind" | "status">[];
  bills: CarbonData["bills"];
}): CarbonData {
  const meals = input.sessions.filter(session => session.kind === "makan" && session.status === "terbit").length;
  return {
    people: input.people,
    roomNights: input.rooms * input.nights,
    rooms: input.rooms,
    nights: input.nights,
    trainLegs: input.trips.filter(trip => trip.kind === "kereta" && positive(trip.distanceKm) > 0)
      .map(trip => ({ km: positive(trip.distanceKm), passengers: input.seats.get(trip.id) || input.people })),
    busLegs: input.trips.filter(trip => trip.kind === "bus" && positive(trip.distanceKm) > 0)
      .map(trip => ({ km: positive(trip.distanceKm), buses: positive(trip.vehicles) || 1 })),
    portions: meals * input.people,
    bills: input.bills,
  };
}
