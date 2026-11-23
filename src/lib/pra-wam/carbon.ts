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
  /**
   * A car or minibus, per vehicle-km (Pra WAM only, 23 Nov 2026): DEFRA 2025 "Large car, Diesel"
   * (0,21007), the nearest to an Innova or Hiace; DEFRA has no minibus row. Tank-to-wheel.
   */
  mobilPerKm: 0.21007,
  /** A motorbike, per vehicle-km: DEFRA 2025 "Motorbike, Average" (0,11367), tank-to-wheel. */
  motorPerKm: 0.11367,
  /**
   * PLN Jawa-Madura-Bali, kg per kWh: Kepmen ESDM 163.K/HK.02/MEM.S/2021 (2019 data, combined margin),
   * as cited in a KLHK SRN document; the same 0,87 WAM 2026 uses for the hotel's bills.
   */
  listrikPerKwh: 0.87,
  /** A laptop in use, kWh per hour: 32 W (LBNL for US DOE, 2014); likely a little high for newer laptops. */
  laptopKwhPerJam: 0.032,
  /** One full smartphone charge, kWh (US EPA Greenhouse Gas Equivalencies, 2026). */
  hpKwhPerIsi: 0.019,
  /** One 500–600 ml single-use PET bottle, kg CO₂e: an estimate from the stage figures NIH sums up (0,07–0,11). */
  botolPerBuah: 0.1,
} as const;

/**
 * Where each factor comes from (checked 23 Nov 2026), the small links at the bottom of the detail.
 * Kereta: KAI's own intensity for KA Antarkota (16,43 g per penumpang-km). Bus: the Dutch national
 * list, touringcar diesel well-to-wheel (0,888 per vehicle-km). Makan: a medium meat-eater's day
 * (5,63 kg) over three meals. Kamar: DEFRA's hotel stay per room-night (from Cornell CHSB),
 * its Indonesia row: 62,7. Mobil and motor: the same DEFRA 2025 file.
 */
