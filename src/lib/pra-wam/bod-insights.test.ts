import { describe, expect, it } from "vitest";
import { adoptionBy, checkInMix, daysUntil, officeDaysAround, roomUse } from "./bod";

describe("BOD summary, the wider picture", () => {
  it("takes Monday to Friday of last, this and next week", () => {
    const days = officeDaysAround("2026-11-26"); // a Thursday
    expect(days).toHaveLength(15);
    expect(days[0]).toBe("2026-11-16");
    expect(days[5]).toBe("2026-11-23");
    expect(days[14]).toBe("2026-12-04");
    // A Sunday belongs to the week that ends on it.
    expect(officeDaysAround("2026-11-29")[5]).toBe("2026-11-23");
  });

  it("counts room use per day and per room, outside bookings apart", () => {
    const dateOf = (iso: string) => iso.slice(0, 10);
    const uses = [
      { roomId: "r1", startsAt: "2026-11-23T02:00:00Z", endsAt: "2026-11-23T03:30:00Z" },
      { roomId: "r1", startsAt: "2026-11-23T05:00:00Z", endsAt: "2026-11-23T06:00:00Z", isSession: true },
      { roomId: "r2", startsAt: "2026-11-24T02:00:00Z", endsAt: "2026-11-24T04:00:00Z" },
      { roomId: "luar", startsAt: "2026-11-24T11:00:00Z", endsAt: "2026-11-24T15:00:00Z" },
    ];
    const use = roomUse(uses, [{ id: "r1", name: "Antareja" }, { id: "r2", name: "Vasuki" }, { id: "r3", name: "Kosong" }], ["2026-11-23", "2026-11-24"], dateOf, "luar");
    expect(use.days).toEqual([
      { date: "2026-11-23", bookings: 1, sessions: 1, hours: 2.5 },
      { date: "2026-11-24", bookings: 1, sessions: 0, hours: 2 },
    ]);
    expect(use.rooms.map(room => [room.name, room.hours])).toEqual([["Antareja", 2.5], ["Vasuki", 2]]);
    expect(use).toMatchObject({ outside: 1, total: 3, hours: 4.5 });
  });

  it("names every check-in way in a fixed order, an old row without a method as QR", () => {
    expect(checkInMix(["offline", "qr", null, "online", "qr"])).toEqual([
      { way: "qr", count: 3 }, { way: "offline", count: 1 }, { way: "online", count: 1 }, { way: "manual", count: 0 },
    ]);
  });

  it("lists the departments that use the app least first", () => {
    const accounts = new Map([["a", { signedIn: true }], ["b", { signedIn: false }], ["c", { signedIn: true }]]);
    const rows = adoptionBy([{ name: "Finance", members: ["a"] }, { name: "Sales", members: ["b", "c", "d"] }, { name: "Kosong", members: [] }], accounts);
    expect(rows).toEqual([
      { name: "Sales", people: 3, accounts: 2, signedIn: 1 },
      { name: "Finance", people: 1, accounts: 1, signedIn: 1 },
    ]);
  });

  it("counts the days to a date", () => {
    expect(daysUntil("2026-11-26", "2027-01-04")).toBe(39);
    expect(daysUntil("2026-11-26", "2026-11-26")).toBe(0);
  });
});
