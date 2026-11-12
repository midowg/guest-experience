import { describe, expect, it } from "vitest";
import {
  asMinutesRule, choiceOf, DEFAULT_MINUTES_RULE, defaultAbsent, itemsAsText, minutesInputSchema, minutesItems, minutesNumber, minutesOpen, minutesStatus, needsMinutes, openActions, presence, ruleNeeds, storedOf,
} from "./minutes";
import { fitWithin, isJpeg, isMeetingPhotoKey, momPhotoKeyFor, momPhotoRule, photoLimitLabel } from "./minutes-photos";

const meeting = (patch: Partial<Parameters<typeof needsMinutes>[0]> = {}) => ({
  status: "terbit" as const, kind: "rapat" as const, startsAt: "2026-11-10T02:00:00.000Z", endsAt: "2026-11-10T03:00:00.000Z", participantCount: 4, ...patch,
});
const during = new Date("2026-11-10T02:30:00.000Z");
const after = new Date("2026-11-10T05:00:00.000Z");

describe("notulen (MoM)", () => {
  it("is needed for every published meeting of three or more, not a one-on-one, an Acara, a draft or one without hours", () => {
    expect(needsMinutes(meeting())).toBe(true);
    expect(needsMinutes(meeting({ kind: "forum" }))).toBe(true);
    expect(needsMinutes(meeting({ participantCount: 2 }))).toBe(false);
    expect(needsMinutes(meeting({ kind: "acara" }))).toBe(false);
    expect(needsMinutes(meeting({ status: "draf" }))).toBe(false);
    expect(needsMinutes(meeting({ startsAt: null, endsAt: null }))).toBe(false);
  });

  it("follows Admin WAM's rule per kind and for one-on-ones, unless the session chose", () => {
    const rule = { forum: false, rapat: true, acara: true, berdua: true };
    expect(needsMinutes(meeting({ kind: "forum" }), rule)).toBe(false);
    expect(needsMinutes(meeting({ kind: "acara" }), rule)).toBe(true);
    expect(needsMinutes(meeting({ participantCount: 2 }), rule)).toBe(true);
    expect(ruleNeeds({ kind: "rapat", participantCount: 2 }, DEFAULT_MINUTES_RULE)).toBe(false);
    // The session's own choice wins over the rule; a draft or one without hours never needs one.
    expect(needsMinutes(meeting({ kind: "acara", minutesRequired: true }))).toBe(true);
    expect(needsMinutes(meeting({ minutesRequired: false }))).toBe(false);
    expect(needsMinutes(meeting({ status: "draf", minutesRequired: true }))).toBe(false);
    expect(minutesStatus(meeting({ minutesRequired: false }), false, new Date("2027-01-01T00:00:00Z"))).toBe("tidak-perlu");
  });

  it("reads a stored rule safely and maps the session's choice", () => {
    expect(asMinutesRule(null)).toEqual(DEFAULT_MINUTES_RULE);
    expect(asMinutesRule({ acara: true, forum: "ya" })).toEqual({ ...DEFAULT_MINUTES_RULE, acara: true });
    expect([choiceOf(true), choiceOf(false), choiceOf(null), choiceOf(undefined)]).toEqual(["wajib", "tidak", "ikut", "ikut"]);
    expect([storedOf("wajib"), storedOf("tidak"), storedOf("ikut")]).toEqual([true, false, null]);
  });

  it("is missing only once the meeting is over; written, it is done; it can be written from the start", () => {
    expect(minutesStatus(meeting(), false, during)).toBe("belum-waktunya");
    expect(minutesStatus(meeting(), false, after)).toBe("belum");
    expect(minutesStatus(meeting(), true, during)).toBe("sudah");
    expect(minutesStatus(meeting({ participantCount: 2 }), false, after)).toBe("tidak-perlu");
    expect(minutesStatus(meeting({ participantCount: 2 }), true, after)).toBe("sudah");
    expect(minutesOpen(meeting(), new Date("2026-11-10T01:59:00.000Z"))).toBe(false);
    expect(minutesOpen(meeting(), during)).toBe(true);
  });

  it("asks for a summary or decisions, and a task for each follow-up", () => {
    expect(minutesInputSchema.safeParse({ summary: "Bahas target", decisions: "", actions: [] }).success).toBe(true);
    expect(minutesInputSchema.safeParse({ summary: " ", decisions: "", actions: [] }).success).toBe(false);
    const task = minutesInputSchema.safeParse({ summary: "Bahas", actions: [{ task: "x", picId: null, dueDate: null }] });
    expect(task.success ? [] : task.error.issues.map(issue => issue.message)).toEqual(["Isi tugasnya."]);
    expect(minutesInputSchema.safeParse({ summary: "Bahas", actions: [{ task: "Kirim data", picId: "bukan-id", dueDate: null }] }).success).toBe(false);
  });

  it("lists open follow-ups, the late ones first", () => {
    const list = openActions([
      { task: "Nanti", picId: null, dueDate: "2026-11-20", done: false },
      { task: "Selesai", picId: null, dueDate: "2026-11-01", done: true },
      { task: "Telat", picId: null, dueDate: "2026-11-05", done: false },
    ], "2026-11-11");
    expect(list.map(action => [action.task, action.late])).toEqual([["Telat", true], ["Nanti", false]]);
  });

  it("takes the FRM form: agenda items with a topic and their discussion or decision, chair, who did not come, next meeting", () => {
    const ok = minutesInputSchema.safeParse({
      items: [{ topic: "Target Q1", discussion: "Bahas target", decision: "" }, { topic: "Seragam", decision: "Batik", added: true }],
      chairId: "11111111-1111-4111-8111-111111111111", absentIds: [], guests: " Pak Andi ",
      next: { date: "2026-11-24", time: "10:00", place: "Vasuki", agenda: "" },
    });
    expect(ok.success && ok.data.items.map(item => item.added)).toEqual([false, true]);
    expect(ok.success && ok.data.guests).toBe("Pak Andi");
    const issues = (input: unknown) => { const parsed = minutesInputSchema.safeParse(input); return parsed.success ? [] : parsed.error.issues.map(issue => issue.message); };
    expect(issues({ items: [{ topic: "Target", discussion: "", decision: "" }] })).toEqual(["Isi pembahasan atau keputusan untuk topik ini."]);
    expect(issues({ items: [{ topic: "x", discussion: "Bahas" }] })).toEqual(["Isi topiknya."]);
    expect(issues({ items: [] })).toEqual(["Isi minimal satu topik dengan pembahasan atau keputusannya."]);
    expect(issues({ items: [{ topic: "Target", discussion: "Bahas" }], next: { time: "25:00" } })).toEqual(["Jam meeting berikutnya tidak valid."]);
    expect(issues({ items: [{ topic: "Target", discussion: "Bahas" }], chairId: "bukan" })).toEqual(["Pilih pimpinan rapat dari daftar."]);
  });

  it("reads a MoM from before the form as one agenda item, and keeps the items as text before its migration", () => {
    expect(minutesItems({ items: [], summary: " Bahas target ", decisions: "Naik 10%" })).toEqual([{ topic: "Pembahasan", discussion: "Bahas target", decision: "Naik 10%", added: false }]);
    expect(minutesItems({ items: [], summary: "", decisions: " " })).toEqual([]);
    const items = [{ topic: "Target", discussion: "Bahas target", decision: "Naik 10%", added: false }, { topic: "Seragam", discussion: "", decision: "Batik", added: true }];
    expect(minutesItems({ items, summary: "lama", decisions: "" })).toBe(items);
    expect(itemsAsText(items)).toEqual({ summary: "1. Target\nBahas target\n\n2. Seragam (topik baru)", decisions: "Target: Naik 10%\nSeragam (topik baru): Batik" });
    expect(itemsAsText([items[0]])).toEqual({ summary: "Bahas target", decisions: "Naik 10%" });
  });

  it("numbers a MoM in the month of its meeting, and marks absent who did not check in once anyone did", () => {
    expect(minutesNumber(12, "2026-11-10")).toBe("MoM/2026/11/0012");
    expect(minutesNumber(12345, "2027-01-05")).toBe("MoM/2027/01/12345");
    const person = (id: string, checkedIn: boolean) => ({ id, name: id, fullName: id, department: "", position: "", frmPosition: "", checkedIn });
    expect(defaultAbsent([person("a", true), person("b", false)])).toEqual(["b"]);
    expect(defaultAbsent([person("a", false), person("b", false)])).toEqual([]);
    const { present, absent } = presence([person("a", true), person("b", false)], ["b"]);
    expect([present.map(one => one.id), absent.map(one => one.id)]).toEqual([["a"], ["b"]]);
  });

  it("keeps meeting photos Full HD within 1 MB (1280 px, 400 KB before the migration), in the meeting's own folder, JPEG only", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1440, height: 1920 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(4032, 3024, momPhotoRule(false).sides[0])).toEqual({ width: 1280, height: 960 });
    expect(momPhotoRule(true)).toMatchObject({ sides: [1920, 1600], bytes: 1024 * 1024 });
    // The quality is never lowered until the photo breaks up.
    expect(Math.min(...momPhotoRule(true).steps)).toBeGreaterThanOrEqual(0.8);
    expect([photoLimitLabel(1024 * 1024), photoLimitLabel(400 * 1024)]).toEqual(["1 MB", "400 KB"]);
    const session = "5e550000-0000-4000-8000-000000000001";
    const key = momPhotoKeyFor(session, "0a000000-0000-4000-8000-000000000001");
    expect(isMeetingPhotoKey(key, session)).toBe(true);
    expect(isMeetingPhotoKey(key, "5e550000-0000-4000-8000-000000000002")).toBe(false);
    expect(isMeetingPhotoKey("pra-wam/mom/../x.jpg", session)).toBe(false);
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});
