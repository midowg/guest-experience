import { CARBON_FACTORS, type CarbonResult } from "../panitia/carbon";
import { clock, number, shortDateOfInstant, t, type Lang, type MessageKey } from "../i18n";
import { wibTime } from "../rundown";

/*
 * Jejak karbon for the person (E01, revisi 18 Nov): the total and per person, where it comes from
 * (Hotel, Perjalanan, Makan, each with its share and what was counted), and how it is counted.
 * Nobody fills a form: the numbers come from carbonForEvent (src/lib/server/main-wam/panitia/carbon.ts)
 * and are only said here, so the page, the Beranda card and the previews agree. Pure.
 */

export const CARBON_SOURCES = ["hotel", "perjalanan", "makan"] as const;
export type CarbonSource = (typeof CARBON_SOURCES)[number];

/** Whole percentages of the parts that add up to exactly 100 (largest remainder); all 0 when there is nothing. */
export function splitPercent(parts: readonly number[]): number[] {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part), 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map(part => (Math.max(0, part) / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, part) => sum + part, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) { if (left <= 0) break; floors[index] += 1; left -= 1; }
  return floors;
}

/** From 0,1 t (100 kg) tonnes with one decimal ("13,6"), below it whole kilograms ("45"); "<1" under a kilogram. */
export function carbonFigure(kg: number, lang: Lang = "id"): { value: string; unit: string } {
  const whole = Math.round(kg);
  if (whole >= 100) return { value: number(lang, Math.round(kg / 100) / 10, 1), unit: "t CO₂e" };
  return { value: whole < 1 ? "<1" : number(lang, whole), unit: "kg CO₂e" };
}

/** "13,6 t", "45 kg": the amount of one source, without the gas. */
export function carbonShort(kg: number, lang: Lang = "id"): string {
  const { value, unit } = carbonFigure(kg, lang);
  return `${value} ${unit.replace(" CO₂e", "")}`;
}

/** Whole kilograms per person, null when nobody is counted. */
export const perPersonKg = (kg: number, people: number): number | null => (people > 0 && kg > 0 ? Math.max(1, Math.round(kg / people)) : null);

export type CarbonSourceView = {
  key: CarbonSource;
  /** "Hotel". */
  title: string;
  /** Hotel before the bills are in is an estimate: "≈7,2 t". */
  amount: string;
  percent: number;
  /** "60 kamar × 3 malam", "Kereta, shuttle", "1.440 porsi". */
  note: string;
  /** Which of the three bar colours (token --mw-chart-emisi-N). */
  swatch: 1 | 2 | 3;
};

export type CarbonView =
  | {
    kind: "ada";
    /** "13,6" and "t CO₂e". */
    total: { value: string; unit: string };
    /** "±114 kg per orang", null when nobody is counted. */
    perPerson: string | null;
    /** Biggest first; a source with nothing in it is left out. */
    sources: CarbonSourceView[];
    /** "Sen, 4 Jan · 21.00". */
    updated: string;
    /** "Hotel 53%, Perjalanan 27%, Makan 20%": the bar, said in words. */
    barLabel: string;
  }
  /** Nothing to count yet (or it could not be read): the page says so kindly. */
  | { kind: "belum" };

function noteOf(key: CarbonSource, result: CarbonResult, lang: Lang): string {
  const { basis } = result;
  switch (key) {
    case "hotel":
      if (result.hotelFrom === "tagihan") return t(lang, "peserta.carbon.note.hotelBills");
      return basis.rooms > 0 && basis.nights > 0
        ? t(lang, "peserta.carbon.note.hotel", { rooms: number(lang, basis.rooms), nights: number(lang, basis.nights) })
        : t(lang, "peserta.carbon.note.roomNights", { n: number(lang, basis.roomNights) });
    case "perjalanan": {
      const kinds = [basis.trainLegs > 0 ? t(lang, "peserta.carbon.note.train") : "", basis.busLegs > 0 ? t(lang, "peserta.carbon.note.shuttle") : ""].filter(Boolean);
      const line = kinds.join(", ");
      return line.charAt(0).toUpperCase() + line.slice(1);
    }
    case "makan": return t(lang, "peserta.carbon.note.meals", { n: number(lang, basis.portions) });
  }
}

/** The page's view of an estimate (null or empty: "belum"). `now` is when it was counted. */
export function carbonView(result: CarbonResult | null, now: Date, lang: Lang = "id"): CarbonView {
  if (!result || result.empty) return { kind: "belum" };
  const parts: Record<CarbonSource, number> = { hotel: result.parts.hotel, perjalanan: result.parts.perjalanan, makan: result.parts.makan };
  const present = CARBON_SOURCES.filter(key => parts[key] > 0).sort((a, b) => parts[b] - parts[a] || CARBON_SOURCES.indexOf(a) - CARBON_SOURCES.indexOf(b));
  const percents = splitPercent(present.map(key => parts[key]));
  const sources = present.map((key, index): CarbonSourceView => ({
    key, title: t(lang, `peserta.carbon.source.${key}`),
    amount: `${key === "hotel" && result.hotelFrom === "perkiraan" ? "≈" : ""}${carbonShort(parts[key], lang)}`,
    percent: percents[index], note: noteOf(key, result, lang), swatch: (index + 1) as 1 | 2 | 3,
  }));
  const per = perPersonKg(result.kg, result.basis.people);
  return {
    kind: "ada",
    total: carbonFigure(result.kg, lang),
    perPerson: per === null ? null : t(lang, "peserta.carbon.perPerson", { kg: number(lang, per) }),
    sources,
    updated: `${shortDateOfInstant(lang, now)} · ${clock(lang, wibTime(now.toISOString()))}`,
    barLabel: sources.map(source => `${source.title} ${source.percent}%`).join(", "),
  };
}

export type CatalogKey = "kereta" | "bus" | "makan" | "hotel" | "listrik" | "air" | "lpg" | "sampah";

/**
 * "Katalog emisi": every factor the footprint is counted with (kg CO₂e per unit), from the one table
 * the estimate itself uses (CARBON_FACTORS), in the language's number style. All of them are working
 * figures, still "perlu dicek".
 */
export function carbonCatalog(lang: Lang = "id"): { key: CatalogKey; name: string; unit: string; value: string }[] {
  const f = CARBON_FACTORS;
  const rows: [CatalogKey, number, number][] = [
    ["kereta", f.keretaPerPenumpangKm, 4], ["bus", f.busPerBusKm, 2], ["makan", f.makanPerPorsi, 1], ["hotel", f.hotelPerKamarMalam, 1],
    ["listrik", f.listrikPerKwh, 2], ["air", f.airPerM3, 1], ["lpg", f.lpgPerKg, 2], ["sampah", f.sampahPerKg, 1],
  ];
  return rows.map(([key, value, digits]) => ({ key, name: t(lang, `peserta.carbon.cat.name.${key}` as MessageKey), unit: t(lang, `peserta.carbon.cat.unit.${key}` as MessageKey), value: number(lang, value, digits) }));
}
