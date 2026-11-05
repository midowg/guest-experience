import { describe, expect, it } from "vitest";
import { durationLabel, durationsFrom, roomFitProblem, type Room } from "./appraisal";

const room = (id: string, capacity: number | null, minPeople: number | null, bookable = true): Room =>
  ({ id, slug: id, name: id, kind: "area", capacity, bookable, minPeople, planKey: null, facilities: [] });

describe("booking form steps", () => {
  it("names a length in hours and minutes", () => {
    expect(durationLabel(30)).toBe("30 mnt");
    expect(durationLabel(60)).toBe("1 jam");
    expect(durationLabel(90)).toBe("1 jam 30 mnt");
    expect(durationLabel(240)).toBe("4 jam");
  });

  it("offers half hours up to 4 hours, ending by 22.00", () => {
    expect(durationsFrom("09:00")).toEqual([30, 60, 90, 120, 150, 180, 210, 240]);
    expect(durationsFrom("20:30")).toEqual([30, 60, 90]);
    expect(durationsFrom("21:30")).toEqual([30]);
  });
});

describe("room fit on save", () => {
  const rooms = [room("Kecil", 4, null), room("Besar", 12, 4), room("Tutup", 10, null, false)];

  it("refuses a big room for a one-on-one and a small room for a team", () => {
    expect(roomFitProblem(rooms, { roomId: "Besar", participants: ["a"] }, "me"))
      .toEqual({ message: "Besar tidak cocok untuk 2 orang (one-on-one). Untuk minimal 4 orang.", reason: "Untuk minimal 4 orang" });
    expect(roomFitProblem(rooms, { roomId: "Kecil", participants: ["a", "b", "c", "d", "e"] }, "me")?.reason).toBe("Terlalu kecil: muat 4 orang");
    expect(roomFitProblem(rooms, { roomId: "Kecil", participants: ["a"] }, "me")).toBeNull();
    expect(roomFitProblem(rooms, { roomId: "Besar", participants: ["a", "b", "c"] }, "me")).toBeNull();
  });

  it("counts the booker once and each participant once", () => {
    // me + a + b = 3 people, so the big room (from 4) still refuses.
    expect(roomFitProblem(rooms, { roomId: "Besar", participants: ["me", "a", "a", "b"] }, "me")?.reason).toBe("Untuk minimal 4 orang");
  });

  it("leaves unknown and closed rooms to the database", () => {
    expect(roomFitProblem(rooms, { roomId: "Tutup", participants: [] }, "me")).toBeNull();
    expect(roomFitProblem(rooms, { roomId: "nope", participants: [] }, "me")).toBeNull();
  });
});