export const CARBON_REFERENCES = [
  { factor: "kereta", short: "KAI 2026", title: "KAI: intensitas emisi KA Antarkota (ANTARA, 2026)", url: "https://bali.antaranews.com/rilis-pers/5604524/kai-susun-strategi-net-zero-emission-perkuat-peran-kereta-api-dalam-transisi-energi-indonesia" },
  { factor: "bus", short: "CO2emissiefactoren 2024", title: "CO2emissiefactoren.nl: touringcar diesel (2024)", url: "https://co2emissiefactoren.nl/factoren/2024/43/176/personenvervoer-touringcar-diesel/" },
  { factor: "makan", short: "Scarborough dkk. 2014", title: "Scarborough dkk., Climatic Change 125 (2014)", url: "https://doi.org/10.1007/s10584-014-1169-1" },
  { factor: "listrik", short: "ESDM 2021", title: "Kepmen ESDM 163.K/HK.02/MEM.S/2021, faktor emisi sistem Jamali (data 2019), dikutip di SRN KLHK", url: "https://asset.srnmenlh.id/srn-menlhk/files/3ff4297a-0300-4efd-9572-9eca8eb4ba30.pdf" },
  { factor: "laptop", short: "LBNL 2014", title: "Desroches dkk., Computer usage and national energy consumption, LBNL untuk US DOE (2014)", url: "https://www.osti.gov/servlets/purl/1166988" },
  { factor: "hp", short: "US EPA", title: "US EPA, Greenhouse Gas Equivalencies Calculator: Calculations and References", url: "https://www.epa.gov/energy/greenhouse-gases-equivalencies-calculator-calculations-and-references" },
  { factor: "botol", short: "NIH", title: "NIH Environmental Management System, Life Cycle Environmental Impact of PET Water Bottles", url: "https://nems.nih.gov/Documents/PETWaterBottlesEnvironmentalImpact.pdf" },
  { factor: "kamar", short: "DEFRA 2025", title: "UK DESNZ/DEFRA GHG Conversion Factors 2025 (hotel stay, large car, motorbike)", url: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025" },
] as const;

/** How a leg is travelled: a train per passenger, the others per vehicle (split by who rides it). */
export type LegMode = "kereta" | "bus" | "mobil" | "motor";
export const LEG_LABEL: Record<LegMode, string> = { kereta: "Kereta", bus: "Bus", mobil: "Mobil", motor: "Motor" };

export type CarbonLeg = {
  mode: LegMode;
  /** "Jakarta → Yogyakarta". */
  label: string;
  km: number;
  /** A vehicle is shared: the people in it (its km split between them). A train counts per passenger already. */
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
  /** The participant's own small things (0 when not told): single-use plastic bottles, laptop hours, phone charges. */
  bottles?: number;
  laptopHours?: number;
  phoneCharges?: number;
};

export const CARBON_SOURCES = ["perjalanan", "kamar", "makan", "perangkat"] as const;
export type CarbonSource = (typeof CARBON_SOURCES)[number];

export type Swatch = 1 | 2 | 3 | 4;

export type CarbonSourceView = {
  key: CarbonSource;
  title: string;
  kg: number;
  /** "17 kg". */
  amount: string;
  percent: number;
  /** "Kereta 1.026 km, shuttle 54 km". */
  note: string;
  swatch: Swatch;
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
  const perVehicleKm: Record<Exclude<LegMode, "kereta">, number> = { bus: f.busPerBusKm, mobil: f.mobilPerKm, motor: f.motorPerKm };
  const perjalanan = input.legs.reduce((sum, leg) => sum + (leg.mode === "kereta"
    ? positive(leg.km) * f.keretaPerPenumpangKm
    : (positive(leg.km) * perVehicleKm[leg.mode]) / Math.max(1, positive(leg.sharedBy))), 0);
  const kamar = (positive(input.nights) * f.hotelPerKamarMalam) / Math.max(1, positive(input.roomOccupants));
  const makan = positive(input.meals) * f.makanPerPorsi + positive(input.bottles) * f.botolPerBuah;
  const perangkat = (positive(input.laptopHours) * f.laptopKwhPerJam + positive(input.phoneCharges) * f.hpKwhPerIsi) * f.listrikPerKwh;
  return { perjalanan, kamar, makan, perangkat };
}

function noteOf(key: CarbonSource, input: CarbonInput): string {
  switch (key) {
    case "perjalanan": {
      const modes = [...new Set(input.legs.map(leg => leg.mode))];
      return modes.map(mode => `${LEG_LABEL[mode]} ${id(input.legs.filter(leg => leg.mode === mode).reduce((sum, leg) => sum + positive(leg.km), 0))} km`).join(" · ");
    }
    case "kamar": {
      const nights = `${id(positive(input.nights))} malam`;
      const people = Math.max(1, positive(input.roomOccupants));
      const together = people === 2 ? "berdua" : people === 3 ? "bertiga" : `${id(people)} orang`;
      return people > 1 ? `${nights}, sekamar ${together}` : `${nights}, sendiri`;
    }
    case "makan": return [`${id(positive(input.meals))} porsi`, positive(input.bottles) ? `${id(positive(input.bottles))} botol plastik` : ""].filter(Boolean).join(" · ");
    case "perangkat": return [positive(input.laptopHours) ? `Laptop ${id(positive(input.laptopHours))} jam` : "", positive(input.phoneCharges) ? `HP ${id(positive(input.phoneCharges))}× isi daya` : ""].filter(Boolean).join(" · ");
  }
}

const TITLE: Record<CarbonSource, string> = { perjalanan: "Perjalanan", kamar: "Kamar", makan: "Makan & minum", perangkat: "Perangkat" };

/** The card's and the detail's view: biggest first, an empty source left out. */
export function carbonView(input: CarbonInput | null): CarbonView {
  if (!input) return { kind: "belum" };
  const parts = carbonParts(input);
  const kg = parts.perjalanan + parts.kamar + parts.makan + parts.perangkat;
  if (kg <= 0) return { kind: "belum" };
  const present = CARBON_SOURCES.filter(key => parts[key] > 0).sort((a, b) => parts[b] - parts[a] || CARBON_SOURCES.indexOf(a) - CARBON_SOURCES.indexOf(b));
  const percents = splitPercent(present.map(key => parts[key]));
  const sources = present.map((key, index): CarbonSourceView => {
    const figure = carbonFigure(parts[key]);
    return { key, title: TITLE[key], kg: parts[key], amount: `${figure.value} ${figure.unit.replace(" CO₂e", "")}`, percent: percents[index], note: noteOf(key, input), swatch: (index + 1) as Swatch };
  });
  return { kind: "ada", kg, total: carbonFigure(kg), sources, barLabel: sources.map(source => `${source.title} ${source.percent}%`).join(", ") };
}

/** "Cara menghitung": each factor with its unit, in Indonesian number style. */
export function carbonFactorRows(): { key: "kereta" | "bus" | "mobil" | "motor" | "kamar" | "makan" | "botol" | "laptop" | "hp" | "listrik"; name: string; unit: string; value: string }[] {
  const f = CARBON_FACTORS;
  return [
    { key: "mobil", name: "Mobil / minibus", unit: "kg per km, dibagi penumpang", value: id(f.mobilPerKm, 2) },
    { key: "kereta", name: "Kereta", unit: "kg per penumpang-km", value: id(f.keretaPerPenumpangKm, 4) },
    { key: "bus", name: "Bus", unit: "kg per km, dibagi penumpang", value: id(f.busPerBusKm, 2) },
    { key: "motor", name: "Motor", unit: "kg per km", value: id(f.motorPerKm, 2) },
    { key: "kamar", name: "Kamar", unit: "kg per kamar-malam, dibagi penghuni", value: id(f.hotelPerKamarMalam, 1) },
    { key: "makan", name: "Makan", unit: "kg per porsi", value: id(f.makanPerPorsi, 1) },
    { key: "botol", name: "Botol plastik", unit: "kg per botol", value: id(f.botolPerBuah, 1) },
    { key: "laptop", name: "Laptop", unit: "kWh per jam", value: id(f.laptopKwhPerJam, 3) },
    { key: "hp", name: "Isi daya HP", unit: "kWh per kali", value: id(f.hpKwhPerIsi, 3) },
    { key: "listrik", name: "Listrik PLN Jawa-Bali", unit: "kg per kWh", value: id(f.listrikPerKwh, 2) },
  ];
}

/*
 * Who fills what (23 Nov 2026, revised): the trip is the same for nearly everyone, so the panitia
 * set it once and nobody has to answer.
 *   Panitia (Admin Pra WAM → Jejak karbon): the group trip in plain fields (dari, ke, kendaraan, km
 *     one way, people per vehicle, pulang-pergi), nights, meals, and whether the form is open.
 *     Pra WAM: kantor Yogyakarta → Kaliurang by car or minibus; WAM 2026: kantor → Batu by train.
 *   Peserta: nothing, unless they do not travel with the group: then a short form (dari mana, naik
 *     apa, km one way, pulang-pergi) from the card's detail. Only for themself; the panitia only see it.
 *   Otomatis: the room and who shares it, from Misi Perjalanan's room list.
 */
export type CarbonEventSettings = { nights: number; mealsPerPerson: number };

export type GroupMode = "mobil" | "bus" | "kereta";
export const GROUP_MODES: { key: GroupMode; label: string }[] = [{ key: "mobil", label: "Mobil / minibus" }, { key: "bus", label: "Bus" }, { key: "kereta", label: "Kereta" }];

/** The trip everyone takes unless they say otherwise. */
export type GroupTrip = { from: string; to: string; mode: GroupMode; /** One way. */ km: number; /** People per vehicle (not used for a train). */ perVehicle: number; roundTrip: boolean };

export type OwnMode = "mobil" | "motor" | "kereta" | "lainnya";
export const OWN_MODES: { key: OwnMode; label: string }[] = [{ key: "mobil", label: "Mobil" }, { key: "motor", label: "Motor" }, { key: "kereta", label: "Kereta" }, { key: "lainnya", label: "Lainnya" }];

/** A participant's own trip, only when they do not go with the group. */
export type OwnTrip = { from: string; mode: OwnMode; /** One way. */ km: number; roundTrip: boolean };

/** A participant's answer; no answer (null) means they go with the group. */
/**
 * A participant's answer in their calculator: their own trip when they do not go with the group
 * (null: the group's), and the small things only they know. No answer at all: the group trip and 0s.
 */
export type CarbonTravel = { own: OwnTrip | null; bottles: number; laptopHours: number; phoneCharges: number; answeredAt: string };

export type CarbonSetup = { settings: CarbonEventSettings; trip: GroupTrip; /** Participants may tell their own trip. */ formOpen: boolean };

/** "Kantor Yogyakarta → Kaliurang". */
export const tripLabel = (trip: Pick<GroupTrip, "from" | "to">) => `${trip.from.trim() || "?"} → ${trip.to.trim() || "?"}`;
export const groupModeLabel = (mode: GroupMode) => GROUP_MODES.find(item => item.key === mode)!.label;
export const ownModeLabel = (mode: OwnMode) => OWN_MODES.find(item => item.key === mode)!.label;

/** The panitia's trip can be counted: both places named, a distance, and people per vehicle unless it is a train. */
export const tripValid = (trip: GroupTrip) => !!trip.from.trim() && !!trip.to.trim() && positive(trip.km) > 0 && (trip.mode === "kereta" || positive(trip.perVehicle) > 0);

/** A participant's own trip is complete with a place, and a distance unless "Lainnya" (not counted). */
export const ownTripValid = (own: OwnTrip) => !!own.from.trim() && (own.mode === "lainnya" || (positive(own.km) > 0 && own.km <= 3000));

/** One person's input: their own trip or the group's, their room, and the event's nights and meals. */
export function personCarbonInput(setup: Pick<CarbonSetup, "settings" | "trip">, travel: CarbonTravel | null | undefined, roomOccupants: number): CarbonInput | null {
  const { settings, trip } = setup;
  const legs: CarbonLeg[] = [];
  if (travel?.own) {
    const own = travel.own;
    if (!ownTripValid(own)) return null;
    if (own.mode !== "lainnya") for (let i = 0; i < (own.roundTrip ? 2 : 1); i++) legs.push({ mode: own.mode, label: own.from, km: positive(own.km), sharedBy: 1 });
  } else {
    if (!tripValid(trip)) return null;
    for (let i = 0; i < (trip.roundTrip ? 2 : 1); i++) legs.push({ mode: trip.mode, label: tripLabel(trip), km: positive(trip.km), sharedBy: trip.mode === "kereta" ? undefined : Math.max(1, positive(trip.perVehicle)) });
  }
  return { legs, nights: positive(settings.nights), roomOccupants: Math.max(1, positive(roomOccupants)), meals: positive(settings.mealsPerPerson),
    bottles: positive(travel?.bottles), laptopHours: positive(travel?.laptopHours), phoneCharges: positive(travel?.phoneCharges) };
}

/** Kilograms for one tile: one decimal below 10 kg ("0,4 kg"), whole above ("42 kg"). */
export function tileKg(kg: number): string {
  if (kg <= 0) return "0 kg";
  return kg < 10 ? `${id(Math.max(0.1, Math.round(kg * 10) / 10), 1)} kg` : `${id(Math.round(kg))} kg`;
}

/** The calculator's tiles, each with its kilograms, for one person. */
export function calculatorTiles(input: CarbonInput) {
  const f = CARBON_FACTORS;
  const parts = carbonParts({ ...input, bottles: 0, laptopHours: 0, phoneCharges: 0 });
  return {
    perjalanan: parts.perjalanan,
    kamar: parts.kamar,
    makan: parts.makan,
    botol: positive(input.bottles) * f.botolPerBuah,
    laptop: positive(input.laptopHours) * f.laptopKwhPerJam * f.listrikPerKwh,
    hp: positive(input.phoneCharges) * f.hpKwhPerIsi * f.listrikPerKwh,
  };
}

/** One row of the admin page: the person, their room (automatic, from Misi Perjalanan) and their own trip if any. */
export type CarbonPerson = { id: string; name: string; dept: string; room: string; occupants: number; travel: CarbonTravel | null };
