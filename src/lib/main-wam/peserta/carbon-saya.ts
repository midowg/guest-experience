import { calculatorTiles, carbonParts, ownTripValid, type CarbonLeg, type CarbonTravel, type OwnTrip } from "@/lib/pra-wam/carbon";
import { CARBON_FACTORS, type CarbonResult } from "../panitia/carbon";
import { clock, number, shortDateOfInstant, t, type Lang } from "../i18n";
import { wibTime } from "../rundown";
import type { MwSession, MwTrip } from "../types";
import { carbonView, perPersonKg, splitPercent, type CarbonSourceView, type CarbonView } from "./carbon";

/*
 * Jejak karbon PER PERSON in WAM 2026 (24 Nov 2026, owner's request: "per user seperti Pra WAM").
 * Same pattern as Pra WAM (src/lib/pra-wam/carbon.ts): the person's own trip, their share of the room
 * (the room's nights split by who sleeps in it) and their meals, with the same factors
 * (CARBON_FACTORS of panitia/carbon.ts, nothing new). Nobody fills a form: it is counted from what Admin
 * WAM holds (the person's seats in mw_trip_seats, HR's room pairing, the rundown's meals), and an input
 * that is not there yet is counted as a stated assumption ("perkiraan"), never silently.
 *
 * Revision 24 Nov 2026 (owner: "untuk emisi dibuat saja seperti Pra WAM"): the person also tells what only they
 * know, the same as Pra WAM's calculator: their own trip when they do not go with the group (mobil, motor, kereta,
 * lainnya, jarak, pulang-pergi), single-use bottles, laptop hours and phone charges. Those parts are counted by Pra
 * WAM's own functions (src/lib/pra-wam/carbon.ts carbonParts and calculatorTiles), so the same answers give the
 * same kilograms in both apps (a test keeps it so); only the room and the hotel's bills are WAM 2026's.
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

/** The parts of one person's footprint: WAM 2026's three, and "perangkat" (laptop and phone charges) as in Pra WAM. */
export const PERSONAL_SOURCES = ["hotel", "perjalanan", "makan", "perangkat"] as const;
export type PersonalSource = (typeof PERSONAL_SOURCES)[number];

/** The calculator's tiles in kg (Pra WAM's calculatorTiles, the room being WAM 2026's hotel part). */
export type PersonalTiles = { perjalanan: number; kamar: number; makan: number; botol: number; laptop: number; hp: number };

export type PersonalCarbonResult = {
  kg: number;
  parts: Record<PersonalSource, number>;
  tiles: PersonalTiles;
  /** Which parts rest on an assumption ("perkiraan"): no seat listed, room not known. */
  assumed: { perjalanan: boolean; hotel: boolean };
  hotelFrom: "kamar" | "tagihan" | "rata";
  basis: {
    trainKm: number; busKm: number; carKm: number; motorKm: number;
    /** All the km counted, every leg (a round trip counts twice). */
    legKm: number;
    nights: number; roomOccupants: number; meals: number;
    bottles: number; laptopHours: number; phoneCharges: number;
    /** The person's own trip (they do not go with the group), or null. */
    own: OwnTrip | null;
  };
  empty: boolean;
};

const positive = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** The person's own trip as Pra WAM counts it (null: they go with the group, or it is not complete). "Lainnya" is not counted. */
function ownLegs(own: OwnTrip): CarbonLeg[] {
  if (own.mode === "lainnya") return [];
  return Array.from({ length: own.roundTrip ? 2 : 1 }, () => ({ mode: own.mode as Exclude<OwnTrip["mode"], "lainnya">, label: own.from, km: positive(own.km), sharedBy: 1 }));
}

/**
 * The person's footprint, kg CO₂e, from the same factors the event is counted with. `answer` is what they
 * told in the calculator (their own trip, bottles, laptop hours, phone charges); none: the group's trip and 0s.
 * Travel, meals, bottles and devices are Pra WAM's own sums (carbonParts); the room and the bills are WAM 2026's.
 */
