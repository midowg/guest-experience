import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sampleSession, sampleActivityGroups, sampleAttendance, sampleAwards, sampleGroups, sampleGuides, sampleNotifications, samplePeopleList, sampleSeats, sampleSessions,
  sampleSettings, sampleSilentQuestion, sampleTrips, sampleViewers,
} from "@/lib/main-wam/sample";
import type { MainWamSettings, MainWamViewer } from "@/lib/main-wam/types";

/*
 * Agen A's loaders: each part reads only what it may show (module on, the role takes part, the
 * kelompok published), a failing part is left out, and nothing of another person comes back
 * (a colleague's number only for the contacts the event names).
 */

const read = {
  shownSessions: vi.fn(async () => ({ data: sampleSessions, migrated: true })),
  attendanceOf: vi.fn<(filter: { employeeId?: string }) => Promise<{ data: typeof sampleAttendance; migrated: boolean }>>(async () => ({ data: sampleAttendance, migrated: true })),
  silentQuestions: vi.fn(async () => ({ data: [sampleSilentQuestion], migrated: true })),
  awardCategories: vi.fn(async () => ({ data: sampleAwards, migrated: true })),
  votedCategories: vi.fn(async () => ({ data: new Set<string>(), migrated: true })),
  listTrips: vi.fn(async () => ({ data: sampleTrips, migrated: true })),
  seatsOf: vi.fn<(id: string) => Promise<{ data: typeof sampleSeats; migrated: boolean }>>(async () => ({ data: sampleSeats, migrated: true })),
  listGroups: vi.fn(async () => ({ data: sampleGroups, migrated: true })),
  activityGroups: vi.fn<(filter: { employeeId?: string }) => Promise<{ data: typeof sampleActivityGroups; migrated: boolean }>>(async () => ({ data: sampleActivityGroups, migrated: true })),
  rundownLog: vi.fn(async () => ({ data: [], migrated: true })),
  listGuides: vi.fn(async () => ({ data: sampleGuides, migrated: true })),
  sessionById: vi.fn(async (id: string) => sampleSessions.find(session => session.id === id) ?? null),
  guideBySlug: vi.fn(async () => null),
};
vi.mock("../read", () => read);
const pinnedForMe = vi.fn(async () => sampleNotifications);
vi.mock("../notes", () => ({ pinnedForMe, myMainWamNotifications: async () => ({ items: sampleNotifications, unread: 3, migrated: true }) }));
const surveyFor = vi.fn<(...args: unknown[]) => Promise<{ formSlug: string; sessionId: string; until: string | null; minutes: number | null } | null>>(async () => null);
vi.mock("../survey", () => ({ surveyFor }));
vi.mock("../people", () => ({ mainWamPeople: async () => new Map(samplePeopleList().map(person => [person.id, person])) }));
vi.mock("../../pra-wam/mcp", () => ({ mcpAccessOf: async () => ({ granted: true, hasKey: true, lastUsedAt: null }) }));
const phoneQuery = vi.fn();
vi.mock("../../supabase/admin", () => ({
  createPrivilegedClient: () => ({ from: () => ({ select: () => ({ in: (_column: string, ids: string[]) => ({ limit: async () => { phoneQuery(ids); return { data: ids.map(id => ({ id, phone: "0800-0000-0001" })), error: null }; } }) }) }) }),
}));

const { loadHome } = await import("./home");
const { loadAgenda, loadSession } = await import("./agenda");
const { loadRoom, loadMe, loadTravel } = await import("./saya");
const { contactsOf } = await import("./contacts");

const context = (viewer: MainWamViewer, settings: Partial<MainWamSettings> = {}) => ({ viewer, settings: sampleSettings(settings) });
const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);

beforeEach(() => { vi.clearAllMocks(); });

