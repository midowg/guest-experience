import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSession, sampleSettings, sampleViewers } from "@/lib/main-wam/sample";

/*
 * What Detail sesi's slots hold for the Absen module, in both states of the QR check-in switch (QR_ABSEN_VISIBLE,
 * KONTRAK 41). Hidden (the owner's decision): no Absen button, no QR for panitia; "Hadir 07.52" once
 * recorded, one calm line about the tablet before that, "Tidak tercatat hadir" after the window. Shown: as before.
 */

const read = vi.hoisted(() => ({ myCheckIn: vi.fn(), presentCount: vi.fn() }));
vi.mock("@/lib/server/main-wam/modul/absen", () => ({ myCheckIn: read.myCheckIn, presentCount: read.presentCount }));
vi.mock("@/lib/server/main-wam/modul/contact", () => ({ panitiaContact: async () => null }));
vi.mock("@/lib/server/main-wam/modul/awards", () => ({ awardsShown: async () => ({ categories: [], approvals: new Map() }) }));
vi.mock("@/lib/server/main-wam/modul/silent", () => ({ silentNow: async () => ({ view: null }) }));
vi.mock("@/lib/server/main-wam/survey", () => ({ surveyFor: async () => null }));
vi.mock("@/lib/server/main-wam/kuis/agenda", () => ({ quizOfSession: async () => null }));
vi.mock("@/lib/server/main-wam/lang", () => ({ serverT: async () => (key: string) => key }));

import { absenSlot, moduleSlot } from "./SessionModule";

const at = (time: string) => new Date(`2027-01-05T${time}:00+07:00`);
const session = sampleSession("pemaparan");
const context = (role: keyof typeof sampleViewers, modules: Partial<ReturnType<typeof sampleSettings>["modules"]> = {}) => {
  const settings = sampleSettings();
  return { viewer: sampleViewers[role], settings: { ...settings, modules: { ...settings.modules, ...modules } } };
};

beforeEach(() => { vi.clearAllMocks(); read.myCheckIn.mockResolvedValue(null); });

describe("absenSlot with the QR check-in hidden (the default)", () => {
  it("is false by default: the owner's decision", async () => {
    expect((await import("@/lib/main-wam/modules")).QR_ABSEN_VISIBLE).toBe(false);
  });

  it("says 'tablet' before and while absen is open: no button", async () => {
    expect(await absenSlot({ session, context: context("peserta"), now: at("07:00") })).toEqual({ kind: "tablet" });
    expect(await absenSlot({ session, context: context("peserta"), now: at("09:00") })).toEqual({ kind: "tablet" });
  });

  it("keeps 'Hadir 07.52' once the tablet or panitia recorded the person", async () => {
    read.myCheckIn.mockResolvedValue("2027-01-04T17:00:00Z");
    expect(await absenSlot({ session, context: context("peserta"), now: at("09:00") })).toEqual({ kind: "hadir", at: "2027-01-04T17:00:00Z" });
  });

  it("keeps 'Tidak tercatat hadir' with the way to panitia after the window", async () => {
    expect(await absenSlot({ session, context: context("peserta"), now: at("13:00") })).toMatchObject({ kind: "terlewat" });
  });

  it("leaves the BOD's 'Hadir 96 dari 120', and nothing for a module off, a draft or a session without absen", async () => {
    read.presentCount.mockResolvedValue({ present: 96, expected: 120 });
    expect(await absenSlot({ session, context: context("bod"), now: at("09:00") })).toEqual({ kind: "bod", present: 96, expected: 120 });
    expect(await absenSlot({ session, context: context("peserta", { absen: false }), now: at("09:00") })).toEqual({ kind: "none" });
    expect(await absenSlot({ session: { ...session, usesAttendance: false }, context: context("peserta"), now: at("09:00") })).toEqual({ kind: "none" });
    expect(await absenSlot({ session: { ...session, status: "draf" }, context: context("peserta"), now: at("09:00") })).toEqual({ kind: "none" });
  });

  it("offers panitia no QR sheet", async () => {
    expect((await moduleSlot({ session, context: context("panitia"), now: at("09:00") })).qr).toBeNull();
  });
});

describe("absenSlot with the QR check-in shown (the switch turned back on)", () => {
  it("opens the Absen button while the window is open (an unfinished checklist never locks it, KONTRAK 42)", async () => {
    expect(await absenSlot({ session, context: context("peserta"), now: at("09:00"), qr: true })).toMatchObject({ kind: "buka" });
    expect(await absenSlot({ session, context: context("peserta"), now: at("07:00"), qr: true })).toEqual({ kind: "none" });
  });

  it("offers panitia the QR sheet, and participants none", async () => {
    expect((await moduleSlot({ session, context: context("panitia"), now: at("09:00"), qr: true })).qr).toEqual({ sessionId: session.id });
    expect((await moduleSlot({ session, context: context("peserta"), now: at("09:00"), qr: true })).qr).toBeNull();
  });
});
