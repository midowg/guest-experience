import { describe, expect, it } from "vitest";
import { createSeedEvent } from "@/lib/seed-event";
import { eventSchema } from "@/lib/validation";
import type { EventRecord, GalleryImage } from "@/lib/types";
import { completeSections, heroTextPositionOptions, hiddenSectionReasons, moveItem, photoGuidance, prepareEvent, sectionKeys, srcsetAttribute } from "./editor-model";

const id = (n: number) => `b1d26d64-2ab8-4d7a-80b5-328a132ea2c${n}`;
const image = (n: number, over: Partial<GalleryImage> = {}): GalleryImage => ({ id: id(n), url: `https://example.test/foto-${n}.webp`, alt: `Foto ${n}`, caption: "", sort_order: 99, srcset: [], ...over });

describe("prepareEvent", () => {
  it("keeps only the URL when an iframe is pasted", () => {
    const url = "https://www.google.com/maps/embed?pb=!1m18";
    const prepared = prepareEvent({ ...createSeedEvent(), location_embed_url: `<iframe src="${url}" width="800" height="600"></iframe>` });
    expect(prepared.location_embed_url).toBe(url);
    expect(eventSchema.safeParse(prepared).success).toBe(true);
  });
  it("renumbers gallery sort_order from the displayed order", () => {
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1), image(2), image(3)] };
    expect(prepareEvent(event).gallery.map(item => item.sort_order)).toEqual([0, 1, 2]);
  });
  it("keeps gallery sort_order aligned after a move", () => {
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1), image(2), image(3)] };
    const moved = { ...event, gallery: moveItem(event.gallery, 0, 1) };
    expect(prepareEvent(moved).gallery.map(item => [item.id, item.sort_order])).toEqual([[id(2), 0], [id(1), 1], [id(3), 2]]);
  });
  it("skips a completely empty second gallery row and renumbers the remaining photos", () => {
    const empty = image(2, { url: "", alt: "", caption: "", srcset: [] });
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1), empty, image(3)] };
    const prepared = prepareEvent(event);
    expect(prepared.gallery.map(item => [item.id, item.sort_order])).toEqual([[id(1), 0], [id(3), 1]]);
    expect(event.gallery).toHaveLength(3);
    expect(eventSchema.safeParse(prepared).success).toBe(true);
  });
  it("keeps an incomplete gallery row with a caption so validation reports its missing photo", () => {
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1), image(2, { url: "", alt: "", caption: "Tampak depan" })] };
    const prepared = prepareEvent(event);
    expect(prepared.gallery).toHaveLength(2);
    const parsed = eventSchema.safeParse(prepared);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some(issue => issue.path.join(".") === "gallery.1.url")).toBe(true);
  });
  it("rejects a non-HTTPS gallery photo", () => {
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1, { url: "http://example.test/foto.webp" })] };
    expect(eventSchema.safeParse(prepareEvent(event)).success).toBe(false);
  });
  it("still renumbers agenda and feedback questions", () => {
    const prepared = prepareEvent(createSeedEvent());
    expect(prepared.agenda.map(item => item.sort_order)).toEqual(prepared.agenda.map((_, index) => index));
    expect(prepared.feedback_questions.map(item => item.sort_order)).toEqual(prepared.feedback_questions.map((_, index) => index));
  });
  it("passes gallery srcset through untouched", () => {
    const srcset = [{ width: 480, url: "https://example.test/a-480.webp" }, { width: 1024, url: "https://example.test/a-1024.webp" }];
    const event: EventRecord = { ...createSeedEvent(), gallery: [image(1, { srcset })] };
    expect(prepareEvent(event).gallery[0].srcset).toEqual(srcset);
  });
  it("drops hero sizes left behind when the hero photo is cleared", () => {
    const event: EventRecord = { ...createSeedEvent(), hero: { url: "", alt: "", srcset: [{ width: 480, url: "https://example.test/hero-480.webp" }], focus: "center", text_position: "center" } };
    expect(prepareEvent(event).hero.srcset).toEqual([]);
    // Without the reset the saved schema rejects sizes without a photo.
    expect(eventSchema.safeParse(prepareEvent(event)).success).toBe(true);
    expect(eventSchema.safeParse(event).success).toBe(false);
  });
  it("keeps hero sizes while a hero photo is set", () => {
    const srcset = [{ width: 1024, url: "https://example.test/hero-1024.webp" }];
    const event: EventRecord = { ...createSeedEvent(), hero: { url: "https://example.test/hero.webp", alt: "Panggung utama", srcset, focus: "center", text_position: "center" } };
    const prepared = prepareEvent(event);
    expect(prepared.hero).toMatchObject(event.hero);
    expect(prepared.hero.framing?.mobile.zoom).toBe(1);
    expect(eventSchema.safeParse(prepared).success).toBe(true);
  });
});

describe("srcsetAttribute", () => {
  it("omits the attribute for outside links without generated sizes", () => expect(srcsetAttribute([])).toBeUndefined());
  it("builds a width-descriptor list", () =>
    expect(srcsetAttribute([{ width: 480, url: "https://example.test/a-480.webp" }, { width: 2048, url: "https://example.test/a-2048.webp" }]))
      .toBe("https://example.test/a-480.webp 480w, https://example.test/a-2048.webp 2048w"));
});

describe("hero controls", () => {
  // The crop-focus control was removed: it asked the admin to solve a problem the layout
  // should handle. Only the text position remains, and only two choices of it.
  it("offers exactly the two text positions the schema accepts", () => {
    expect(heroTextPositionOptions.map(option => option.value)).toEqual(["left", "center"]);
    for (const option of heroTextPositionOptions) expect(option.label).toBeTruthy();
  });
  it("normalises a stored crop focus to centre, so old events save cleanly", () => {
    const event: EventRecord = { ...createSeedEvent(), hero: { url: "https://example.test/hero.webp", alt: "", srcset: [], focus: "top", text_position: "left" } };
    expect(prepareEvent(event).hero.focus).toBe("center");
  });
  it("names the agreed sizes and limits in the guidance", () => {
    const text = photoGuidance.join(" ");
    for (const part of ["2400", "1500", "1600", "1000", "16:10", "300 KB", "1,5 MB", "tepi"]) expect(text).toContain(part);
  });
});

describe("sections", () => {
  it("fills in missing section keys as hidden", () => {
    const completed = completeSections({ ...createSeedEvent(), sections: [] });
    expect(completed.sections.map(section => section.key)).toEqual(sectionKeys);
    expect(completed.sections.every(section => !section.enabled)).toBe(true);
  });
  it("reports a missing hero photo so the editorial fallback is not a surprise", () => {
    expect(hiddenSectionReasons(createSeedEvent()).some(reason => reason.includes("foto latar"))).toBe(true);
    const withHero: EventRecord = { ...createSeedEvent(), hero: { url: "https://example.test/hero.webp", alt: "Panggung", srcset: [], focus: "center", text_position: "left" } };
    expect(hiddenSectionReasons(withHero).some(reason => reason.includes("foto latar"))).toBe(false);
  });
});

describe("moveItem", () => {
  it("leaves the list alone at the edges", () => {
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
  it("swaps neighbours without mutating the input", () => {
    const items = [1, 2, 3];
    expect(moveItem(items, 1, 1)).toEqual([1, 3, 2]);
    expect(items).toEqual([1, 2, 3]);
  });
});
