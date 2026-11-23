/*
 * Jejak karbon for one person in Pra WAM (23 Nov 2026): their own trip to the venue, their share of
 * the room (the room's nights split by who sleeps in it) and their meals. The factors are the ones
 * WAM 2026 counts the whole event with (src/lib/main-wam/panitia/carbon.ts, CARBON_FACTORS on main):
 * the same numbers, so both apps agree; a test on main keeps them equal. Every factor names where it
 * comes from (CARBON_REFERENCES), shown as small links at the bottom of the detail. Pure.
 *
 * Emisi = data kegiatan × faktor emisi. Only recorded, never offset (no trees, no payment).
 */

/** kg CO₂e per unit. */
export const CARBON_FACTORS = {
  keretaPerPenumpangKm: 0.0164,
  busPerBusKm: 0.89,
  makanPerPorsi: 1.9,
  /** DEFRA 2025's hotel stay for Indonesia (from Cornell CHSB), 23 Nov 2026; was 40. */
  hotelPerKamarMalam: 62.7,
} as const;

/**
 * Where each factor comes from (checked 23 Nov 2026), the small links at the bottom of the detail.
 * Kereta: KAI's own intensity for KA Antarkota (16,43 g per penumpang-km). Bus: the Dutch national
 * list, touringcar diesel well-to-wheel (0,888 per vehicle-km). Makan: a medium meat-eater's day
 * (5,63 kg) over three meals. Kamar: DEFRA's hotel stay per room-night (from Cornell CHSB),
 * its Indonesia row: 62,7.
 */
