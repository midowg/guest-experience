/*
 * Zona waktu penonton (19 Nov 2026). Every time in WAM is stored as an exact instant, and the rules
 * (office hours 07.00–22.00 WIB, workdays, one day per booking) stay in WIB, where the office is.
 * Only what people read and pick follows their own zone: someone in Bali picks 14.00 WITA and
 * someone in Jogja reads 13.00 WIB. Indonesia has no daylight saving, so each zone is a fixed offset.
 * Pure, so it is tested without a browser.
 */

export const VIEWER_ZONES = ["WIB", "WITA", "WIT"] as const;
export type ViewerZone = (typeof VIEWER_ZONES)[number];
/** Hours ahead of UTC. */
export const zoneOffset: Record<ViewerZone, number> = { WIB: 7, WITA: 8, WIT: 9 };
export const zoneNames: Record<ViewerZone, string> = {
  WIB: "WIB (Jawa, Sumatra, Kalimantan Barat dan Tengah)",
  WITA: "WITA (Bali, Nusa Tenggara, Sulawesi, Kalimantan Timur dan Selatan)",
  WIT: "WIT (Maluku, Papua)",
};

/** The cookie the app reads on the server: the zone in use. */
export const ZONE_COOKIE = "wk_zone";
/** Set when the person chose the zone in Pengaturan; without it the device decides. */
export const ZONE_MANUAL_COOKIE = "wk_zone_manual";

export const asViewerZone = (value: string | null | undefined): ViewerZone =>
  (VIEWER_ZONES as readonly string[]).includes(value ?? "") ? value as ViewerZone : "WIB";

/**
 * The zone of a device's time zone ("Asia/Makassar" → WITA). Known Indonesian names first; any
 * other by its offset now (UTC+8 → WITA); anything else is WIB, the office's.
 */
export function zoneOfTimeZone(timeZone: string | undefined, now = new Date()): ViewerZone {
  if (!timeZone) return "WIB";
  if (/^Asia\/(Jakarta|Pontianak)$/.test(timeZone)) return "WIB";
  if (/^Asia\/(Makassar|Ujung_Pandang)$/.test(timeZone)) return "WITA";
  if (/^Asia\/Jayapura$/.test(timeZone)) return "WIT";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now);
    const offset = parts.find(part => part.type === "timeZoneName")?.value ?? "";
    const hours = Number(/GMT([+-]\d+)/.exec(offset)?.[1] ?? NaN);
    if (hours === 8) return "WITA";
    if (hours === 9) return "WIT";
  } catch { /* an unknown name: WIB */ }
  return "WIB";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The clock time of an instant in a zone: "14:00". */
export function zoneTime(iso: string, zone: ViewerZone): string {
  const at = new Date(new Date(iso).getTime() + zoneOffset[zone] * 3_600_000);
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}
/** The calendar date of an instant in a zone: "2026-11-19". */
export function zoneDate(iso: string, zone: ViewerZone): string {
  return new Date(new Date(iso).getTime() + zoneOffset[zone] * 3_600_000).toISOString().slice(0, 10);
}

/**
 * A WIB clock time ("13:00", as the forms and rules keep it) read in another zone: "14:00", and
 * whether that is already the next day (23:30 WIB is 00:30 WITA).
 */
export function fromWibClock(time: string, zone: ViewerZone): { time: string; nextDay: boolean } {
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + (zoneOffset[zone] - 7) * 60;
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return { time: `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`, nextDay: minutes >= 1440 };
}

/** "14.00", or "00.30 (+1)" past midnight: a WIB clock time as this person reads it. */
export function wibClockLabel(time: string, zone: ViewerZone): string {
  const local = fromWibClock(time, zone);
  return `${local.time.replace(":", ".")}${local.nextDay ? " (+1)" : ""}`;
}

/** "14.00": an instant's clock time as this person reads it. */
export const instantLabel = (iso: string, zone: ViewerZone) => zoneTime(iso, zone).replace(":", ".");

/** "13.00–14.00", with the zone after it when it is not WIB ("14.00–15.00 WITA"), or always with `named`. */
export function zoneSpan(startsAt: string, endsAt: string, zone: ViewerZone, named = false): string {
  return `${instantLabel(startsAt, zone)}–${instantLabel(endsAt, zone)}${named || zone !== "WIB" ? ` ${zone}` : ""}`;
}

/** " WITA" after a time for someone outside WIB, nothing for WIB (most people, and the office). */
export const zoneSuffix = (zone: ViewerZone) => zone === "WIB" ? "" : ` ${zone}`;
