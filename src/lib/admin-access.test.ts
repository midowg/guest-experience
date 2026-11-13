import { describe, expect, it } from "vitest";
import { areaOfPath, grantEventsLabel, mayOpenArea, mayOpenEvent, tidyGrant, type AdminGrant } from "./admin-access";

const grant = (patch: Partial<AdminGrant> = {}): AdminGrant => ({ employeeId: "e1", apps: [], allEvents: false, eventIds: [], ...patch });
const event = (patch: Partial<{ id: string; kind: string; hidden: boolean; picStaffId: string }> = {}) => ({ id: "ev1", kind: "acara", hidden: false, picStaffId: "", ...patch });

describe("areaOfPath", () => {
  it("places every admin page and API in its app", () => {
    expect(areaOfPath("/admin")).toBe("home");
    expect(areaOfPath("/admin/super/tim")).toBe("super");
    expect(areaOfPath("/admin/akses")).toBe("super");
    expect(areaOfPath("/admin/wam/akun")).toBe("wam");
    expect(areaOfPath("/admin/wam/tv")).toBe("tv");
    expect(areaOfPath("/admin/tv/layar")).toBe("tv");
    expect(areaOfPath("/api/admin/wam/tv/screens")).toBe("tv");
    expect(areaOfPath("/api/admin/wam/accounts")).toBe("wam");
    expect(areaOfPath("/admin/friday-sharing/donasi")).toBe("friday_sharing");
    expect(areaOfPath("/admin/your-visit")).toBe("your_visit");
    expect(areaOfPath("/admin/acara/abc/rsvp")).toBe("events");
    expect(areaOfPath("/api/admin/events/abc")).toBe("events");
    expect(areaOfPath("/api/admin/employees")).toBe("super");
    expect(areaOfPath("/api/admin/grants/abc")).toBe("super");
  });
  it("does not know other paths, or none", () => {
    expect(areaOfPath("/admin/wamx")).toBeNull();
    expect(areaOfPath("/api/admin/somethingnew")).toBeNull();
    expect(areaOfPath(null)).toBeNull();
  });
});

describe("mayOpenArea", () => {
  it("opens home and events to every admin, an app only with its grant, super and unknown never", () => {
    const wam = grant({ apps: ["wam"] });
    expect(mayOpenArea(grant(), "home")).toBe(true);
    expect(mayOpenArea(grant(), "events")).toBe(true);
    expect(mayOpenArea(wam, "wam")).toBe(true);
    expect(mayOpenArea(wam, "tv")).toBe(false);
    expect(mayOpenArea(grant({ apps: ["acara", "friday_sharing", "your_visit", "wam", "tv"] }), "super")).toBe(false);
    expect(mayOpenArea(wam, null)).toBe(false);
  });
});

describe("mayOpenEvent", () => {
  const none = new Set<string>();
  it("opens their own events as PIC, and picked events, whatever the apps", () => {
    expect(mayOpenEvent(grant(), new Set(["s1"]), event({ picStaffId: "s1" }))).toBe(true);
    expect(mayOpenEvent(grant({ eventIds: ["ev1"] }), none, event({ hidden: true }))).toBe(true);
  });
  it("opens the rest by app: Acara needs every event; Friday Sharing and Your Visit their kind", () => {
    expect(mayOpenEvent(grant({ apps: ["acara"] }), none, event())).toBe(false);
    expect(mayOpenEvent(grant({ apps: ["acara"], allEvents: true }), none, event())).toBe(true);
    expect(mayOpenEvent(grant({ apps: ["acara"], allEvents: true }), none, event({ kind: "csr" }))).toBe(false);
    expect(mayOpenEvent(grant({ apps: ["friday_sharing"] }), none, event({ kind: "csr" }))).toBe(true);
    expect(mayOpenEvent(grant({ apps: ["your_visit"] }), none, event({ kind: "panduan" }))).toBe(true);
  });
  it("keeps an event the super admin hid closed unless it is theirs or picked", () => {
    expect(mayOpenEvent(grant({ apps: ["acara"], allEvents: true }), none, event({ hidden: true }))).toBe(false);
  });
});

describe("tidyGrant", () => {
  it("orders the apps, and without Acara there is no every-event", () => {
    expect(tidyGrant({ apps: ["tv", "acara", "tv"], allEvents: true, eventIds: ["a", "a"] })).toEqual({ apps: ["acara", "tv"], allEvents: true, eventIds: [] });
    expect(tidyGrant({ apps: ["wam"], allEvents: true, eventIds: ["a", "a"] })).toEqual({ apps: ["wam"], allEvents: false, eventIds: ["a"] });
  });
  it("says the events part in words", () => {
    expect(grantEventsLabel({ apps: ["acara"], allEvents: true, eventIds: [] })).toBe("Semua acara");
    expect(grantEventsLabel({ apps: ["acara"], allEvents: false, eventIds: ["a", "b"] })).toBe("2 acara dipilih");
    expect(grantEventsLabel({ apps: ["acara"], allEvents: false, eventIds: [] })).toBe("Hanya acara PIC-nya");
    expect(grantEventsLabel({ apps: ["wam"], allEvents: false, eventIds: [] })).toBe("—");
  });
});
