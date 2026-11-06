import { describe, expect, it } from "vitest";
import { headcount, isOver, largestCapacity, peopleLabel, roomFit } from "./room-fit";

const room = (capacity: number | null, minPeople: number | null, bookable = true) => ({ capacity, minPeople, bookable });

describe("room fit", () => {
  it("counts the booker with the participants", () => {
    expect(headcount(0)).toBe(1);
    expect(headcount(1)).toBe(2);
    expect(headcount(5)).toBe(6);
  });

  it("keeps a one-on-one out of the big room and a team out of the small one", () => {
    const small = room(4, 1), big = room(12, 4);
    expect(roomFit(small, 2)).toEqual({ ok: true, note: "Muat 4 orang" });
    expect(roomFit(big, 2)).toEqual({ ok: false, reason: "besar", text: "Untuk minimal 4 orang" });
    expect(roomFit(small, 6)).toEqual({ ok: false, reason: "kecil", text: "Terlalu kecil: muat 4 orang" });
    expect(roomFit(big, 6).ok).toBe(true);
    expect(roomFit(big, 12).ok).toBe(true);
    expect(roomFit(big, 13).ok).toBe(false);
  });

  it("allows a room not filled in yet, with a note, and never a closed one", () => {
    expect(roomFit(room(null, null), 8)).toEqual({ ok: true, note: "Kapasitas belum diisi" });
    expect(roomFit(room(10, null, false), 2)).toEqual({ ok: false, reason: "tutup", text: "Tidak bisa dibooking" });
  });

  it("names a pair a one-on-one", () => {
    expect(peopleLabel(2)).toBe("2 orang (one-on-one)");
    expect(peopleLabel(6)).toBe("6 orang");
  });
  it("lets only the largest room go over its capacity, flagged for a yes", () => {
    const big = { bookable: true, capacity: 50, minPeople: 20 };
    const small = { bookable: true, capacity: 30, minPeople: 10 };
    const largest = largestCapacity([big, small, { bookable: false, capacity: 80 }]);
    expect(largest).toBe(50);
    expect(roomFit(big, 57, largest)).toEqual({ ok: true, over: true, note: "Melebihi kapasitas 50 orang" });
    expect(isOver(roomFit(big, 57, largest))).toBe(true);
    expect(isOver(roomFit(big, 40, largest))).toBe(false);
    expect(roomFit(small, 57, largest)).toMatchObject({ ok: false, reason: "kecil" });
    expect(roomFit(big, 57)).toMatchObject({ ok: false, reason: "kecil" });
  });
});
