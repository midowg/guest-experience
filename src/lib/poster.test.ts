import { describe, expect, it } from "vitest";
import { activePalette, emptyPoster, fieldText, partOf, pdfPage, fitText, normalizePoster, paletteOf, photoPlacement, posterDate, posterDuration, posterFormats, posterSizes, posterTime, slotShows, textTop, toneColor, type PosterField } from "./poster";
import { posterPresets, presetBackground, presetPoster } from "./poster-presets";
import { createSeedEvent } from "./seed-event";
import { normalizeEvent } from "./hero-framing";
import { eventSchema, posterSchema } from "./validation";
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

  it("wraps each typed paragraph on its own and drops blank lines", () => {
    // At 40 px a line holds 10 characters: "tiga empat" would fit, but they are separate paragraphs.
    const fixed = { ...style, sizeMin: 40, maxLines: 4 };
    expect(fitText(measure, "satu dua tiga\n\n  \r\nempat", fixed, { w: 200, h: 400 }).lines).toEqual(["satu dua", "tiga", "empat"]);
  });

  it("draws a list as bullets, continuation lines indented after the bullet", () => {
    // The bullet "• " is 40 px at 40 px, leaving 160 (8 characters) for the point's own text.
    const list = { ...style, sizeMin: 40, maxLines: 4, list: true };
    expect(fitText(measure, "satu dua tiga\n- empat", list, { w: 200, h: 400 })).toEqual({ size: 40, lines: ["• satu dua", "tiga", "• empat"], lineHeight: 1, truncated: false, indents: [0, 40, 0] });
    // Shrinks until the point fits one line: 13 characters in 200 minus the bullet is 26 px.
    expect(fitText(measure, "satu dua tiga", { ...list, sizeMin: 20, maxLines: 1 }, { w: 200, h: 200 })).toMatchObject({ size: 26, lines: ["• satu dua tiga"], indents: [0] });
  });

  it("ends a list in … within the indented width when the points do not fit", () => {
    const fitted = fitText(measure, "satu dua tigaempa\nlima", { ...style, sizeMin: 40, maxLines: 2, list: true }, { w: 200, h: 400 });
    expect(fitted).toEqual({ size: 40, lines: ["• satu dua", "tigaemp…"], lineHeight: 1, truncated: true, indents: [0, 40] });
    expect(measure(fitted.lines[1], 40)).toBeLessThanOrEqual(200 - 40);
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

  it("shows a box's slot always when it must be filled, and an optional one only once filled or while hints show", () => {
    const empty = { text: {}, photos: {} };
    const required = { key: "judul", kind: "text", editable: true, value: "" } as PosterField;
    const note = { ...required, key: "biaya", optional: true };
    const logo = { ...required, key: "foto_logo", kind: "photo", optional: true } as PosterField;
    expect(slotShows(required, empty, false)).toBe(true);
    expect(slotShows(note, empty, false)).toBe(false);
    expect(slotShows(note, { text: { biaya: "   " }, photos: {} }, false)).toBe(false);
    expect(slotShows(note, { text: { biaya: "Rp50.000" }, photos: {} }, false)).toBe(true);
    // A locked optional box shows when the admin gave it text.
    expect(slotShows({ ...note, editable: false, value: "Gratis" }, empty, false)).toBe(true);
    expect(slotShows(logo, empty, false)).toBe(false);
    // An uploaded photo replaces its placeholder box, so a transparent PNG does not show the box through.
    const uploaded = { text: {}, photos: { foto_logo: { url: "https://cdn.example/logo.webp", frame: { x: 50, y: 50, zoom: 1 } } } };
    expect(slotShows(logo, uploaded, false)).toBe(false);
    expect(slotShows({ ...logo, optional: false }, uploaded, true)).toBe(false);
    expect(slotShows({ ...logo, optional: false }, empty, false)).toBe(true);
    // On screen, while the box still shows its hint, its slot shows too.
    expect(slotShows(note, empty, true)).toBe(true);
    expect(slotShows(logo, empty, true)).toBe(true);
  });

  it("finds a box's pictures for one size, and none for a poster saved before them", () => {
    const image = (url: string) => ({ url, alt: "", srcset: [] });
    const poster = emptyPoster();
    poster.formats.post.parts = [{ key: "foto_logo", art: image(""), slot: image("https://cdn.example/slot.png") }];
    expect(partOf(poster, "post", "foto_logo")?.slot.url).toBe("https://cdn.example/slot.png");
    expect(partOf(poster, "post", "judul")).toBeUndefined();
    expect(partOf(poster, "story", "foto_logo")).toBeUndefined();
    expect(normalizePoster({ formats: { post: { enabled: true, background: image(""), overlay: image("") } } } as never).formats.post.parts).toEqual([]);
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
    it(`${preset.key} passes validation, lays out every size it offers, and keeps boxes inside`, () => {
      const poster = presetPoster(preset.key, createSeedEvent());
      expect(posterSchema.safeParse(poster).success).toBe(true);
      expect(poster.cardType).toBe(preset.type);
      for (const format of preset.formats) {
        expect(poster.formats[format].enabled, format).toBe(true);
        expect(presetBackground(preset, format, paletteOf(preset.palette)), format).toMatch(/^<svg/);
      }
      for (const field of poster.fields) for (const format of posterFormats) {
        const box = field.box[format];
        if (!box) continue;
        expect(preset.formats, `${field.key} ${format}`).toContain(format);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w, `${field.key} ${format}`).toBeLessThanOrEqual(posterSizes[format].width);
        expect(box.y + box.h, `${field.key} ${format}`).toBeLessThanOrEqual(posterSizes[format].height);
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
      audience: "external", language: "id", invitation_mode: "open", modules: [], location: "other", venue_name: "Loman Park Hotel", address: "", location_url: "",
      greeting: "", introduction: "", closing: "", rsvp_closes_at: null, guest_estimate: null, contact_name: "", contact_phone: "", pic_staff_id: "",
    } as Parameters<typeof buildEventFromSetup>[0], { id: "10f3a511-2331-4000-8000-0000000000aa", uuid: () => "10f3a511-2331-4000-8000-0000000000ab", now: "2026-10-22T00:00:00.000Z" });
    expect(event.poster).toMatchObject({ enabled: true, preset: "rempah-nusantara", cardType: "poster" });
    expect(event.theme.key).toBe("rempah");
    expect(event.event_kind).toBe("kartu");
    expect(event.sections.every(section => !section.enabled)).toBe(true);
    expect(event.poster.fields.find(field => field.key === "venue")?.value).toBe("Loman Park Hotel");
  });
});

