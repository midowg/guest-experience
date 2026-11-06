import { describe, expect, it } from "vitest";
import { hodUnitsSchema, statusFromAnswers } from "./hod";

describe("Meeting HOD", () => {
  it("is scheduled once everyone accepts, declined once one declines", () => {
    expect(statusFromAnswers(["terima", "terima"])).toBe("terjadwal");
    expect(statusFromAnswers(["terima", "menunggu"])).toBe("menunggu");
    expect(statusFromAnswers(["terima", "tolak", "menunggu"])).toBe("ditolak");
    expect(statusFromAnswers([])).toBe("menunggu");
  });

  it("takes the departments picked with a booking, none by default", () => {
    expect(hodUnitsSchema.parse({}).hodUnits).toEqual([]);
    expect(hodUnitsSchema.parse({ hodUnits: ["Center of Excellence"] }).hodUnits).toEqual(["Center of Excellence"]);
  });
});
