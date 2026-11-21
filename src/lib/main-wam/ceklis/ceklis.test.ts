import { describe, expect, it } from "vitest";
import { sampleChecklistItems, sampleChecklists, samplePrepSession, parseDemoTicks } from "./sample";
import {
  ceklisBlock, checklistInputSchema, checklistProgress, checklistTickSchema, gatesAbsen, isChecklistPhotoKey, photoVersion, type SessionChecklist,
} from "./ceklis";
import { sampleSessionIds, sampleSessions } from "../sample";
import { daysBeforeEvent, isPrepDate, isSessionDate, prepDatesOf, prepRange } from "../rundown";

const EVENT = { startDate: "2027-01-04", endDate: "2027-01-07" };
const ids = (n: number) => `00000000-0000-4000-8014-${String(n).padStart(12, "0")}`;
const list = (required: boolean, count = 3): SessionChecklist => ({
  required,
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
    const items = list(false).items;
    expect(checklistProgress(items, new Set([ids(1)]))).toEqual({ done: 1, total: 3, complete: false });
    expect(checklistProgress(items, new Set([ids(1), ids(2), ids(3), "elsewhere"]))).toEqual({ done: 3, total: 3, complete: true });
    expect(checklistProgress([], new Set())).toEqual({ done: 0, total: 0, complete: false });
  });
  it("gates absen only when switched on and there is something to tick", () => {
    expect(gatesAbsen(list(true))).toBe(true);
    expect(gatesAbsen(list(false))).toBe(false);
    expect(gatesAbsen({ required: true, items: [] })).toBe(false);
    expect(gatesAbsen(undefined)).toBe(false);
  });
});

describe("the gate on absen", () => {
  const prep = { id: "p", title: "Persiapan berangkat", status: "terbit" as const, startsAt: "2027-01-01T09:00:00+07:00" };
  const first = { id: "k", title: "Kumpul", status: "terbit" as const, startsAt: "2027-01-04T05:30:00+07:00", usesAttendance: true };
  const lists = (required: boolean) => new Map([["p", list(required)]]);

  it("stops absen at a later session until every item is ticked", () => {
    expect(ceklisBlock(first, [prep, first], lists(true), new Set([ids(1)]))).toEqual({ sessionId: "p", title: "Persiapan berangkat", done: 1, total: 3 });
    expect(ceklisBlock(first, [prep, first], lists(true), new Set([ids(1), ids(2), ids(3)]))).toBeNull();
  });
  it("is only a reminder without the switch", () => {
    expect(ceklisBlock(first, [prep, first], lists(false), new Set())).toBeNull();
  });
  it("never stops a session without absen, an earlier session, or the checklist's own agenda", () => {
    expect(ceklisBlock({ ...first, usesAttendance: false }, [prep, first], lists(true), new Set())).toBeNull();
    expect(ceklisBlock({ id: "e", startsAt: "2026-12-30T09:00:00+07:00", usesAttendance: true }, [prep, first], lists(true), new Set())).toBeNull();
    expect(ceklisBlock({ ...prep, usesAttendance: true }, [prep, first], lists(true), new Set())).toBeNull();
  });
  it("ignores a draft or cancelled checklist agenda", () => {
    expect(ceklisBlock(first, [{ ...prep, status: "batal" as never }, first], lists(true), new Set())).toBeNull();
    expect(ceklisBlock(first, [{ ...prep, status: "draf" as never }, first], lists(true), new Set())).toBeNull();
  });
  it("names the earliest unfinished checklist when there are two", () => {
    const second = { id: "q", title: "Cek dokumen", status: "terbit" as const, startsAt: "2027-01-02T09:00:00+07:00" };
    const other: SessionChecklist = { required: true, items: [10, 11].map(n => ({ id: ids(n), sessionId: "q", text: `Dokumen ${n}`, note: "", photo: null, sort: n })) };
    const both = new Map([["p", list(true)], ["q", other]]);
    expect(ceklisBlock(first, [second, prep, first], both, new Set([ids(1), ids(2), ids(3)]))).toMatchObject({ sessionId: "q" });
    expect(ceklisBlock(first, [second, prep, first], both, new Set())).toMatchObject({ sessionId: "p" });
  });
});

describe("what the admin and the participant send", () => {
  const item = { text: "Jaket", note: "", photo: null };
  it("accepts a checklist and keeps item order", () => {
    const parsed = checklistInputSchema.parse({ required: true, items: [item, { ...item, text: "Tumbler", id: ids(2) }] });
    expect(parsed.items.map(entry => entry.text)).toEqual(["Jaket", "Tumbler"]);
  });
  it("refuses 'wajib' without items, an empty text, too many items, and a repeated id", () => {
    expect(checklistInputSchema.safeParse({ required: true, items: [] }).success).toBe(false);
    expect(checklistInputSchema.safeParse({ required: false, items: [{ ...item, text: "  " }] }).success).toBe(false);
    expect(checklistInputSchema.safeParse({ required: false, items: Array.from({ length: 31 }, () => item) }).success).toBe(false);
    expect(checklistInputSchema.safeParse({ required: false, items: [{ ...item, id: ids(1) }, { ...item, id: ids(1) }] }).success).toBe(false);
  });
  it("only takes a photo key of the checklist's own folder", () => {
    const key = "main-wam/ceklis/00000000-0000-4000-8000-000000000001.webp";
    expect(isChecklistPhotoKey(key)).toBe(true);
    expect(isChecklistPhotoKey("main-wam/panduan/00000000-0000-4000-8000-000000000001.webp")).toBe(false);
    expect(isChecklistPhotoKey("main-wam/ceklis/../tema/x.webp")).toBe(false);
    expect(checklistInputSchema.safeParse({ required: false, items: [{ ...item, photo: { key, mime: "image/webp", size: 1000 } }] }).success).toBe(true);
    expect(checklistInputSchema.safeParse({ required: false, items: [{ ...item, photo: { key: "tema/x.webp", mime: "image/webp", size: 1000 } }] }).success).toBe(false);
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
  it("is five items in an agenda before the first day that gates the first absen", () => {
    expect(sampleChecklistItems).toHaveLength(5);
    const lists = sampleChecklists();
    expect(lists.get(samplePrepSession.id)?.required).toBe(true);
    const kumpul = sampleSessions.find(session => session.id === sampleSessionIds.kumpul)!;
    expect(ceklisBlock(kumpul, [samplePrepSession, kumpul], lists, new Set())).toMatchObject({ sessionId: samplePrepSession.id, done: 0, total: 5 });
    expect(ceklisBlock(kumpul, [samplePrepSession, kumpul], lists, new Set(sampleChecklistItems.map(item => item.id)))).toBeNull();
  });
  it("keeps only known sample ids from the cookie", () => {
    const [a, b] = sampleChecklistItems;
    expect([...parseDemoTicks(`${a.id},${b.id},bukan-id`)]).toEqual([a.id, b.id]);
    expect(parseDemoTicks(undefined).size).toBe(0);
  });
});
