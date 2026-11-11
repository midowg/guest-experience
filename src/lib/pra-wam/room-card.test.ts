import { describe, expect, it } from "vitest";
import { wibInstant, type Booking, type Room } from "./appraisal";
import { roomCard, roomCards, whoLabel } from "./room-card";

const room = (patch: Partial<Room> = {}): Room => ({ id: "cfc", slug: "cfc", name: "CFC Ananta Room", kind: "utama", capacity: 4, bookable: true, minPeople: null, planKey: null, facilities: [], ...patch });
const booking = (id: string, start: string, end: string, patch: Partial<Booking> = {}): Booking => ({
  id, roomId: "cfc", title: id, description: "", startsAt: wibInstant("2026-11-11", start), endsAt: wibInstant("2026-11-11", end),
  bookedBy: { id: "p1", name: "Sofyan", department: "ACS" }, participants: null, others: 3, ...patch,
});
const at = (time: string, date = "2026-11-11") => new Date(wibInstant(date, time));

describe("Timeline's room cards", () => {
  it("leaves the free hours of a coming day, draws each booking as a block, and lists them with who booked", () => {
    const card = roomCard(room(), [booking("Meeting RAB WAM 2027", "13:00", "15:00", { bookedBy: { id: "p2", name: "Hanung", department: "" }, others: 4 }), booking("Meeting ACS", "09:00", "10:30")], "2026-11-11", at("06:00"));
    // 07.00–22.00 is 15 hours; 3.5 taken.
    expect(card.left).toBe("Sisa 11 jam 30 mnt");
    expect(card.items.map(item => [item.title, item.time, item.who])).toEqual([["Meeting ACS", "09.00–10.30", "Sofyan +3"], ["Meeting RAB WAM 2027", "13.00–15.00", "Hanung +4"]]);
    expect(card.blocks.map(block => Math.round(block.share * 900))).toEqual([90, 120]);
    expect(Math.round(card.free * 900)).toBe(690);
  });

  it("counts only what is left of today, and none of a day gone", () => {
    expect(roomCard(room(), [booking("A", "13:00", "15:00")], "2026-11-11", at("12:00")).left).toBe("Sisa 8 jam");
    expect(roomCard(room(), [booking("A", "07:00", "22:00")], "2026-11-11", at("06:00")).left).toBe("Penuh");
    expect(roomCard(room(), [], "2026-11-10", at("12:00")).left).toBe("Sudah lewat");
    expect(roomCard(room(), [], "2026-11-14", at("12:00")).left).toBe("Tutup akhir pekan");
    expect(roomCard(room({ bookable: false }), [], "2026-11-12", at("12:00")).left).toBe("Tidak bisa dibooking");
  });

  it("shows every bookable room and any other one holding something; panitia's sessions say Panitia", () => {
    const cards = roomCards([room(), room({ id: "pantry", name: "Pantry", bookable: false }), room({ id: "lim", name: "Limasan", bookable: false })],
      [booking("Forum", "09:00", "10:00", { roomId: "lim", isSession: true })], "2026-11-11", at("06:00"));
    expect(cards.map(card => card.room.name)).toEqual(["CFC Ananta Room", "Limasan"]);
    expect(cards[1].items[0].who).toBe("Panitia");
    expect(whoLabel({ bookedBy: { id: "x", name: "Raja", department: "" }, others: 0 })).toBe("Raja");
  });
});
