import { describe, expect, it } from "vitest";
import { asMinutesRule, choiceOf, DEFAULT_MINUTES_RULE, minutesInputSchema, minutesOpen, minutesStatus, needsMinutes, openActions, ruleNeeds, storedOf } from "./minutes";

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
});
