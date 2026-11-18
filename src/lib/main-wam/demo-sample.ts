import { effectiveModules, shiftSample, sampleShiftDays } from "./demo";
import { samplePeople, sampleSessions, sampleSettings, sampleViewers } from "./sample";
import type { DemoRole, MainWamSettings, MainWamViewer, MwAttendance } from "./types";

/*
 * Mode demo's sample data, drawn from sample.ts (the prototype's WAM 2026: made-up names, the four-day
 * rundown) and moved to today (shiftSample), so the app shows a real "now". Server only: sample.ts is
 * big, and nothing of it reaches a phone unless Mode demo is on. Pure.
 */

/** The sample moved so its second day is today. */
export const demoShift = (now: Date) => sampleShiftDays(now);
export const demoSample = <T>(value: T, now = new Date()): T => shiftSample(value, demoShift(now));

/** Sample bills for Jejak karbon (about a 120-person, four-day event). */
const SAMPLE_CARBON = { listrikKwh: 4200, airM3: 380, lpgKg: 120, sampahKg: 310, final: false };

/**
 * The settings as Mode demo draws them: every module on (Silent Meeting as saved), kelompok published,
 * and where the real settings are empty the sample's facts (hotel, contacts, bills). With `sampleRundown`
 * the event's dates follow the sample rundown, moved to today. The saved row is never rewritten.
 */
export function settingsForDemo(saved: MainWamSettings, sampleRundown: boolean, now = new Date()): MainWamSettings {
  const sample = demoSample(sampleSettings(), now);
  const event = sampleRundown
    ? { ...saved.event, startDate: sample.event.startDate, endDate: sample.event.endDate, checkInAt: saved.event.checkInAt ?? sample.event.checkInAt, checkOutAt: saved.event.checkOutAt ?? sample.event.checkOutAt }
    : saved.event;
  const bills = saved.carbon;
  const hasBills = bills.listrikKwh !== null || bills.airM3 !== null || bills.lpgKg !== null || bills.sampahKg !== null;
  return {
    ...saved,
    modules: effectiveModules(saved.modules, true),
    groupsPublished: true,
    sampleRundown,
    event: { ...event, hotel: saved.event.hotel || sample.event.hotel, address: saved.event.address || sample.event.address },
    contacts: {
      kamar: saved.contacts.kamar ?? sample.contacts.kamar, perjalanan: saved.contacts.perjalanan ?? sample.contacts.perjalanan, umum: saved.contacts.umum ?? sample.contacts.umum,
    },
    carbon: hasBills ? bills : SAMPLE_CARBON,
    moduleConfig: { ...saved.moduleConfig, survei: { formSlug: saved.moduleConfig.survei.formSlug ?? sample.moduleConfig.survei.formSlug } },
  };
}

/** The group and room a sample person of this role has, for a viewer who has none of their own. */
export const demoViewerPart = (role: DemoRole): Pick<MainWamViewer, "group" | "room"> => {
  const sample = sampleViewers[role];
  return { group: sample.group, room: sample.room };
};

/**
 * Who checked in at a sample session: most of the sample's people (not BOD), a different share per session
 * (70–95%), mostly by QR a few minutes before it starts, some recorded by panitia. Deterministic, so a
 * screen and the numbers around it agree.
 */
export function samplePresence(sessionId: string, now = new Date()): MwAttendance[] {
  const index = sampleSessions.findIndex(session => session.id === sessionId);
  if (index < 0) return [];
  const start = Date.parse(demoSample(sampleSessions[index], now).startsAt);
  const attendees = demoAttendeeIds();
  const count = Math.round((attendees.length * (70 + ((index * 11) % 26))) / 100);
  const recorder = samplePeople.dimas.id;
  return attendees.slice(0, count).map((employeeId, position) => {
    const manual = position % 9 === 8;
    return { sessionId, employeeId, checkedInAt: new Date(start + (-10 + (position % 12)) * 60_000).toISOString(), method: manual ? "manual" : "qr", recordedBy: manual ? recorder : null } as MwAttendance;
  });
}

/** The sample's people who check in (everyone but BOD), by id. */
export const demoAttendeeIds = (): string[] => Object.values(samplePeople).filter(person => person.department !== "BOD").map(person => person.id).sort();

/** Does this id belong to a sample row (sample.ts uid())? Real ids never start like this. */
export const isSampleId = (id: string): boolean => id.startsWith("00000000-0000-4000-8");
