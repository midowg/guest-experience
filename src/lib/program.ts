import { localDay } from "./event-phase";
import type { AgendaDetail, AgendaItem } from "./types";

export type AgendaDay = { day: string; items: AgendaItem[] };

/**
 * The rundown split into calendar days in the event's zone, days in date order and items in the
 * admin's order. A one-day event gives one group, and the page shows no tabs then.
 */
export function agendaByDay(agenda: AgendaItem[], timeZone: string): AgendaDay[] {
  const sorted = [...agenda].sort((a, b) => a.sort_order - b.sort_order);
  const days = new Map<string, AgendaItem[]>();
  for (const item of sorted) {
    const day = item.starts_at ? localDay(item.starts_at, timeZone) : "";
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return [...days.entries()].sort(([a], [b]) => (a || "9999").localeCompare(b || "9999")).map(([day, items]) => ({ day, items }));
}

/** Whole hours and remaining minutes between two times; null when unknown or not positive. */
export function duration(start: string, end: string): { hours: number; minutes: number } | null {
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function hasDepth(detail: AgendaDetail | undefined): boolean {
  return !!detail && !!(detail.did_you_know.trim() || detail.more_story.trim() || detail.photo?.url);
}

/** "Halaman N" of the guest-facing presentation; browsers open PDFs at #page=N. */
export function presentationPage(url: string, page: number | null): string | null {
  return url && page ? `${url.split("#")[0]}#page=${page}` : null;
}
