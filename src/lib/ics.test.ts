import { describe, expect, it } from "vitest";
import { buildCalendar, calendarFileName } from "./ics";
import { createSeedEvent } from "./seed-event";
import type { EventRecord } from "./types";

const ids = ["7d000000-0000-4000-8000-000000000001", "7d000000-0000-4000-8000-000000000002"];
function trip(patch: Partial<EventRecord> = {}): EventRecord {
  return {
    ...createSeedEvent(), slug: "trip-lombok", title: "Trip Lombok", timezone: "Asia/Makassar", venue_name: "Pantai Kuta", address: "Lombok Tengah, NTB",
    starts_at: "2026-11-02T08:00:00+08:00", ends_at: "2026-11-03T17:00:00+08:00", updated_at: "2026-10-20T01:00:00Z",
    agenda: [
      { id: ids[1], starts_at: "2026-11-03T09:00:00+08:00", ends_at: "2026-11-03T12:00:00+08:00", title: "Desa Sade", description: "", sort_order: 1 },
      { id: ids[0], starts_at: "2026-11-02T08:00:00+08:00", ends_at: "2026-11-02T09:30:00+08:00", title: "Penjemputan, bandara; lalu sarapan", description: "Baris satu\nBaris dua", sort_order: 0 },
    ],
    ...patch,
  };
}
const options = { scope: "all" as const, remind: 30, pageUrl: "https://invitation.example/e/trip-lombok", host: "invitation.example" };
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("calendar file", () => {
  it("has one entry per session in time order, in UTC, with a reminder", () => {
    const ics = unfold(buildCalendar(trip(), options));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf(`UID:${ids[0]}@invitation.example`)).toBeLessThan(ics.indexOf(`UID:${ids[1]}@invitation.example`));
    expect(ics).toContain("DTSTART:20261102T000000Z");
    expect(ics).toContain("DTEND:20261102T013000Z");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("LOCATION:Pantai Kuta\\, Lombok Tengah\\, NTB");
  });

  it("escapes text and keeps every line within 75 octets", () => {
    const raw = buildCalendar(trip({ title: "Kunjungan dengan judul yang sangat panjang sekali untuk menguji pelipatan baris kalender" }), options);
    for (const line of raw.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const ics = unfold(raw);
    expect(ics).toContain("SUMMARY:Penjemputan\\, bandara\\; lalu sarapan · Kunjungan");
    expect(ics).toContain("DESCRIPTION:Baris satu\\nBaris dua\\n\\nhttps://invitation.example/e/trip-lombok");
  });

  it("links to the general page only", () => {
    const ics = unfold(buildCalendar(trip(), options));
    expect(ics).toContain("URL:https://invitation.example/e/trip-lombok");
    expect(ics).not.toMatch(/\/i\//);
  });

  it("can hold today's sessions only", () => {
    const ics = unfold(buildCalendar(trip(), { ...options, scope: "today", now: Date.parse("2026-11-03T07:00:00+08:00") }));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:Desa Sade");
  });

  it("falls back to the event itself without a rundown", () => {
    const ics = unfold(buildCalendar(trip({ agenda: [], ends_at: null }), { ...options, remind: 60 }));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:Trip Lombok");
    expect(ics).toContain("DTEND:20261102T020000Z");
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  it("names the file after the event", () => {
    expect(calendarFileName("trip-lombok", "all")).toBe("trip-lombok.ics");
    expect(calendarFileName("trip-lombok", "today")).toBe("trip-lombok-hari-ini.ics");
  });
});
