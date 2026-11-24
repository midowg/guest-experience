import { CARBON_FACTORS, type CarbonResult } from "../panitia/carbon";
import { clock, number, shortDateOfInstant, t, type Lang } from "../i18n";
import { wibTime } from "../rundown";
import type { MwSession, MwTrip } from "../types";
import { CARBON_SOURCES, carbonView, perPersonKg, splitPercent, type CarbonSource, type CarbonSourceView, type CarbonView } from "./carbon";

/*
 * Jejak karbon PER PERSON in WAM 2026 (24 Nov 2026, owner's request: "per user seperti Pra WAM").
 * Same pattern as Pra WAM (src/lib/pra-wam/carbon.ts): the person's own trip, their share of the room
 * (the room's nights split by who sleeps in it) and their meals, with the same factors
 * (CARBON_FACTORS of panitia/carbon.ts, nothing new). Nobody fills a form: it is counted from what Admin
 * WAM holds (the person's seats in mw_trip_seats, HR's room pairing, the rundown's meals), and an input
 * that is not there yet is counted as a stated assumption ("perkiraan"), never silently.
 * Privacy: this module only ever sees the person's own seats and the event's totals; no other name.
 * Pure: the server gathers the data (src/lib/server/main-wam/peserta/carbon.ts).
 */

/** One leg of the person's trip: a train per passenger, a bus split between those on it. */
export type PersonalLeg = {
  mode: "kereta" | "bus";
  km: number;
  /** Bus only: how many people share the bus (its km are split between them). */
  sharedBy: number;
  /** The person has a seat on this leg (listed); false = assumed, because the leg has no seat list yet. */
  listed: boolean;
};

export type PersonalCarbonData = {
  legs: PersonalLeg[];
  /** Nights in the room; 0 when unknown. */
  nights: number;
  /** People in the person's room, themself included; 0 = the room is not known (before HR publishes). */
  roomOccupants: number;
  /** Meals at the event (porsi, one each). */
  meals: number;
  /** The event's hotel part, kg, split evenly: the share used when the bills are in, or the room is not known. */
  hotelAverageKg: number;
  /** The hotel's four bills are in: the hotel part is the bills', split evenly. */
  hotelFromBills: boolean;
};

export type PersonalCarbonResult = {
  kg: number;
  parts: Record<CarbonSource, number>;
  /** Which parts rest on an assumption ("perkiraan"): no seat listed, room not known. */
  assumed: { perjalanan: boolean; hotel: boolean };
  hotelFrom: "kamar" | "tagihan" | "rata";
  basis: { trainKm: number; busKm: number; nights: number; roomOccupants: number; meals: number };
  empty: boolean;
};

const positive = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** The person's footprint, kg CO₂e, from the same factors the event is counted with. */
export function personalCarbonEstimate(data: PersonalCarbonData): PersonalCarbonResult {
  const f = CARBON_FACTORS;
  let trainKm = 0;
  let busKm = 0;
  let perjalanan = 0;
  for (const leg of data.legs) {
    const km = positive(leg.km);
    if (km <= 0) continue;
    if (leg.mode === "kereta") { trainKm += km; perjalanan += km * f.keretaPerPenumpangKm; }
    else { busKm += km; perjalanan += (km * f.busPerBusKm) / Math.max(1, positive(leg.sharedBy)); }
  }
  const roomKnown = positive(data.roomOccupants) > 0 && positive(data.nights) > 0;
  const hotelFrom = data.hotelFromBills ? "tagihan" : roomKnown ? "kamar" : "rata";
  const hotel = hotelFrom === "kamar" ? (positive(data.nights) * f.hotelPerKamarMalam) / positive(data.roomOccupants) : positive(data.hotelAverageKg);
  const makan = positive(data.meals) * f.makanPerPorsi;
  const kg = perjalanan + hotel + makan;
  return {
    kg, parts: { hotel, perjalanan, makan },
    assumed: { perjalanan: data.legs.some(leg => !leg.listed), hotel: hotelFrom === "rata" },
    hotelFrom,
    basis: { trainKm, busKm, nights: positive(data.nights), roomOccupants: positive(data.roomOccupants), meals: positive(data.meals) },
    empty: kg <= 0,
  };
}

