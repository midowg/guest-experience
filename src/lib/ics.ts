import { localDay } from "./event-phase";
import type { EventRecord } from "./types";

export const reminderChoices = [15, 30, 60] as const;
export type CalendarScope = "all" | "today";

/** RFC 5545 text: backslash, semicolon, comma and newlines escaped. */
function text(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string) {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (out.length ? 74 : 75)) { out.push(current); current = ""; }
    current += char;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** UTC stamps: phones show them in the guest's own zone, and no VTIMEZONE block is needed. */
function stamp(value: string | number) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

type Options = { scope: CalendarScope; remind: number; pageUrl: string; host: string; now?: number };

/**
 * A calendar file for the guest: one entry per session, or the event itself when there is no
 * rundown. The note links to the general invitation page, never to a personal link. Stable UIDs
 * mean saving the file again updates the entries instead of adding copies.
 */
export function buildCalendar(event: EventRecord, { scope, remind, pageUrl, host, now = Date.now() }: Options): string {
  const sessions = [...event.agenda].filter(item => item.starts_at && item.ends_at).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const today = localDay(now, event.timezone);
  const chosen = scope === "today" ? sessions.filter(item => localDay(item.starts_at, event.timezone) === today) : sessions;
  const place = [event.venue_name, event.address].filter(Boolean).join(", ");
  const entries = chosen.length
    ? chosen.map(item => ({ uid: item.id, start: item.starts_at, end: item.ends_at, title: `${item.title} · ${event.title}`, note: item.description }))
    : event.starts_at && scope === "all" ? [{ uid: event.id, start: event.starts_at, end: event.ends_at || new Date(Date.parse(event.starts_at) + 2 * 3600000).toISOString(), title: event.title, note: event.subtitle }] : [];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Werkudara//Journey//ID", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(event.title)}`, `X-WR-TIMEZONE:${event.timezone}`,
  ];
  for (const entry of entries) {
    lines.push(
      "BEGIN:VEVENT", `UID:${entry.uid}@${host}`, `DTSTAMP:${stamp(event.updated_at || now)}`,
      `DTSTART:${stamp(entry.start)}`, `DTEND:${stamp(entry.end)}`, `SUMMARY:${text(entry.title)}`,
      `DESCRIPTION:${text([entry.note, pageUrl].filter(Boolean).join("\n\n"))}`, `URL:${pageUrl}`,
      ...(place ? [`LOCATION:${text(place)}`] : []),
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(entry.title)}`, `TRIGGER:-PT${remind}M`, "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function calendarFileName(slug: string, scope: CalendarScope) {
  return `${slug}${scope === "today" ? "-hari-ini" : ""}.ics`;
}
