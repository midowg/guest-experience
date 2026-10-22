import { describe, expect, it } from "vitest";
import { fieldText, fitText, normalizePoster, photoPlacement, posterDate, posterDuration, posterTime, type PosterField } from "./poster";
import { posterPresets, presetPoster } from "./poster-presets";
import { createSeedEvent } from "./seed-event";
import { normalizeEvent } from "./hero-framing";
import { posterSchema } from "./validation";
import { buildEventFromSetup } from "./event-setup";

/** Every character half as wide as the font size: easy to reason about in tests. */
const measure = (text: string, size: number) => [...text].length * size * 0.5;
const style = { sizeMax: 40, sizeMin: 20, lineHeight: 1, maxLines: 2, letterSpacing: 0, uppercase: false };

describe("fitText", () => {
  it("keeps the largest size when the text fits", () => {
    expect(fitText(measure, "Rempah", style, { w: 400, h: 100 })).toEqual({ size: 40, lines: ["Rempah"], lineHeight: 1, truncated: false });
  });

  it("shrinks a long title until it fits the box and the line limit", () => {
    const fitted = fitText(measure, "Meramu Rempah Nusantara Bersama Komunitas", style, { w: 400, h: 100 });
    expect(fitted.truncated).toBe(false);
    expect(fitted.size).toBeLessThan(40);
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    for (const line of fitted.lines) expect(measure(line, fitted.size)).toBeLessThanOrEqual(400);
  });

  it("ends in … at the smallest size when the text still does not fit", () => {
    const fitted = fitText(measure, "satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas", style, { w: 200, h: 40 });
    expect(fitted).toMatchObject({ size: 20, truncated: true });
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[1].endsWith("…")).toBe(true);
    expect(measure(fitted.lines[1], 20)).toBeLessThanOrEqual(200);
  });

  it("follows typed line breaks, upper-cases and counts letter-spacing", () => {
    expect(fitText(measure, "Sabtu,\n7 November", { ...style, maxLines: 3 }, { w: 400, h: 200 }).lines).toEqual(["Sabtu,", "7 November"]);
    expect(fitText(measure, "herbal", { ...style, uppercase: true }, { w: 400, h: 50 }).lines).toEqual(["HERBAL"]);
    // 6 characters at 40 px: 120 wide, plus 0.5 em after each = 240, so it shrinks to fit 200.
    expect(fitText(measure, "rempah", { ...style, letterSpacing: 0.5 }, { w: 200, h: 50 }).size).toBeLessThan(40);
  });

  it("breaks a word wider than the box instead of spilling out", () => {
    const fitted = fitText(measure, "atourin.com/en/jcwf2026", { ...style, sizeMin: 40, maxLines: 4 }, { w: 200, h: 400 });
    for (const line of fitted.lines) expect(measure(line, 40)).toBeLessThanOrEqual(200);
    expect(fitted.lines.join("")).toBe("atourin.com/en/jcwf2026");
  });

  it("returns no lines for empty text", () => {
    expect(fitText(measure, "  ", style, { w: 100, h: 100 }).lines).toEqual([]);
  });
});

