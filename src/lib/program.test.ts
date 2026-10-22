import { describe, expect, it } from "vitest";
import { agendaByDay, duration, hasDepth, presentationPage } from "./program";
import type { AgendaItem } from "./types";

const item = (n: number, starts: string, ends: string, sort = n): AgendaItem => ({ id: `a${n}`, starts_at: starts, ends_at: ends, title: `Sesi ${n}`, description: "", sort_order: sort });

describe("agendaByDay", () => {
  it("groups a trip by its own calendar days, keeping the admin's order inside a day", () => {
    const agenda = [
      item(1, "2026-11-02T08:00:00+08:00", "2026-11-02T09:00:00+08:00", 1),
      item(2, "2026-11-03T07:30:00+08:00", "2026-11-03T09:00:00+08:00", 2),
      item(3, "2026-11-02T06:30:00+08:00", "2026-11-02T07:30:00+08:00", 0),
    ];
    const days = agendaByDay(agenda, "Asia/Makassar");
    expect(days.map(day => day.day)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(days[0].items.map(entry => entry.id)).toEqual(["a3", "a1"]);
  });
  it("uses the event's zone: 00.30 WITA is the next day even though it is 23.30 WIB", () => {
    const days = agendaByDay([item(1, "2026-11-02T00:30:00+08:00", "2026-11-02T01:00:00+08:00")], "Asia/Makassar");
    expect(days[0].day).toBe("2026-11-02");
    expect(agendaByDay([item(1, "2026-11-02T00:30:00+08:00", "2026-11-02T01:00:00+08:00")], "Asia/Jakarta")[0].day).toBe("2026-11-01");
  });
  it("gives one group for a single day", () => {
    expect(agendaByDay([item(1, "2026-11-02T08:00:00+07:00", "2026-11-02T09:00:00+07:00"), item(2, "2026-11-02T10:00:00+07:00", "2026-11-02T11:00:00+07:00")], "Asia/Jakarta")).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("measures duration", () => {
    expect(duration("2026-11-02T08:00:00Z", "2026-11-02T09:30:00Z")).toEqual({ hours: 1, minutes: 30 });
    expect(duration("2026-11-02T08:00:00Z", "2026-11-02T08:00:00Z")).toBeNull();
    expect(duration("", "")).toBeNull();
  });
  it("knows when an item has more to tell", () => {
    expect(hasDepth(undefined)).toBe(false);
    expect(hasDepth({ teaser: "x", did_you_know: "", more_story: "", place: "", pdf_page: null })).toBe(false);
    expect(hasDepth({ teaser: "", did_you_know: "Fakta", more_story: "", place: "", pdf_page: null })).toBe(true);
  });
  it("links to a presentation page", () => {
    expect(presentationPage("https://example.test/deck.pdf", 4)).toBe("https://example.test/deck.pdf#page=4");
    expect(presentationPage("https://example.test/deck.pdf#page=2", 7)).toBe("https://example.test/deck.pdf#page=7");
    expect(presentationPage("", 4)).toBeNull();
    expect(presentationPage("https://example.test/deck.pdf", null)).toBeNull();
  });
});
