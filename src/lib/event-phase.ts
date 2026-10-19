import type { EventPhase, EventRecord } from "./types";

/** A calendar day in the event's own time zone, as `YYYY-MM-DD`, so plain string order is date order. */
export function localDay(value: string | number, timeZone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export const phaseLabels: Record<EventPhase, string> = { before: "Sebelum acara", day: "Hari H", after: "Sesudah acara" };

/**
 * Which part of the journey the guest sees first. Whole days, not hours: on the day itself
 * the guest needs the schedule and their ticket from the morning on, and the thank-you page
 * waits until the next day, so a late session never flips to "after" while guests are still there.
 * A multi-day programme stays on "day" from its first to its last date.
 */
export function eventPhase(event: Pick<EventRecord, "starts_at" | "ends_at" | "timezone" | "phase_override">, now: number): EventPhase {
  if (event.phase_override && event.phase_override !== "auto") return event.phase_override;
  if (!event.starts_at) return "before";
  const today = localDay(now, event.timezone);
  const first = localDay(event.starts_at, event.timezone);
  const last = localDay(event.ends_at ?? event.starts_at, event.timezone);
  if (today < first) return "before";
  if (today > last) return "after";
  return "day";
}

export function isPhase(value: unknown): value is EventPhase {
  return value === "before" || value === "day" || value === "after";
}

/** The phase at request time, for pages rendered per request (force-dynamic). */
export function currentPhase(event: Parameters<typeof eventPhase>[0]): EventPhase {
  return eventPhase(event, Date.now());
}
