import { describe, expect, it } from "vitest";
import { sampleChecklistItems, sampleChecklists, samplePrepSession, parseDemoTicks } from "./sample";
import {
  checklistInputSchema, checklistProgress, checklistTickSchema, isChecklistPhotoKey, photoVersion, type SessionChecklist,
} from "./ceklis";
import { daysBeforeEvent, isPrepDate, isSessionDate, prepDatesOf, prepRange } from "../rundown";

const EVENT = { startDate: "2027-01-04", endDate: "2027-01-07" };
const ids = (n: number) => `00000000-0000-4000-8014-${String(n).padStart(12, "0")}`;
const list = (count = 3): SessionChecklist => ({
  items: Array.from({ length: count }, (_, index) => ({ id: ids(index + 1), sessionId: "p", text: `Item ${index + 1}`, note: "", photo: null, sort: index })),
});

describe("Persiapan days (H-n)", () => {
  it("counts the days before the first day, inside the window only", () => {
    expect(daysBeforeEvent("2027-01-01", EVENT)).toBe(3);
    expect(daysBeforeEvent("2027-01-03", EVENT)).toBe(1);
    expect(daysBeforeEvent("2027-01-04", EVENT)).toBeNull();
    expect(daysBeforeEvent("2027-01-05", EVENT)).toBeNull();
    expect(daysBeforeEvent("2026-11-05", EVENT)).toBe(60);
    expect(daysBeforeEvent("2026-11-04", EVENT)).toBeNull();
    expect(daysBeforeEvent("bukan tanggal", EVENT)).toBeNull();
  });
  it("accepts a day of the event or a Persiapan day, nothing else", () => {
    expect(isSessionDate("2027-01-06", EVENT)).toBe(true);
    expect(isSessionDate("2027-01-02", EVENT)).toBe(true);
    expect(isSessionDate("2027-01-08", EVENT)).toBe(false);
    expect(isSessionDate("2026-10-01", EVENT)).toBe(false);
    expect(isPrepDate("2027-01-04", EVENT)).toBe(false);
  });
  it("gives the range the admin's date field allows", () => {
    expect(prepRange(EVENT)).toEqual({ from: "2026-11-05", to: "2027-01-03" });
  });
  it("lists the Persiapan dates the sessions occupy, earliest first", () => {
    const at = (iso: string) => ({ startsAt: iso });
    expect(prepDatesOf([at("2027-01-02T09:00:00+07:00"), at("2027-01-01T09:00:00+07:00"), at("2027-01-02T20:00:00+07:00"), at("2027-01-05T08:00:00+07:00")], EVENT)).toEqual(["2027-01-01", "2027-01-02"]);
  });
});

describe("checklist progress", () => {
  it("counts ticked items; an empty list is never complete", () => {
    const items = list().items;
    expect(checklistProgress(items, new Set([ids(1)]))).toEqual({ done: 1, total: 3, complete: false });
    expect(checklistProgress(items, new Set([ids(1), ids(2), ids(3), "elsewhere"]))).toEqual({ done: 3, total: 3, complete: true });
    expect(checklistProgress([], new Set())).toEqual({ done: 0, total: 0, complete: false });
  });
});

describe("what the admin and the participant send", () => {
  const item = { text: "Jaket", note: "", photo: null };
  it("accepts a checklist and keeps item order", () => {
    const parsed = checklistInputSchema.parse({ items: [item, { ...item, text: "Tumbler", id: ids(2) }] });
    expect(parsed.items.map(entry => entry.text)).toEqual(["Jaket", "Tumbler"]);
  });
  it("still takes an old payload's `required` (either value, even with no items) and ignores it (KONTRAK 42)", () => {
    const parsed = checklistInputSchema.safeParse({ required: true, items: [] });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ items: [] });
    expect(checklistInputSchema.parse({ items: [item] })).toEqual({ items: [item] });
  });
  it("refuses an empty text, too many items, and a repeated id", () => {
    expect(checklistInputSchema.safeParse({ items: [{ ...item, text: "  " }] }).success).toBe(false);
    expect(checklistInputSchema.safeParse({ items: Array.from({ length: 31 }, () => item) }).success).toBe(false);
    expect(checklistInputSchema.safeParse({ items: [{ ...item, id: ids(1) }, { ...item, id: ids(1) }] }).success).toBe(false);
  });
  it("only takes a photo key of the checklist's own folder", () => {
    const key = "main-wam/ceklis/00000000-0000-4000-8000-000000000001.webp";
    expect(isChecklistPhotoKey(key)).toBe(true);
    expect(isChecklistPhotoKey("main-wam/panduan/00000000-0000-4000-8000-000000000001.webp")).toBe(false);
    expect(isChecklistPhotoKey("main-wam/ceklis/../tema/x.webp")).toBe(false);
    expect(checklistInputSchema.safeParse({ items: [{ ...item, photo: { key, mime: "image/webp", size: 1000 } }] }).success).toBe(true);
    expect(checklistInputSchema.safeParse({ items: [{ ...item, photo: { key: "tema/x.webp", mime: "image/webp", size: 1000 } }] }).success).toBe(false);
  });
  it("reads one tick or 'all', nothing more", () => {
    expect(checklistTickSchema.safeParse({ itemId: ids(1), checked: true }).success).toBe(true);
    expect(checklistTickSchema.safeParse({ all: true }).success).toBe(true);
    expect(checklistTickSchema.safeParse({ all: false }).success).toBe(false);
    expect(checklistTickSchema.safeParse({ itemId: "x", checked: true }).success).toBe(false);
    expect(checklistTickSchema.safeParse({ itemId: ids(1), checked: true, extra: 1 }).success).toBe(false);
  });
  it("makes a stable photo version from the row's time", () => {
    expect(photoVersion("2026-11-25T01:00:00.000Z")).toBe(String(Date.parse("2026-11-25T01:00:00.000Z")));
    expect(photoVersion(null)).toBe("1");
  });
});

describe("Mode demo's sample", () => {
  it("is five items in an agenda before the first day", () => {
    expect(sampleChecklistItems).toHaveLength(5);
    const lists = sampleChecklists();
    expect(lists.get(samplePrepSession.id)?.items).toBe(sampleChecklistItems);
  });
  it("keeps only known sample ids from the cookie", () => {
    const [a, b] = sampleChecklistItems;
    expect([...parseDemoTicks(`${a.id},${b.id},bukan-id`)]).toEqual([a.id, b.id]);
    expect(parseDemoTicks(undefined).size).toBe(0);
  });
});
