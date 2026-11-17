import { describe, expect, it } from "vitest";
import { athleteName, scopeOk, sportCodeFor, stravaRow } from "./strava";

const settings = { maxKcal: 3000, maxSteps: 30000 };

describe("Strava rules (18 Nov 2026)", () => {
  it("needs the permission to read activities", () => {
    expect(scopeOk("read,activity:read_all")).toBe(true);
    expect(scopeOk("read activity:read")).toBe(true);
    expect(scopeOk("read")).toBe(false);
    expect(scopeOk("read,activity:write")).toBe(false);
    expect(scopeOk(null)).toBe(false);
  });

  it("maps Strava's sports to the catalogue, Olahraga lain for the rest or a switched-off one", () => {
    const active = new Set(["sport.running", "sport.cycling", "sport.mountain_bike", "sport.other"]);
    expect(sportCodeFor("Run", active)).toBe("sport.running");
    expect(sportCodeFor("VirtualRun", active)).toBe("sport.running");
    expect(sportCodeFor("GravelRide", active)).toBe("sport.cycling");
    expect(sportCodeFor("MountainBikeRide", active)).toBe("sport.mountain_bike");
    // Swimming is not active here; Kitesurf is not mapped at all.
    expect(sportCodeFor("Swim", active)).toBe("sport.other");
    expect(sportCodeFor("Kitesurf", active)).toBe("sport.other");
    expect(sportCodeFor(undefined, new Set(["sport.running"]))).toBe("sport.running");
    expect(sportCodeFor("Run", new Set())).toBeNull();
  });

  it("keeps the local day and time, the name, and counts calories 1:1 up to the cap", () => {
    expect(stravaRow({ id: 1, name: " Morning Run ", start_date_local: "2026-11-18T06:05:00Z", moving_time: 1690, distance: 5230.4, calories: 412.6 }, settings))
      .toEqual({ happened_on: "2026-11-18", happened_time: "06:05", title: "Morning Run", kcal: 413, minutes: 28, distance_m: 5230, points: 413 });
    // No calories on Strava: in, with 0 points; a long ride stops at the daily cap.
    expect(stravaRow({ id: 2, start_date_local: "2026-11-18T18:00:00Z", elapsed_time: 600 }, settings)).toMatchObject({ kcal: null, minutes: 10, points: 0, title: "" });
    expect(stravaRow({ id: 3, start_date_local: "2026-11-18T05:00:00Z", calories: 4200 }, settings).points).toBe(3000);
  });

  it("names the athlete as Strava shows them", () => {
    expect(athleteName({ firstname: "Dewi", lastname: "C." })).toBe("Dewi C.");
    expect(athleteName({ firstname: " Bima " })).toBe("Bima");
    expect(athleteName(null)).toBe("");
  });
});