/**
 * The person's data from what Admin WAM holds. A trip with a seat list counts only for those listed on it;
 * a trip without one counts for everyone (as the event's total does), marked as assumed. The bus's km are
 * split between the people on it: the seats listed, else everyone, over its vehicles.
 */
export function personalCarbonDataFrom(input: {
  people: number;
  nights: number;
  /** People in the person's room, themself included; 0 = not known. */
  roomOccupants: number;
  trips: Pick<MwTrip, "id" | "kind" | "distanceKm" | "vehicles">[];
  /** Seats listed per trip id (everyone's, only the count is used). */
  seatCount: ReadonlyMap<string, number>;
  /** Trip ids the person has a seat on. */
  mySeats: ReadonlySet<string>;
  sessions: Pick<MwSession, "kind" | "status">[];
  /** The event's total, for the hotel part shared evenly (bills, or a room that is not known). */
  overall: Pick<CarbonResult, "parts" | "hotelFrom"> | null;
}): PersonalCarbonData {
  const legs: PersonalLeg[] = [];
  for (const trip of input.trips) {
    if (trip.kind !== "kereta" && trip.kind !== "bus") continue;
    const km = positive(trip.distanceKm);
    if (km <= 0) continue;
    const seats = input.seatCount.get(trip.id) ?? 0;
    if (seats > 0 && !input.mySeats.has(trip.id)) continue;
    const riders = seats > 0 ? seats : input.people;
    legs.push({ mode: trip.kind, km, sharedBy: trip.kind === "bus" ? Math.max(1, riders / (positive(trip.vehicles) || 1)) : 1, listed: seats > 0 });
  }
  const people = positive(input.people);
  return {
    legs, nights: positive(input.nights), roomOccupants: positive(input.roomOccupants),
    meals: input.sessions.filter(session => session.kind === "makan" && session.status === "terbit").length,
    hotelAverageKg: people > 0 && input.overall ? input.overall.parts.hotel / people : 0,
    hotelFromBills: input.overall?.hotelFrom === "tagihan",
  };
}

/** "134 kg" for one person: always kilograms (a person is never counted in tonnes), "<1" under a kilogram. */
export function personalFigure(kg: number, lang: Lang = "id"): { value: string; unit: string } {
  const whole = Math.round(kg);
  return { value: whole < 1 ? "<1" : number(lang, whole), unit: "kg CO₂e" };
}

export type CompareState = "lower" | "near" | "higher";

/** The person against the average of everyone: within 5 % is "near". Null without an average. */
export function compareWithAverage(kg: number, averageKg: number | null): { state: CompareState; percent: number } | null {
  if (!averageKg || averageKg <= 0 || kg <= 0) return null;
  const percent = Math.round((Math.abs(kg - averageKg) / averageKg) * 100);
  return { state: percent < 5 ? "near" : kg < averageKg ? "lower" : "higher", percent };
}

export type PersonalCarbonView =
  | {
    kind: "ada";
    kg: number;
    /** "134" and "kg CO₂e". */
    total: { value: string; unit: string };
    /** Always an estimate: the card and the page say "perkiraan". */
    sources: CarbonSourceView[];
    barLabel: string;
    /** Nothing in it rests on an assumption: the seats and the room are known. */
    complete: boolean;
    /** "12% di bawah rata-rata peserta"; null when the event has no average yet. */
    compare: { state: CompareState; text: string; average: string } | null;
    /** Short tips for the sources that count, biggest first (at most 3). */
    tips: string[];
    updated: string;
  }
  /** Nothing to count for the person yet ("menunggu data"). */
  | { kind: "belum" };

