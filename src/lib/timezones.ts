// Indonesia's three zones. None observes daylight saving, so a fixed offset is exact.
export const eventTimezones = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export type EventTimezone = (typeof eventTimezones)[number];

export const timezoneInfo: Record<EventTimezone, { label: string; name: string; nameEn: string; offset: string; example: string }> = {
  "Asia/Jakarta": { label: "WIB", name: "Waktu Indonesia Barat", nameEn: "Western Indonesia Time", offset: "+07:00", example: "Jakarta, Sumatra, Jawa, Kalimantan Barat & Tengah" },
  "Asia/Makassar": { label: "WITA", name: "Waktu Indonesia Tengah", nameEn: "Central Indonesia Time", offset: "+08:00", example: "Bali, NTB, NTT, Sulawesi, Kalimantan Selatan, Timur & Utara" },
  "Asia/Jayapura": { label: "WIT", name: "Waktu Indonesia Timur", nameEn: "Eastern Indonesia Time", offset: "+09:00", example: "Maluku, Papua" },
};

export function isEventTimezone(value: string): value is EventTimezone {
  return (eventTimezones as readonly string[]).includes(value);
}

/** Unknown zones fall back to WIB rather than throwing on old or hand-edited data. */
export function zoneOf(value: string | null | undefined): EventTimezone {
  return value && isEventTimezone(value) ? value : "Asia/Jakarta";
}

export function tzLabel(value: string | null | undefined): string {
  return timezoneInfo[zoneOf(value)].label;
}
