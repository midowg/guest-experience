import type { CoffeeSettings, OrderKind, QuotaGroup, Status } from "./types";

/*
 * The monthly quota (25 Nov 2026): per calendar month in WIB; karyawan 4, GA 2, intern 2 unless
 * the pengelola changed them. Only claims that are being processed or done count; refused and
 * cancelled ones give their place back. The database decides (coffee_submit_claim); this is the
 * same arithmetic for what the screens show. Pure, so it is tested without a server.
 */

/** Data karyawan's category → the quota group. "dw" (Daily Worker, was "ga") is the GA group. */
export function quotaGroupOf(category: string | null | undefined): QuotaGroup {
  return category === "intern" ? "intern" : category === "dw" || category === "ga" ? "ga" : "karyawan";
}
export const quotaFor = (group: QuotaGroup, settings: CoffeeSettings): number => settings[group];

const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString();
/** The WIB day of a moment, "2026-12-31". */
export const wibDay = (iso: string): string => wib(iso).slice(0, 10);
/** The WIB month of a moment, "2026-12". */
export const wibMonth = (iso: string): string => wib(iso).slice(0, 7);
/** The WIB clock of a moment, "09:14". */
export const wibClock = (iso: string): string => wib(iso).slice(11, 16);
/** The moment a WIB day starts. */
export const dayStart = (day: string): string => new Date(`${day}T00:00:00+07:00`).toISOString();
/** The day after, "2026-12-31" → "2027-01-01". */
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
export function previousMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}
/** A WIB month as moments: from its first instant up to (not including) the next month's. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  return { from: dayStart(`${month}-01`), to: dayStart(`${next}-01`) };
}

export const countsForQuota = (status: Status): boolean => status === "diproses" || status === "selesai";

type Counted = { id: string; kind: OrderKind; status: Status; employeeId: string | null; orderedAt: string };

/** How many of these orders take a place in the quota of that month (one person's orders are passed in). */
export function usedInMonth(orders: Pick<Counted, "kind" | "status" | "orderedAt">[], month: string): number {
  return orders.filter(order => order.kind === "klaim" && countsForQuota(order.status) && wibMonth(order.orderedAt) === month).length;
}

/**
 * "Klaim ke-n": each counting claim's place among its person's counting claims of the same WIB
 * month, oldest first. Worked out when read, never stored, so a refusal, a cancellation or an
 * Urungkan never leaves a wrong number behind. Refused and cancelled claims have none.
 */
export function claimNumbers(orders: Counted[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const seen = new Map<string, number>();
  const counting = orders.filter(order => order.kind === "klaim" && countsForQuota(order.status))
    .sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt) || a.id.localeCompare(b.id));
  for (const order of counting) {
    const key = `${order.employeeId}:${wibMonth(order.orderedAt)}`;
    const place = (seen.get(key) ?? 0) + 1;
    seen.set(key, place);
    numbers.set(order.id, place);
  }
  return numbers;
}
