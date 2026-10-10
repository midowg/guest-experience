export function formatDate(value: string, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(value));
}
export function formatTime(value: string, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(value));
}
export function toJakartaInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return parts.replace(" ", "T");
}
export function fromJakartaInput(value: string) {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null;
}