describe("poster data", () => {
  it("shows the admin's text for a locked box and the person's for an editable one", () => {
    const locked = { editable: false, value: "Reservasi", key: "r" } as PosterField;
    const open = { editable: true, value: "Judul", key: "t" } as PosterField;
    const values = { text: { r: "diubah", t: "Judul baru" }, photos: {} };
    expect(fieldText(locked, values)).toBe("Reservasi");
    expect(fieldText(open, values)).toBe("Judul baru");
    expect(fieldText(open, { text: {}, photos: {} })).toBe("Judul");
  });

  it("covers a box with a framed photo, as the hero framing does", () => {
    expect(photoPlacement({ w: 100, h: 100 }, { width: 200, height: 100 }, { x: 50, y: 50, zoom: 1 })).toEqual({ width: 200, height: 100, left: -50, top: 0 });
    expect(photoPlacement({ w: 100, h: 100 }, { width: 200, height: 100 }, { x: 0, y: 50, zoom: 2 })).toMatchObject({ width: 400, height: 200, left: -0, top: -50 });
  });

  it("writes date, time and duration the Indonesian way in the event's zone", () => {
    expect(posterDate("2026-11-07T04:30:00.000Z", "Asia/Jakarta")).toBe("Sabtu, 7 November 2026");
    expect(posterTime("2026-11-07T04:30:00.000Z", "Asia/Jakarta", "WIB")).toBe("11.30 WIB");
    expect(posterDuration("2026-11-07T04:30:00.000Z", "2026-11-07T05:30:00.000Z")).toBe("Durasi 60 menit");
    expect(posterDuration("2026-11-07T04:30:00.000Z", null)).toBe("");
  });

  it("gives events saved before Studio Poster an empty, switched-off poster", () => {
    const old = { ...createSeedEvent(), poster: undefined } as unknown as Parameters<typeof normalizeEvent>[0];
    expect(normalizeEvent(old).poster).toEqual(normalizePoster(undefined));
    expect(normalizeEvent(old).poster.enabled).toBe(false);
  });
});

describe("poster presets", () => {
  for (const preset of posterPresets) {
    it(`${preset.key} passes validation and keeps every box inside its format`, () => {
      const poster = presetPoster(preset.key, createSeedEvent());
      expect(posterSchema.safeParse(poster).success).toBe(true);
      const sizes = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } };
      for (const field of poster.fields) for (const format of ["post", "story"] as const) {
        const box = field.box[format];
        if (!box) continue;
        expect(box.x + box.w, `${field.key} ${format}`).toBeLessThanOrEqual(sizes[format].width);
        expect(box.y + box.h, `${field.key} ${format}`).toBeLessThanOrEqual(sizes[format].height);
      }
    });
  }

  it("fills date, time and venue from the event", () => {
    const event = { ...createSeedEvent(), venue_name: "Loman Park Hotel" };
    const fields = Object.fromEntries(presetPoster("rempah-nusantara", event).fields.map(field => [field.key, field]));
    expect(fields.venue.value).toBe("Loman Park Hotel");
    expect(fields.date.value).toMatch(/^\w+, \d+ \w+ \d{4}$/);
    expect(fields.reservation.editable).toBe(false);
  });

  it("refuses boxes outside the design and colours that are not hex", () => {
    const poster = presetPoster("rempah-nusantara", createSeedEvent());
    const [first, ...rest] = poster.fields;
    expect(posterSchema.safeParse({ ...poster, fields: [{ ...first, box: { post: { x: 0, y: 0, w: 5000, h: 10 }, story: null } }, ...rest] }).success).toBe(false);
    expect(posterSchema.safeParse({ ...poster, fields: [{ ...first, color: "green" }, ...rest] }).success).toBe(false);
    expect(posterSchema.safeParse({ ...poster, fields: [first, first] }).success).toBe(false);
  });

  it("switches the poster on for an event made from the poster template", () => {
    const event = buildEventFromSetup({
      template: "poster-sesi", title: "Meramu Rempah Nusantara", starts_at: "2026-11-07T04:30:00.000Z", ends_at: "2026-11-07T05:30:00.000Z", timezone: "Asia/Jakarta",
      audience: "external", language: "id", invitation_mode: "open", modules: ["about"], location: "other", venue_name: "Loman Park Hotel", address: "", location_url: "",
      greeting: "", introduction: "", closing: "", rsvp_closes_at: null, guest_estimate: null, contact_name: "", contact_phone: "",
    } as Parameters<typeof buildEventFromSetup>[0], { id: "10f3a511-2331-4000-8000-0000000000aa", uuid: () => "10f3a511-2331-4000-8000-0000000000ab", now: "2026-10-22T00:00:00.000Z" });
    expect(event.poster).toMatchObject({ enabled: true, preset: "rempah-nusantara" });
    expect(event.theme.key).toBe("rempah");
    expect(event.poster.fields.find(field => field.key === "venue")?.value).toBe("Loman Park Hotel");
  });
});
