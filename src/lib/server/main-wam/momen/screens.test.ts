import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSession, sampleSettings, sampleViewers } from "@/lib/main-wam/sample";
import type { MwSession } from "@/lib/main-wam/types";

/*
 * Momen's first-paint screens list only the sessions a participant may see: with module Ceklis off the
 * Persiapan agendas (dated before the first day) are left out of the sheets and the camera, as in
 * Beranda and Agenda ("modul mati tidak meninggalkan jejak").
 */

const state = vi.hoisted(() => ({ sessions: [] as MwSession[] }));
vi.mock("../read", () => ({ allSessions: async () => ({ data: state.sessions, migrated: true }) }));
vi.mock("../lang", () => ({ readLang: async () => "id" }));
vi.mock("./feed", () => ({
  listFeed: async () => ({ items: [], next: null, total: 0, migrated: true }),
  sessionCounts: async () => [],
  feedPhotos: async () => [],
  photoRecord: async () => null,
}));

const { cameraScreen, stackScreen } = await import("./screens");

const NOW = new Date("2027-01-04T10:00:00+07:00");
const prep: MwSession = { ...sampleSession("kumpul"), id: "00000000-0000-4000-8000-0000000000a1", title: "Persiapan berangkat", startsAt: "2027-01-02T09:00:00+07:00", endsAt: null };
const day: MwSession = { ...sampleSession("kumpul"), id: "00000000-0000-4000-8000-0000000000b1", title: "Kumpul" };
const context = (ceklis: boolean) => {
  const settings = sampleSettings();
  return { viewer: sampleViewers.peserta, settings: { ...settings, modules: { ...settings.modules, ceklis } } };
};

beforeEach(() => { state.sessions = [prep, day]; });

describe("Momen's sessions follow module Ceklis", () => {
  it("camera: the Persiapan agenda is there only while Ceklis is on", async () => {
    expect((await cameraScreen(context(true), {}, NOW)).sessions.map(session => session.title)).toEqual(["Persiapan berangkat", "Kumpul"]);
    expect((await cameraScreen(context(false), {}, NOW)).sessions.map(session => session.title)).toEqual(["Kumpul"]);
  });

  it("stack: the filter sheet's sessions follow it too", async () => {
    expect((await stackScreen(context(true), {}, NOW)).sessions.map(session => session.title)).toContain("Persiapan berangkat");
    expect((await stackScreen(context(false), {}, NOW)).sessions.map(session => session.title)).not.toContain("Persiapan berangkat");
  });
});