describe("Beranda's loader", () => {
  it("peserta at 07.30: Pemaparan with Absen (not checked in yet); own check-ins only", async () => {
    read.attendanceOf.mockResolvedValueOnce({ data: [], migrated: true });
    const data = await loadHome(context(sampleViewers.peserta), at("2027-01-05", "07:30"));
    expect(data.now).toMatchObject({ kind: "sesi", title: "Pemaparan departemen", absen: true });
    expect(data.session?.title).toBe("Pemaparan departemen");
    expect(read.attendanceOf).toHaveBeenCalledWith({ employeeId: sampleViewers.peserta.id });
    expect(read.listTrips).not.toHaveBeenCalled();
  });

  it("BOD: no check-in, no Silent Meeting or voting read", async () => {
    await loadHome(context(sampleViewers.bod), at("2027-01-06", "10:00"));
    expect(read.attendanceOf).not.toHaveBeenCalled();
    expect(read.silentQuestions).not.toHaveBeenCalled();
    expect(read.awardCategories).not.toHaveBeenCalled();
  });

  it("modules off: none of their reads, and no trace on the card", async () => {
    const off = { absen: false, voting: false, silent: false, survei: false, mozaik: false, karbon: false, kuis: false, ceklis: false, misi: false };
    const data = await loadHome(context(sampleViewers.peserta, { modules: off }), at("2027-01-05", "13:45"));
    expect(read.attendanceOf).not.toHaveBeenCalled();
    expect(read.silentQuestions).not.toHaveBeenCalled();
    expect(data.now).toMatchObject({ absen: false });
    expect(data.card?.kind).not.toBe("silent");
  });

  it("the travel day reads the trips and the person's own seats", async () => {
    pinnedForMe.mockResolvedValueOnce([]);
    const data = await loadHome(context(sampleViewers.peserta), at("2027-01-04", "05:05"));
    expect(read.seatsOf).toHaveBeenCalledWith(sampleViewers.peserta.id);
    expect(data.card).toMatchObject({ kind: "berangkat", title: "Kereta ke Malang" });
  });

  it("Survei (R7): the card is what surveyFor says (the one rule), with this person's context; a failure leaves it out", async () => {
    pinnedForMe.mockResolvedValueOnce([]);
    surveyFor.mockResolvedValueOnce({ formSlug: "survei-wam", sessionId: "s", until: "2027-01-07T12:00:00+07:00", minutes: 5 });
    const now = at("2027-01-07", "08:30");
    const data = await loadHome(context(sampleViewers.peserta), now);
    expect(surveyFor).toHaveBeenCalledWith(expect.objectContaining({ viewer: sampleViewers.peserta }), sampleSessions, now);
    expect(data.card).toMatchObject({ kind: "survei", sub: "5 menit · sampai 12.00", target: { survey: "survei-wam" } });
    pinnedForMe.mockResolvedValueOnce([]);
    surveyFor.mockResolvedValueOnce(null);
    expect((await loadHome(context(sampleViewers.peserta), now)).card).toBeNull();
    pinnedForMe.mockResolvedValueOnce([]);
    surveyFor.mockRejectedValueOnce(new Error("db"));
    expect((await loadHome(context(sampleViewers.peserta), now)).card).toBeNull();
  });

  it("sends the server's clock with the data (S6: the phone counts refreshAt from it)", async () => {
    const now = at("2027-01-05", "07:30");
    expect((await loadHome(context(sampleViewers.peserta), now)).serverNow).toBe(now.toISOString());
  });

  it("a failing part is left out; a failing rundown says so", async () => {
    read.silentQuestions.mockRejectedValueOnce(new Error("db"));
    pinnedForMe.mockRejectedValueOnce(new Error("db"));
    await expect(loadHome(context(sampleViewers.peserta), at("2027-01-05", "13:45"))).resolves.toMatchObject({ failed: false, card: null });
    read.shownSessions.mockRejectedValueOnce(new Error("db"));
    await expect(loadHome(context(sampleViewers.peserta), at("2027-01-05", "13:45"))).resolves.toMatchObject({ failed: true });
  });
});

describe("Agenda and Detail sesi", () => {
  it("a draft is not found; a published session has its panitia with a number", async () => {
    read.sessionById.mockResolvedValueOnce({ ...sampleSessions[9], status: "draf" });
    expect(await loadSession(context(sampleViewers.peserta), sampleSessions[9].id, at("2027-01-05", "10:05"))).toBeNull();
    const found = await loadSession(context(sampleViewers.peserta), sampleSessions[9].id, at("2027-01-05", "10:05"));
    expect(found?.contact).toMatchObject({ name: "Dimas", whatsapp: "https://wa.me/6280000000001" });
    expect(found?.denah).toEqual({ slug: "denah-venue" });
  });

  it("Agenda: the asked day", async () => {
    expect(await loadAgenda(context(sampleViewers.peserta), "3", at("2027-01-05", "10:05"))).toMatchObject({ day: 3, anyPublished: true });
  });
});

describe("Saya's loaders", () => {
  it("Kamar: only the contact for Bantuan kamar is read (no kelompok any more)", async () => {
    const data = await loadRoom(context(sampleViewers.peserta));
    expect(data).toEqual({ roomHelp: expect.anything() });
    expect(read.listGroups).not.toHaveBeenCalled();
    expect(read.activityGroups).not.toHaveBeenCalled();
  });

  it("Perjalanan: the person's own seats, the coordinators", async () => {
    const data = await loadTravel(context(sampleViewers.peserta));
    expect(read.seatsOf).toHaveBeenCalledWith(sampleViewers.peserta.id);
    expect(data.steps.berangkat).toHaveLength(4);
    expect(data.coordinators.berangkat).toMatchObject({ name: "Bima" });
  });

  it("Perjalanan: a Persiapan agenda is left out with module Ceklis off (as in Beranda and Agenda)", async () => {
    const prep = { ...sampleSession("kumpul"), startsAt: "2027-01-02T05:30:00+07:00", endsAt: null };
    const moved = { id: "log1", sessionId: prep.id, changes: [{ field: "startsAt" as const, from: "2027-01-02T05:45:00+07:00", to: prep.startsAt }], notified: false, recipients: 0, changedBy: null, changedAt: "2027-01-01T10:00:00+07:00" };
    const withPrep = () => { read.shownSessions.mockResolvedValueOnce({ data: [prep], migrated: true }); read.rundownLog.mockResolvedValueOnce({ data: [moved] as never[], migrated: true }); };
    withPrep();
    expect((await loadTravel(context(sampleViewers.peserta))).changed.berangkat).toBeDefined();
    withPrep();
    const off = sampleSettings().modules;
    expect((await loadTravel(context(sampleViewers.peserta, { modules: { ...off, ceklis: false } }))).changed.berangkat).toBeUndefined();
  });

  it("Akses MCP only for BOD", async () => {
    expect((await loadMe(context(sampleViewers.bod))).mcp).toBe(true);
    expect((await loadMe(context(sampleViewers.peserta))).mcp).toBe(false);
  });

  it("numbers only of the named contacts, in one query", async () => {
    const dimas = sampleViewers.panitia.id;
    const map = await contactsOf([{ id: dimas, role: "Panitia" }, { id: dimas, role: "Lain" }, { id: null, role: "x" }, { id: "not-an-id", role: "x" }]);
    expect(phoneQuery).toHaveBeenCalledTimes(1);
    expect(phoneQuery).toHaveBeenCalledWith([dimas]);
    expect([...map.values()]).toEqual([expect.objectContaining({ name: "Dimas", role: "Panitia", tel: "tel:+6280000000001" })]);
  });
});
