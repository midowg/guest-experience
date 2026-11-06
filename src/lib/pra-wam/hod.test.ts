import { describe, expect, it } from "vitest";
import { hodMeetingSchema, hodTimes, sortMeetings, statusFromAnswers, type HodMeeting } from "./hod";

const meeting = (id: string, patch: Partial<HodMeeting> = {}): HodMeeting => ({
  id, title: id, agenda: "", startsAt: "2026-11-10T03:00:00Z", endsAt: "2026-11-10T04:00:00Z", place: "", status: "menunggu", createdAt: "2026-11-06T00:00:00Z",
  requester: { id: "a", name: "Ana", unit: "HC" }, invites: [{ id: "me", name: "Saya", unit: "IT", response: "menunggu", note: "", respondedAt: null }], ...patch,
});

describe("Meeting HOD", () => {
  it("is scheduled once everyone accepts, declined once one declines", () => {
    expect(statusFromAnswers(["terima", "terima"])).toBe("terjadwal");
    expect(statusFromAnswers(["terima", "menunggu"])).toBe("menunggu");
    expect(statusFromAnswers(["terima", "tolak", "menunggu"])).toBe("ditolak");
    expect(statusFromAnswers([])).toBe("menunggu");
  });

  it("puts what waits for my answer first, then what is coming, then the rest", () => {
    const now = new Date("2026-11-06T00:00:00Z");
    const mineToAnswer = meeting("m1");
    const answered = meeting("m2", { invites: [{ id: "me", name: "Saya", unit: "IT", response: "terima", note: "", respondedAt: "x" }] });
    const scheduled = meeting("m3", { status: "terjadwal", startsAt: "2026-11-08T03:00:00Z", endsAt: "2026-11-08T04:00:00Z" });
    const past = meeting("m4", { status: "terjadwal", startsAt: "2026-11-01T03:00:00Z", endsAt: "2026-11-01T04:00:00Z" });
    const cancelled = meeting("m5", { status: "batal" });
    const { toAnswer, upcoming, history } = sortMeetings([mineToAnswer, answered, scheduled, past, cancelled], "me", now);
    expect(toAnswer.map(item => item.id)).toEqual(["m1"]);
    expect(upcoming.map(item => item.id)).toEqual(["m3", "m2"]);
    expect(history.map(item => item.id)).toEqual(["m5", "m4"]);
  });

  it("asks for a title, a department and an end after the start", () => {
    const base = { title: "Sinkronisasi", date: "2026-11-10", start: "10:00", end: "11:00", unitIds: ["0b7c2d1e-0000-4000-8000-000000000001"] };
    expect(hodMeetingSchema.safeParse(base).success).toBe(true);
    expect(hodMeetingSchema.safeParse({ ...base, unitIds: [] }).success).toBe(false);
    expect(hodMeetingSchema.safeParse({ ...base, end: "09:30" }).success).toBe(false);
    expect(hodTimes[0]).toBe("07:00");
    expect(hodTimes.at(-1)).toBe("22:00");
  });
});