export function personalCarbonEstimate(data: PersonalCarbonData, answer?: Pick<CarbonTravel, "own" | "bottles" | "laptopHours" | "phoneCharges"> | null): PersonalCarbonResult {
  const f = CARBON_FACTORS;
  const own = answer?.own && ownTripValid(answer.own) ? answer.own : null;
  const legs: CarbonLeg[] = own
    ? ownLegs(own)
    : data.legs.filter(leg => positive(leg.km) > 0).map(leg => ({ mode: leg.mode, label: "", km: positive(leg.km), sharedBy: leg.mode === "bus" ? Math.max(1, positive(leg.sharedBy)) : undefined }));
  const input = { legs, nights: 0, roomOccupants: 1, meals: positive(data.meals), bottles: positive(answer?.bottles), laptopHours: positive(answer?.laptopHours), phoneCharges: positive(answer?.phoneCharges) };
  const base = carbonParts(input);
  const roomKnown = positive(data.roomOccupants) > 0 && positive(data.nights) > 0;
  const hotelFrom = data.hotelFromBills ? "tagihan" : roomKnown ? "kamar" : "rata";
  const hotel = hotelFrom === "kamar" ? (positive(data.nights) * f.hotelPerKamarMalam) / positive(data.roomOccupants) : positive(data.hotelAverageKg);
  const tiles = calculatorTiles(input);
  const kmOf = (mode: CarbonLeg["mode"]) => legs.filter(leg => leg.mode === mode).reduce((sum, leg) => sum + leg.km, 0);
  const kg = base.perjalanan + hotel + base.makan + base.perangkat;
  return {
    kg, parts: { hotel, perjalanan: base.perjalanan, makan: base.makan, perangkat: base.perangkat },
    tiles: { perjalanan: tiles.perjalanan, kamar: hotel, makan: tiles.makan, botol: tiles.botol, laptop: tiles.laptop, hp: tiles.hp },
    assumed: { perjalanan: !own && data.legs.some(leg => !leg.listed), hotel: hotelFrom === "rata" },
    hotelFrom,
    basis: {
      trainKm: kmOf("kereta"), busKm: kmOf("bus"), carKm: kmOf("mobil"), motorKm: kmOf("motor"), legKm: legs.reduce((sum, leg) => sum + leg.km, 0),
      nights: positive(data.nights), roomOccupants: positive(data.roomOccupants), meals: positive(data.meals),
      bottles: input.bottles, laptopHours: input.laptopHours, phoneCharges: input.phoneCharges, own,
    },
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
    /** "Langkah kecil": the same three habits Pra WAM lists, nothing counted for them. */
    tips: string[];
    updated: string;
  }
  /** Nothing to count for the person yet ("menunggu data"). */
  | { kind: "belum" };

/** The trip in words: "Kereta 520 km · Shuttle 54 km", "Berangkat sendiri · Mobil 120 km", with "tiketmu belum terdata" when assumed. */
export function tripNote(result: PersonalCarbonResult, lang: Lang = "id"): string {
  const { basis } = result;
  if (basis.own?.mode === "lainnya") return t(lang, "peserta.carbon.me.note.otherTrip");
  const km = (value: number) => number(lang, Math.round(value));
  const kinds = [
    basis.trainKm > 0 ? t(lang, "peserta.carbon.me.note.train", { km: km(basis.trainKm) }) : "",
    basis.busKm > 0 ? t(lang, "peserta.carbon.me.note.shuttle", { km: km(basis.busKm) }) : "",
    basis.carKm > 0 ? t(lang, "peserta.carbon.me.note.car", { km: km(basis.carKm) }) : "",
    basis.motorKm > 0 ? t(lang, "peserta.carbon.me.note.motor", { km: km(basis.motorKm) }) : "",
  ].filter(Boolean).join(" · ");
  const line = basis.own ? `${t(lang, "peserta.carbon.me.note.own")} · ${kinds}` : kinds;
  return result.assumed.perjalanan ? `${line} · ${t(lang, "peserta.carbon.me.note.noSeat")}` : line;
}

function personalNote(key: PersonalSource, result: PersonalCarbonResult, lang: Lang): string {
  const { basis } = result;
  switch (key) {
    case "hotel":
      if (result.hotelFrom === "tagihan") return t(lang, "peserta.carbon.me.note.hotelBills");
      if (result.hotelFrom === "rata") return t(lang, "peserta.carbon.me.note.hotelAverage");
      return basis.roomOccupants > 1
        ? t(lang, "peserta.carbon.me.note.roomShared", { nights: number(lang, basis.nights), n: number(lang, basis.roomOccupants) })
        : t(lang, "peserta.carbon.me.note.roomAlone", { nights: number(lang, basis.nights) });
    case "perjalanan": return tripNote(result, lang);
    case "makan": return [
      t(lang, "peserta.carbon.note.meals", { n: number(lang, basis.meals) }),
      basis.bottles > 0 ? t(lang, "peserta.carbon.me.note.bottles", { n: number(lang, basis.bottles) }) : "",
    ].filter(Boolean).join(" · ");
    case "perangkat": return [
      basis.laptopHours > 0 ? t(lang, "peserta.carbon.me.note.laptop", { n: number(lang, basis.laptopHours) }) : "",
      basis.phoneCharges > 0 ? t(lang, "peserta.carbon.me.note.phone", { n: number(lang, basis.phoneCharges) }) : "",
    ].filter(Boolean).join(" · ");
  }
}

/** The titles of a person's parts: "Makan & minum" because the bottles are in it, as in Pra WAM. */
const personalTitle = (key: PersonalSource, lang: Lang) => t(lang, key === "makan" ? "peserta.carbon.me.source.makan" : key === "perangkat" ? "peserta.carbon.me.source.perangkat" : `peserta.carbon.source.${key}`);

/** The person's view; `overall` (the event's estimate) gives the average to compare with. Null or empty: "belum". */
export function personalCarbonView(result: PersonalCarbonResult | null, overall: CarbonResult | null, now: Date, lang: Lang = "id"): PersonalCarbonView {
  if (!result || result.empty) return { kind: "belum" };
  const present = PERSONAL_SOURCES.filter(key => result.parts[key] > 0).sort((a, b) => result.parts[b] - result.parts[a] || PERSONAL_SOURCES.indexOf(a) - PERSONAL_SOURCES.indexOf(b));
  const percents = splitPercent(present.map(key => result.parts[key]));
  const sources = present.map((key, index): CarbonSourceView => {
    const assumed = key === "perjalanan" ? result.assumed.perjalanan : key === "hotel" ? result.assumed.hotel || result.hotelFrom === "kamar" : false;
    return {
      key, title: personalTitle(key, lang),
      amount: `${assumed ? "≈" : ""}${number(lang, Math.max(1, Math.round(result.parts[key])))} kg`,
      percent: percents[index], note: personalNote(key, result, lang), swatch: (index + 1) as 1 | 2 | 3 | 4,
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
    tips: (["tumbler", "makan", "hotel"] as const).map(key => t(lang, `peserta.carbon.tip.${key}`)),
    updated: `${shortDateOfInstant(lang, now)} · ${clock(lang, wibTime(now.toISOString()))}`,
  };
}

/** What the Jejak karbon page and Beranda's card show: the person's own, and the whole event. */
export type CarbonPageView = { mine: PersonalCarbonView; overall: CarbonView };

export function carbonPageView(mine: PersonalCarbonResult | null, overall: CarbonResult | null, now: Date, lang: Lang = "id"): CarbonPageView {
  return { mine: personalCarbonView(mine, overall, now, lang), overall: carbonView(overall, now, lang) };
}

/*
 * What the Jejak karbon page needs to be a calculator (24 Nov 2026): the person's counted data (numbers only:
 * no name, no other seat), their saved answer, the event's estimate for the average and the detail, whether
 * answers are still taken, and whether they can be kept. The page recounts from it on every keystroke, so the
 * total on top follows what they type.
 */
export type CarbonPageModel = {
  /** Null: nothing to count for the person yet (the page says so, no form). */
  data: PersonalCarbonData | null;
  answer: CarbonTravel | null;
  overall: CarbonResult | null;
  /** Answers are taken until a week after the event's last day. */
  open: boolean;
  /** "waiting": the table that keeps answers is not there yet ("menunggu pembaruan sistem"); the page still counts. */
  storage: "ok" | "waiting";
  /** When it was counted (ISO). */
  now: string;
};

/** Answers are taken until a week after the event's last day (WIB); with no date, always. */
export function carbonFormOpen(endDate: string | null | undefined, now: Date): boolean {
  if (!endDate) return true;
  const end = Date.parse(`${endDate.slice(0, 10)}T23:59:59+07:00`);
  return !Number.isFinite(end) || now.getTime() <= end + 7 * 86_400_000;
}

/** The page's view from its model and the person's answer (saved, or being typed). */
export function carbonPageFromModel(model: CarbonPageModel, answer: CarbonTravel | null, lang: Lang = "id"): CarbonPageView & { result: PersonalCarbonResult | null } {
  const now = new Date(model.now);
  const result = model.data ? personalCarbonEstimate(model.data, answer) : null;
  return { ...carbonPageView(result, model.overall, now, lang), result };
}

/** The most a person may enter for each small thing: the same limits as Pra WAM's answer schema (a test keeps them equal). */
export const CARBON_EXTRA_LIMIT = { bottles: 50, laptopHours: 72, phoneCharges: 20 } as const;
/** The farthest own trip (km one way), as Pra WAM. */
export const CARBON_OWN_MAX_KM = 3000;

/** Kilograms for one tile in the language's number style: one decimal below 10 kg ("0,4 kg"), whole above ("42 kg"). */
export function kgText(kg: number, lang: Lang = "id"): string {
  if (!(kg > 0)) return `${number(lang, 0)} kg`;
  return kg < 10 ? `${number(lang, Math.max(0.1, Math.round(kg * 10) / 10), 1)} kg` : `${number(lang, Math.round(kg))} kg`;
}

/*
 * The calculator's draft: what the person is typing (text, so a field can be empty or half typed). The page counts
 * from it on every keystroke; Simpan sends it. Same rules as Pra WAM's calculator.
 */
export type CarbonDraft = { own: OwnTrip | null; bottles: string; laptopHours: string; phoneCharges: string };
export type ExtraKey = keyof typeof CARBON_EXTRA_LIMIT;
export const EXTRA_KEYS: readonly ExtraKey[] = ["bottles", "laptopHours", "phoneCharges"];

const asNumber = (text: string) => Math.max(0, Number(text.replace(",", ".")) || 0);

export const draftOf = (answer: CarbonTravel | null): CarbonDraft => ({
  own: answer?.own ?? null,
  bottles: answer?.bottles ? String(answer.bottles) : "", laptopHours: answer?.laptopHours ? String(answer.laptopHours) : "", phoneCharges: answer?.phoneCharges ? String(answer.phoneCharges) : "",
});

/** The draft as an answer (numbers, 0 for an empty field). */
export const answerOfDraft = (draft: CarbonDraft, now: Date = new Date()): CarbonTravel => ({
  own: draft.own, bottles: asNumber(draft.bottles), laptopHours: asNumber(draft.laptopHours), phoneCharges: asNumber(draft.phoneCharges), answeredAt: now.toISOString(),
});

/** What is wrong with the draft: an incomplete own trip, or a small thing over its limit. */
export function draftProblems(draft: CarbonDraft): { own: boolean; extra: Record<ExtraKey, boolean>; any: boolean } {
  const own = !!draft.own && !ownTripValid(draft.own);
  const extra = { bottles: asNumber(draft.bottles) > CARBON_EXTRA_LIMIT.bottles, laptopHours: asNumber(draft.laptopHours) > CARBON_EXTRA_LIMIT.laptopHours, phoneCharges: asNumber(draft.phoneCharges) > CARBON_EXTRA_LIMIT.phoneCharges };
  return { own, extra, any: own || EXTRA_KEYS.some(key => extra[key]) };
}

/** Two drafts say the same thing (the "Belum disimpan" mark). */
export const sameDraft = (a: CarbonDraft, b: CarbonDraft) => JSON.stringify([a.own && { ...a.own, from: a.own.from.trim() }, asNumber(a.bottles), asNumber(a.laptopHours), asNumber(a.phoneCharges)])
  === JSON.stringify([b.own && { ...b.own, from: b.own.from.trim() }, asNumber(b.bottles), asNumber(b.laptopHours), asNumber(b.phoneCharges)]);
