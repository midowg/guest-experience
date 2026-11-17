import { describe, expect, it } from "vitest";
import { sampleSessionIds, sampleSessions } from "../sample";
import type { MwSession } from "../types";
import { eventEndsAt, surveyOpen, surveyStarted, type SurveyForm } from "./survey";

/* Survei (audit R7): one rule for Beranda and Detail sesi. The survei session is Kam 7 Jan 08.00–09.30 (sample). */

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const eventEnd = eventEndsAt("2027-01-07");
const form: SurveyForm = { slug: "survei-wam", status: "buka", editUntil: null, minutes: 5 };
const started = (now: Date, extra: Partial<Parameters<typeof surveyStarted>[0]> = {}) =>
  surveyStarted({ formSlug: "survei-wam", moduleOn: true, sessions: sampleSessions, now, eventEnd, ...extra });

describe("Survei: one rule", () => {
  it("opens when its session starts, not before", () => {
    expect(started(at("2027-01-07", "07:59"))).toBeNull();
    expect(started(at("2027-01-07", "08:00"))).toMatchObject({ formSlug: "survei-wam", sessionId: sampleSessionIds.penutupan, startsAt: "2027-01-07T08:00:00+07:00" });
  });

  it("stays open after its session ends (the old Beranda card stopped at 09.30), until the event is over", () => {
    const after = at("2027-01-07", "15:00");
    expect(surveyOpen(started(after), { form, done: false, now: after })).toEqual({ formSlug: "survei-wam", sessionId: sampleSessionIds.penutupan, until: "2027-01-07T23:59:00+07:00", minutes: 5 });
    expect(started(at("2027-01-07", "23:59"))).toBeNull();
    expect(started(at("2027-01-08", "08:00"))).toBeNull();
  });

  it("closes with the questionnaire: not open any more, or its edit time passed; until = the earlier end", () => {
    const now = at("2027-01-07", "08:10");
    const start = started(now);
    expect(surveyOpen(start, { form: { ...form, editUntil: "2027-01-07T12:00:00+07:00" }, done: false, now })?.until).toBe("2027-01-07T12:00:00+07:00");
    expect(surveyOpen(start, { form: { ...form, editUntil: "2027-01-08T12:00:00+07:00" }, done: false, now })?.until).toBe("2027-01-07T23:59:00+07:00");
    expect(surveyOpen(start, { form: { ...form, status: "tutup" }, done: false, now })).toBeNull();
    expect(surveyOpen(start, { form: { ...form, status: "draf" }, done: false, now })).toBeNull();
    const late = at("2027-01-07", "12:30");
    expect(surveyOpen(started(late), { form: { ...form, editUntil: "2027-01-07T12:00:00+07:00" }, done: false, now: late })).toBeNull();
    expect(surveyOpen(start, { form: null, done: false, now })).toBeNull();
  });

  it("gone for someone who already sent it", () => {
    const now = at("2027-01-07", "08:10");
    expect(surveyOpen(started(now), { form, done: true, now })).toBeNull();
  });

  it("nothing with the module off, no questionnaire, or a cancelled session", () => {
    const now = at("2027-01-07", "08:10");
    expect(started(now, { moduleOn: false })).toBeNull();
    expect(started(now, { formSlug: null })).toBeNull();
    const cancelled: MwSession[] = sampleSessions.map(session => (session.module === "survei" ? { ...session, status: "batal" } : session));
    expect(started(now, { sessions: cancelled })).toBeNull();
  });

  it("Detail sesi asks about its own session only", () => {
    const now = at("2027-01-07", "08:10");
    expect(started(now, { sessionId: sampleSessionIds.penutupan })?.sessionId).toBe(sampleSessionIds.penutupan);
    expect(started(now, { sessionId: sampleSessionIds.pemaparan })).toBeNull();
  });

  it("the event's end is its last day, 23.59 WIB", () => {
    expect(eventEndsAt("2027-01-07")).toBe("2027-01-07T23:59:00+07:00");
    expect(eventEndsAt(null)).toBeNull();
    expect(eventEndsAt("bukan")).toBeNull();
  });
});
