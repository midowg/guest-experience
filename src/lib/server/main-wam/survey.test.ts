import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSessionIds, sampleSessions, sampleSettings, sampleViewers } from "@/lib/main-wam/sample";
import type { MainWamSettings } from "@/lib/main-wam/types";

/* surveyFor (audit R7): Beranda and Detail sesi ask the same question; reads only once the survey's session started. */

const form = { id: "f1", name: "Survei", slug: "survei-wam", oldSlugs: [], status: "buka", intro: "", cardText: "", minutes: 5, editUntil: null, stayDeleteOn: null, hrAccess: [], audience: "semua", audienceIds: [] as string[] };
const formAt = vi.fn(async (slug: string) => (slug === "survei-wam" ? { form, moved: false } : null));
const myAnswers = vi.fn(async () => ({ answers: {}, consentAt: null, completedAt: null as string | null, anonymousSent: false, progress: { sectionsDone: 0, sectionsTotal: 2, requiredLeft: 3, done: false } }));
vi.mock("../pra-wam/questionnaire", () => ({ formAt }));
vi.mock("../pra-wam/questionnaire-answers", () => ({ myAnswers }));

const { surveyFor } = await import("./survey");

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const context = (settings: Partial<MainWamSettings> = {}, viewer = sampleViewers.peserta) => ({ viewer, settings: sampleSettings(settings) });

beforeEach(() => { vi.clearAllMocks(); });

describe("surveyFor", () => {
  it("before its session: nothing read, nothing shown", async () => {
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "07:30"))).toBeNull();
    expect(formAt).not.toHaveBeenCalled();
    expect(myAnswers).not.toHaveBeenCalled();
  });

  it("open after its session started (also after it ended), for this person's own answers", async () => {
    const open = await surveyFor(context(), sampleSessions, at("2027-01-07", "10:30"));
    expect(open).toEqual({ formSlug: "survei-wam", sessionId: sampleSessionIds.penutupan, until: "2027-01-07T23:59:00+07:00", minutes: 5 });
    expect(myAnswers).toHaveBeenCalledWith(form, sampleViewers.peserta.id);
  });

  it("already sent (completed, or every required answer in): gone, on Beranda and on Detail sesi", async () => {
    myAnswers.mockResolvedValueOnce({ answers: {}, consentAt: null, completedAt: "2027-01-07T08:20:00+07:00", anonymousSent: true, progress: { sectionsDone: 2, sectionsTotal: 2, requiredLeft: 0, done: true } });
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "08:30"))).toBeNull();
    myAnswers.mockResolvedValueOnce({ answers: {}, consentAt: null, completedAt: null, anonymousSent: true, progress: { sectionsDone: 2, sectionsTotal: 2, requiredLeft: 0, done: true } });
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "08:30"), sampleSessionIds.penutupan)).toBeNull();
  });

  it("closed questionnaire, not meant for the person, module off, or no questionnaire chosen: nothing", async () => {
    formAt.mockResolvedValueOnce({ form: { ...form, status: "tutup" }, moved: false });
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "08:30"))).toBeNull();
    formAt.mockResolvedValueOnce({ form: { ...form, audience: "pilih", audienceIds: ["orang-lain"] }, moved: false });
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "08:30"))).toBeNull();
    expect(await surveyFor(context({ modules: { ...sampleSettings().modules, survei: false } }), sampleSessions, at("2027-01-07", "08:30"))).toBeNull();
    expect(await surveyFor(context({ moduleConfig: { ...sampleSettings().moduleConfig, survei: { formSlug: null } } }), sampleSessions, at("2027-01-07", "08:30"))).toBeNull();
    expect(formAt).toHaveBeenCalledTimes(2);
  });

  it("answers that cannot be read: the survey still shows (its own page says where they are)", async () => {
    myAnswers.mockRejectedValueOnce(new Error("down"));
    expect(await surveyFor(context(), sampleSessions, at("2027-01-07", "08:30"))).toMatchObject({ formSlug: "survei-wam" });
  });
});
