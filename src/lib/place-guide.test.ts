import { describe, expect, it } from "vitest";
import { samplePlaceGuide } from "@/app/dev-preview/panduan/sample";
import { placeCity } from "./place-guide";
import { eventSchema } from "./validation";
import { localizeEvent } from "./wording/localize";

describe("Panduan lokasi", () => {
  const event = samplePlaceGuide();

  it("starts filled with Werkudara's guide, ready to publish", () => {
    expect(event.event_kind).toBe("panduan");
    expect(event.venue_name).toBe("Werkudara Office");
    expect(event.hero.url).toMatch(/^https:\/\/invitation\.werkudara\.group\/panduan-ke-werkudara\/assets\/exterior-1280\.webp$/);
    expect(event.route.map_image.url).toContain("map-1601.webp");
    expect(event.route.steps.map(step => step.title)).toEqual(["Lewat Jl. Pondok Raya", "Belok di Jl. Bhinneka", "Parkir di depan kantor"]);
    expect(event.route.steps[1].image.url).toContain("turn-1400.webp");
    expect(event.gallery).toHaveLength(5);
    expect(event.contact.role).toBe("Hospitality Specialist");
    expect(event.rsvp_enabled).toBe(false);
    const parsed = eventSchema.safeParse({ ...event, status: "published" });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("reads in English with the steps and arrival points translated", () => {
    const { event: english, fallback } = localizeEvent(event, "en");
    expect(english.route.steps[0].title).toBe("Take Jl. Pondok Raya");
    expect(english.route.points[1].title).toBe("Meeting point");
    expect(english.introduction).toContain("We are delighted");
    expect(fallback).toBe(false);
  });

  it("names the city from the address's last line", () => {
    expect(placeCity("Jl. Bhinneka No. 9\nCondongcatur, Sleman, Yogyakarta")).toBe("Yogyakarta");
    expect(placeCity("Jl. Kaliurang")).toBe("");
  });
});