export const CARBON_REFERENCES = [
  { factor: "kereta", short: "KAI 2026", title: "KAI: intensitas emisi KA Antarkota (ANTARA, 2026)", url: "https://bali.antaranews.com/rilis-pers/5604524/kai-susun-strategi-net-zero-emission-perkuat-peran-kereta-api-dalam-transisi-energi-indonesia" },
  { factor: "bus", short: "CO2emissiefactoren 2024", title: "CO2emissiefactoren.nl: touringcar diesel (2024)", url: "https://co2emissiefactoren.nl/factoren/2024/43/176/personenvervoer-touringcar-diesel/" },
  { factor: "makan", short: "Scarborough dkk. 2014", title: "Scarborough dkk., Climatic Change 125 (2014)", url: "https://doi.org/10.1007/s10584-014-1169-1" },
  { factor: "kamar", short: "DEFRA 2025", title: "UK DESNZ/DEFRA GHG Conversion Factors 2025 (hotel stay)", url: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025" },
] as const;

export type CarbonLeg = {
  mode: "kereta" | "bus";
  /** "Jakarta → Yogyakarta". */
  label: string;
  km: number;
  /** A bus is shared: the people on it (its bus-km split between them). A train counts per passenger already. */
  sharedBy?: number;
};

export type CarbonInput = {
  legs: CarbonLeg[];
  /** Nights in the room. */
  nights: number;
  /** People in the room, the person included (1 or more). */
  roomOccupants: number;
  /** Meals at the event (porsi). */
  meals: number;
};

export const CARBON_SOURCES = ["perjalanan", "kamar", "makan"] as const;
export type CarbonSource = (typeof CARBON_SOURCES)[number];

export type CarbonSourceView = {
  key: CarbonSource;
  title: string;
  kg: number;
  /** "17 kg". */
  amount: string;
  percent: number;
  /** "Kereta 1.026 km, shuttle 54 km". */
  note: string;
  swatch: 1 | 2 | 3;
};

export type CarbonView =
  | { kind: "ada"; kg: number; total: { value: string; unit: string }; sources: CarbonSourceView[]; barLabel: string }
  | { kind: "belum" };

const positive = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const id = (value: number, digits = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

/** Whole percentages that add up to exactly 100 (largest remainder); all 0 when there is nothing. */
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

/** Whole kilograms ("56 kg CO₂e", "<1"), from a tonne up one decimal ("1,2 t CO₂e"). */
export function carbonFigure(kg: number): { value: string; unit: string } {
  const whole = Math.round(kg);
  if (whole >= 1000) return { value: id(Math.round(kg / 100) / 10, 1), unit: "t CO₂e" };
  return { value: whole < 1 ? "<1" : id(whole), unit: "kg CO₂e" };
}

/** The three parts in kg. */
export function carbonParts(input: CarbonInput): Record<CarbonSource, number> {
  const f = CARBON_FACTORS;
  const perjalanan = input.legs.reduce((sum, leg) => sum + (leg.mode === "kereta"
    ? positive(leg.km) * f.keretaPerPenumpangKm
    : (positive(leg.km) * f.busPerBusKm) / Math.max(1, positive(leg.sharedBy))), 0);
  const kamar = (positive(input.nights) * f.hotelPerKamarMalam) / Math.max(1, positive(input.roomOccupants));
  const makan = positive(input.meals) * f.makanPerPorsi;
  return { perjalanan, kamar, makan };
}

function noteOf(key: CarbonSource, input: CarbonInput): string {
  switch (key) {
    case "perjalanan": {
      const km = (mode: CarbonLeg["mode"]) => input.legs.filter(leg => leg.mode === mode).reduce((sum, leg) => sum + positive(leg.km), 0);
      return [km("kereta") > 0 ? `Kereta ${id(km("kereta"))} km` : "", km("bus") > 0 ? `bus ${id(km("bus"))} km` : ""].filter(Boolean).join(" · ");
    }
    case "kamar": {
      const nights = `${id(positive(input.nights))} malam`;
      const people = Math.max(1, positive(input.roomOccupants));
      const together = people === 2 ? "berdua" : people === 3 ? "bertiga" : `${id(people)} orang`;
      return people > 1 ? `${nights}, sekamar ${together}` : `${nights}, sendiri`;
    }
    case "makan": return `${id(positive(input.meals))} porsi selama acara`;
  }
}

const TITLE: Record<CarbonSource, string> = { perjalanan: "Perjalanan", kamar: "Kamar", makan: "Makan" };

/** The card's and the detail's view: biggest first, an empty source left out. */
export function carbonView(input: CarbonInput | null): CarbonView {
  if (!input) return { kind: "belum" };
  const parts = carbonParts(input);
  const kg = parts.perjalanan + parts.kamar + parts.makan;
  if (kg <= 0) return { kind: "belum" };
  const present = CARBON_SOURCES.filter(key => parts[key] > 0).sort((a, b) => parts[b] - parts[a] || CARBON_SOURCES.indexOf(a) - CARBON_SOURCES.indexOf(b));
  const percents = splitPercent(present.map(key => parts[key]));
  const sources = present.map((key, index): CarbonSourceView => {
    const figure = carbonFigure(parts[key]);
    return { key, title: TITLE[key], kg: parts[key], amount: `${figure.value} ${figure.unit.replace(" CO₂e", "")}`, percent: percents[index], note: noteOf(key, input), swatch: (index + 1) as 1 | 2 | 3 };
  });
  return { kind: "ada", kg, total: carbonFigure(kg), sources, barLabel: sources.map(source => `${source.title} ${source.percent}%`).join(", ") };
}

/** "Cara menghitung": each factor with its unit, in Indonesian number style. */
export function carbonFactorRows(): { key: "kereta" | "bus" | "kamar" | "makan"; name: string; unit: string; value: string }[] {
  const f = CARBON_FACTORS;
  return [
    { key: "kereta", name: "Kereta", unit: "kg per penumpang-km", value: id(f.keretaPerPenumpangKm, 4) },
    { key: "bus", name: "Bus / shuttle", unit: "kg per bus-km, dibagi penumpang", value: id(f.busPerBusKm, 2) },
    { key: "kamar", name: "Kamar", unit: "kg per kamar-malam, dibagi penghuni", value: id(f.hotelPerKamarMalam, 1) },
    { key: "makan", name: "Makan", unit: "kg per porsi", value: id(f.makanPerPorsi, 1) },
  ];
}

/*
 * What the panitia fill in Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026). Once for the
 * event: nights, meals per person, and the shuttle between the station and the venue. Per person:
 * where they leave from, how (kereta or bus, or "lainnya", not counted yet), the one-way km, and
 * whether they ride the shuttle. Rooms and roommates are not filled here: they come from Misi
 * Perjalanan's room list.
 */
export type CarbonEventSettings = {
  nights: number;
  mealsPerPerson: number;
  /** Station → venue, one way. */
  shuttleKm: number;
  /** People per shuttle bus. */
  shuttlePerBus: number;
  /** People per bus for a group bus from a city. */
  groupBusPerBus: number;
};

export type TravelMode = "kereta" | "bus" | "lainnya";
export type CarbonTravel = {
  from: string;
  mode: TravelMode | null;
  /** One way. */
  km: number;
  roundTrip: boolean;
  shuttle: boolean;
};

export const TRAVEL_MODES: { key: TravelMode; label: string }[] = [
  { key: "kereta", label: "Kereta" }, { key: "bus", label: "Bus" }, { key: "lainnya", label: "Lainnya" },
];

/** A person's row is complete once it says how they come (and how far, unless "lainnya"). */
export const travelComplete = (travel: CarbonTravel | null | undefined): boolean =>
  !!travel && !!travel.mode && (travel.mode === "lainnya" || positive(travel.km) > 0);

/** One person's input from the event's settings, their travel and their room; null while their travel is not complete. */
export function personCarbonInput(settings: CarbonEventSettings, travel: CarbonTravel | null | undefined, roomOccupants: number): CarbonInput | null {
  if (!travelComplete(travel)) return null;
  const t = travel!;
  const times = t.roundTrip ? 2 : 1;
  const legs: CarbonLeg[] = [];
  if (t.mode === "kereta" || t.mode === "bus") {
    for (let i = 0; i < times; i++) legs.push({ mode: t.mode, label: t.from, km: positive(t.km), sharedBy: t.mode === "bus" ? Math.max(1, positive(settings.groupBusPerBus)) : undefined });
  }
  if (t.shuttle && positive(settings.shuttleKm) > 0) {
    for (let i = 0; i < times; i++) legs.push({ mode: "bus", label: "Shuttle", km: positive(settings.shuttleKm), sharedBy: Math.max(1, positive(settings.shuttlePerBus)) });
  }
  return { legs, nights: positive(settings.nights), roomOccupants: Math.max(1, positive(roomOccupants)), meals: positive(settings.mealsPerPerson) };
}

export type PastedRow = { line: number; name: string; from: string; mode: TravelMode | null; km: number };

const MODE_WORDS: [RegExp, TravelMode][] = [[/^(ka|kereta|train)/i, "kereta"], [/^(bus|bis)/i, "bus"], [/./, "lainnya"]];

/**
 * Rows pasted from Excel (tab- or semicolon-separated): Nama, Kota asal, Moda, Km sekali jalan.
 * A header row is skipped; a row is matched to a person by name (letters only, case ignored).
 */
export function parsePastedTravel(text: string, names: readonly string[]): { rows: (PastedRow & { match: string })[]; unknown: PastedRow[]; bad: number[] } {
  const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");
  const byKey = new Map(names.map(name => [key(name), name]));
  const rows: (PastedRow & { match: string })[] = [];
  const unknown: PastedRow[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const cells = raw.split(/\t|;/).map(cell => cell.trim());
    if (!cells[0] || /^nama$/i.test(cells[0])) return;
    const kmText = (cells[3] ?? "").replace(/\./g, "").replace(",", ".");
    const km = Number(kmText);
    const modeText = cells[2] ?? "";
    const mode = modeText ? MODE_WORDS.find(([pattern]) => pattern.test(modeText))![1] : null;
    if (cells.length < 2 || (kmText !== "" && !Number.isFinite(km))) { bad.push(index + 1); return; }
    const row: PastedRow = { line: index + 1, name: cells[0], from: cells[1] ?? "", mode, km: Number.isFinite(km) ? km : 0 };
    const match = byKey.get(key(cells[0]));
    if (match) rows.push({ ...row, match }); else unknown.push(row);
  });
  return { rows, unknown, bad };
}

/** One row of the admin page: the person, their room (from Misi Perjalanan's list) and their travel. */
export type CarbonPerson = { id: string; name: string; dept: string; room: string; occupants: number; travel: CarbonTravel | null };
