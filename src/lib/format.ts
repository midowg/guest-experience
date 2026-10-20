import { timezoneInfo, tzLabel, zoneOf } from "./timezones";

export function formatDate(value: string, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(value));
}
export function formatTime(value: string, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(value));
}
/** "Senin, 12 Oktober 2026, 18.00 WITA" in the given zone. */
export function formatDateTime(value: string, timeZone = "Asia/Jakarta") {
  return `${formatDate(value, timeZone)}, ${formatTime(value, timeZone)} ${tzLabel(timeZone)}`;
}
/** Value for a datetime-local input, as wall-clock time in the event's zone. */
export function toZoneInput(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: zoneOf(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return parts.replace(" ", "T");
}
/** A datetime-local value read as the event's wall-clock time; independent of the browser's zone. */
export function fromZoneInput(value: string, timeZone: string) {
  return value ? new Date(`${value}:00${timezoneInfo[zoneOf(timeZone)].offset}`).toISOString() : null;
}