function personalNote(key: CarbonSource, result: PersonalCarbonResult, lang: Lang): string {
  const { basis } = result;
  switch (key) {
    case "hotel":
      if (result.hotelFrom === "tagihan") return t(lang, "peserta.carbon.me.note.hotelBills");
      if (result.hotelFrom === "rata") return t(lang, "peserta.carbon.me.note.hotelAverage");
      return basis.roomOccupants > 1
        ? t(lang, "peserta.carbon.me.note.roomShared", { nights: number(lang, basis.nights), n: number(lang, basis.roomOccupants) })
        : t(lang, "peserta.carbon.me.note.roomAlone", { nights: number(lang, basis.nights) });
    case "perjalanan": {
      const kinds = [
        basis.trainKm > 0 ? t(lang, "peserta.carbon.me.note.train", { km: number(lang, Math.round(basis.trainKm)) }) : "",
        basis.busKm > 0 ? t(lang, "peserta.carbon.me.note.shuttle", { km: number(lang, Math.round(basis.busKm)) }) : "",
      ].filter(Boolean).join(" · ");
      return result.assumed.perjalanan ? `${kinds} · ${t(lang, "peserta.carbon.me.note.noSeat")}` : kinds;
    }
    case "makan": return t(lang, "peserta.carbon.note.meals", { n: number(lang, basis.meals) });
  }
}

/** The person's view; `overall` (the event's estimate) gives the average to compare with. Null or empty: "belum". */
export function personalCarbonView(result: PersonalCarbonResult | null, overall: CarbonResult | null, now: Date, lang: Lang = "id"): PersonalCarbonView {
  if (!result || result.empty) return { kind: "belum" };
  const present = CARBON_SOURCES.filter(key => result.parts[key] > 0).sort((a, b) => result.parts[b] - result.parts[a] || CARBON_SOURCES.indexOf(a) - CARBON_SOURCES.indexOf(b));
  const percents = splitPercent(present.map(key => result.parts[key]));
  const sources = present.map((key, index): CarbonSourceView => {
    const assumed = key === "perjalanan" ? result.assumed.perjalanan : key === "hotel" ? result.assumed.hotel || result.hotelFrom === "kamar" : false;
    return {
      key, title: t(lang, `peserta.carbon.source.${key}`),
      amount: `${assumed ? "≈" : ""}${number(lang, Math.max(1, Math.round(result.parts[key])))} kg`,
      percent: percents[index], note: personalNote(key, result, lang), swatch: (index + 1) as 1 | 2 | 3,
    };
  });
  const averageKg = overall && !overall.empty ? perPersonKg(overall.kg, overall.basis.people) : null;
  const compared = compareWithAverage(result.kg, averageKg);
  return {
    kind: "ada", kg: result.kg, total: personalFigure(result.kg, lang), sources,
    barLabel: sources.map(source => `${source.title} ${source.percent}%`).join(", "),
    complete: !result.assumed.perjalanan && !result.assumed.hotel,
    compare: compared && averageKg !== null
      ? { state: compared.state, average: `${number(lang, averageKg)} kg`, text: t(lang, `peserta.carbon.me.compare.${compared.state}`, { percent: number(lang, compared.percent) }) }
      : null,
    tips: present.slice(0, 3).map(key => t(lang, `peserta.carbon.tip.${key}`)),
    updated: `${shortDateOfInstant(lang, now)} · ${clock(lang, wibTime(now.toISOString()))}`,
  };
}

/** What the Jejak karbon page and Beranda's card show: the person's own, and the whole event. */
export type CarbonPageView = { mine: PersonalCarbonView; overall: CarbonView };

export function carbonPageView(mine: PersonalCarbonResult | null, overall: CarbonResult | null, now: Date, lang: Lang = "id"): CarbonPageView {
  return { mine: personalCarbonView(mine, overall, now, lang), overall: carbonView(overall, now, lang) };
}
