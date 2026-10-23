import { describe, expect, it } from "vitest";
import { boxes, emptyPoster, fitText, type PosterBox, type PosterField, type PosterSettings, type PosterValues } from "@/lib/poster";
import { createMeasure, layoutTexts } from "./layout";

/** A 20 px text box (one line tall) whose heading sits 30 px above it. */
function item(key: string, label: PosterBox | null, extra: Partial<PosterField> = {}): PosterField {
  const box = label ? { x: 50, y: label.y + 30, w: 500, h: 20 } : { x: 50, y: 600, w: 500, h: 20 };
  return {
    key, label: key.toUpperCase(), hint: "", kind: "text", editable: true, value: "", maxLength: 200, font: "nunito", weight: 400, tone: "", color: "#000000",
    align: "left", uppercase: false, letterSpacing: 0, sizeMax: 20, sizeMin: 20, lineHeight: 1, maxLines: 3, radius: 0, fill: "#ffffff",
    ...(label ? { stack: "info", labelBox: { post: label } } : {}), ...extra, box: boxes({ post: box }),
  };
}
// Three items 20 px apart in the design: a 130-150, b 200-220, c 270-290 (headings 30 px above each).
const a = item("a", { x: 50, y: 100, w: 500, h: 30 }), b = item("b", { x: 50, y: 170, w: 500, h: 30 }), c = item("c", { x: 50, y: 240, w: 500, h: 30 });
const plain = item("plain", null);
// Listed out of design order: the stack follows the design, not the list.
const poster: PosterSettings = { ...emptyPoster(), fields: [c, plain, a, b] };
const text = (entries: Record<string, string>): PosterValues => ({ text: entries, photos: {} });
const laid = (values: PosterValues, hints = false) => Object.fromEntries(layoutTexts(poster, values, "post", hints).map(entry => [entry.field.key, entry]));

describe("stacked boxes", () => {
  it("stay where the design put them when each is as long as its design", () => {
    const all = laid(text({ a: "Satu", b: "Dua", c: "Tiga", plain: "Tetap" }));
    expect([all.a.box.y, all.b.box.y, all.c.box.y]).toEqual([130, 200, 270]);
    expect([all.a.labelShift, all.b.labelShift, all.c.labelShift]).toEqual([{ box: a.labelBox!.post, dy: 0 }, { box: b.labelBox!.post, dy: 0 }, { box: c.labelBox!.post, dy: 0 }]);
  });

  it("leaves an empty item out with its heading, and moves the next one up by its height and gap", () => {
    const some = laid(text({ a: "Satu", c: "Tiga" }));
    expect(some.b).toBeUndefined();
    // b ran from its heading at 170 to its box's end at 220, then 20 px of gap: 70 px.
    expect(some.c.box.y).toBe(200);
    expect(some.c.labelShift).toEqual({ box: c.labelBox!.post, dy: -70 });
  });

  it("pushes the items below down by the lines a longer text adds, keeping each one on the card", () => {
    // 11 px a character at 20 px: about 45 to a 500 px line, so this takes two.
    const long = laid(text({ a: "Bahan rempah pilihan dari kebun warga di lereng gunung dan pesisir", b: "Dua", c: "Tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga tiga" }));
    expect(long.a.fitted.lines).toHaveLength(2);
    expect(long.a.box).toEqual({ x: 50, y: 130, w: 500, h: 60 });
    expect([long.b.box.y, long.b.labelShift?.dy]).toEqual([220, 20]);
    // c now starts at 290, where the stack ended in the design: it still gets a line, not dropped.
    expect(long.c.box.y).toBe(290);
    expect(long.c.fitted.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps every editable item while hints show, each with its hint", () => {
    const hinted = Object.fromEntries(layoutTexts({ ...poster, fields: poster.fields.map(field => ({ ...field, hint: `Isi ${field.key}` })) }, text({}), "post", true).map(entry => [entry.field.key, entry]));
    expect(Object.keys(hinted).sort()).toEqual(["a", "b", "c", "plain"]);
    expect([hinted.a.hint, hinted.b.box.y, hinted.c.box.y, hinted.c.labelShift?.dy]).toEqual([true, 200, 270, 0]);
  });

  it("keeps an empty optional item and its heading on screen as a hint, and leaves it out of the download", () => {
    const optional = { ...poster, fields: poster.fields.map(field => field.key === "b" ? { ...field, optional: true, hint: "Isi b" } : { ...field, hint: `Isi ${field.key}` }) };
    const onScreen = Object.fromEntries(layoutTexts(optional, text({}), "post", true).map(entry => [entry.field.key, entry]));
    expect(onScreen.b).toMatchObject({ hint: true });
    expect(onScreen.b.labelShift).toBeDefined();
    const download = Object.fromEntries(layoutTexts(optional, text({ a: "Satu", c: "Tiga" }), "post", false).map(entry => [entry.field.key, entry]));
    expect(download.b).toBeUndefined();
    expect(download.c.labelShift!.dy).toBeLessThan(0);
  });

  it("leaves boxes outside a stack as they were", () => {
    const values = text({ a: "Satu", plain: "Teks yang cukup panjang untuk dua baris di kotak yang sempit ini ya" });
    const own = laid(values).plain;
    expect(own.box).toBe(plain.box.post);
    expect(own.labelShift).toBeUndefined();
    expect(own.fitted).toEqual(fitText(createMeasure(plain), values.text.plain, plain, plain.box.post!));
  });
});