describe("palettes and card events", () => {
  it("draws boxes and backgrounds in the chosen palette, and lets the person pick only when allowed", () => {
    const poster = presetPoster("ucapan-hangat", createSeedEvent());
    const greeting = poster.fields.find(field => field.key === "greeting")!;
    expect(toneColor(greeting, paletteOf("malam"))).toBe(paletteOf("malam").colors.primary);
    expect(toneColor({ ...greeting, tone: "", color: "#123456" }, paletteOf("malam"))).toBe("#123456");
    expect(activePalette(poster, { palette: "malam" }).key).toBe(poster.palette);
    expect(activePalette({ ...poster, paletteChoice: true }, { palette: "malam" }).key).toBe("malam");
    expect(presetBackground(posterPresets[1], "square", paletteOf("malam"))).toContain(paletteOf("malam").colors.background);
  });

  it("keeps the sizes of a poster saved before more sizes existed, with the new ones off", () => {
    const saved = { enabled: true, preset: "rempah-nusantara", formats: { post: { enabled: true, background: { url: "", alt: "", srcset: [] } }, story: { enabled: false, background: { url: "", alt: "", srcset: [] } } }, fields: [] };
    const poster = normalizePoster(saved as never);
    expect(poster.formats.post.enabled).toBe(true);
    expect(poster.formats.story.enabled).toBe(false);
    expect(poster.formats.a4.enabled).toBe(false);
    expect(poster.cardType).toBe("poster");
  });

  it("publishes a card without the invitation's organiser, introduction or place", () => {
    const event = { ...createSeedEvent(), event_kind: "kartu" as const, status: "published" as const, organizer: "", introduction: "", venue_name: "", address: "", location_url: "", poster: presetPoster("name-tag", createSeedEvent()) };
    expect(eventSchema.safeParse(event).success).toBe(true);
    expect(eventSchema.safeParse({ ...event, event_kind: "acara" }).success).toBe(false);
  });
});

it("gives print sizes their real paper in the PDF, and digital ones half a point per pixel", () => {
  expect(pdfPage("a4")).toEqual([595.28, 841.89]);
  expect(pdfPage("a4_landscape")).toEqual([841.89, 595.28]);
  expect(pdfPage("idcard")).toEqual([153.07, 242.65]);
  expect(pdfPage("post")).toEqual([540, 675]);
});

describe("vertical alignment", () => {
  // A title box made for three 60 px lines that holds one.
  const box = { h: 180 };
  it("keeps the lines at the top unless told otherwise", () => {
    expect(textTop({}, box, 1, 60)).toBe(0);
    expect(textTop({ valign: "top" }, box, 1, 60)).toBe(0);
  });
  it("moves one line to the middle or down to the bottom of the box", () => {
    expect(textTop({ valign: "middle" }, box, 1, 60)).toBe(60);
    expect(textTop({ valign: "bottom" }, box, 1, 60)).toBe(120);
  });
  it("never starts above the box when the text fills or overflows it", () => {
    expect(textTop({ valign: "bottom" }, box, 3, 60)).toBe(0);
    expect(textTop({ valign: "bottom" }, box, 4, 60)).toBe(0);
  });
});

it("keeps a box's vertical alignment through validation", () => {
  const poster = presetPoster("rempah-nusantara", createSeedEvent());
  const parsed = posterSchema.parse({ ...poster, fields: poster.fields.map(field => field.kind === "text" ? { ...field, valign: "bottom" } : field) });
  expect(parsed.fields.find(field => field.kind === "text")?.valign).toBe("bottom");
});
