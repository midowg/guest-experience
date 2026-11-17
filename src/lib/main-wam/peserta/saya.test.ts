import { describe, expect, it } from "vitest";
import { mainWamPath, praWamPath } from "@/lib/routes";
import {
  sampleActivityGroups, sampleGroup4, sampleGuides, sampleNotifications, samplePeopleList, sampleRoom3, sampleRoom5, sampleRoomBod, sampleSeats, sampleSessions,
  sampleSettings, sampleTrips, sampleViewers,
} from "../sample";
import type { MwNotification } from "../types";
import { contactLinks, phoneDigits } from "./contact";
import { dateLabel, dayTime, durationLabel, untilLabel } from "./format";
import { denahFor, fileShown, guideLine, paragraphs, shownGuides } from "./guides";
import { groupNotifications, noteHash, noteTarget } from "./notifications";
import { afterSignIn } from "./onboarding";
import { activityRows, memberRows, profileLine, roomRow, roomSub, roomWith, stayTime } from "./saya";
import { coordinatorOf, directionLabel, ticketOf, travelDirection, travelSteps } from "./travel";

/* Saya (P05/P05B), Kelompok & kamar (L01), Perjalanan (L03), Panduan (L04), Notifikasi (N01), Masuk (O02). */

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const rani = sampleViewers.peserta;

describe("Saya", () => {
  it("the profile line and the room row, whatever the room's size", () => {
    expect(profileLine(rani)).toBe("CoE · Kelompok 4 · Arjuno");
    expect(profileLine(sampleViewers.bod)).toBe("BOD");
    expect(roomRow(sampleRoom3)).toEqual({ title: "Kamar 208", sub: "3 orang · bersama Sari, Dewi" });
    expect(roomRow(sampleRoom5).sub).toBe("5 orang · bersama Gilang, Raka, dan 2 lainnya");
    expect(roomRow(sampleRoomBod)).toEqual({ title: "Kamar 101", sub: "Sendiri" });
    expect(roomWith({ people: [] })).toBe("Sendiri");
    expect(roomSub(sampleRoom3)).toBe("Lantai 2 · 3 orang");
    expect(roomSub({ ...sampleRoom3, floor: "" })).toBe("3 orang");
  });
});

describe("Kelompok & kamar", () => {
  const people = new Map(samplePeopleList().map(person => [person.id, person]));
  it("the coordinator first, then you, then the rest in Admin WAM's order", () => {
    const rows = memberRows(sampleGroup4, people, rani.id);
    expect(rows.slice(0, 5).map(row => row.label)).toEqual(["Fajar · Koordinator", "Rani (kamu)", "Sari", "Bima", "Ayu"]);
    expect(rows).toHaveLength(10);
    expect(memberRows(sampleGroup4, new Map(), rani.id)).toEqual([]);
  });

  it("the kelompok kegiatan in the order of their sessions, with the note in place of the place", () => {
    const rows = activityRows(sampleActivityGroups, sampleSessions);
    expect(rows.map(row => [row.title, row.sub])).toEqual([
      ["Team building · Pos 2", "Sel, 5 Jan · 15.00 · Lawn"],
      ["Trekking Coban Rondo · Angkot 3", "Rab, 6 Jan · kumpul lobby 05.45"],
      ["Gala Dinner & Awarding · Meja 7", "Rab, 6 Jan · 19.00 · Ballroom"],
    ]);
    expect(activityRows(sampleActivityGroups, sampleSessions.map(session => ({ ...session, status: "draf" as const })))).toEqual([]);
  });

  it("check-in and check-out", () => {
    expect(stayTime(sampleSettings().event.checkInAt)).toBe("Sen, 4 Jan · 15.30");
    expect(stayTime(null)).toBe("");
  });
});

describe("Perjalanan", () => {
  const seats = sampleSeats.filter(seat => seat.employeeId === rani.id);
  const event = sampleSettings().event;
  it("opens on the way there, and on the way back from the last day", () => {
    expect(travelDirection(undefined, at("2027-01-04", "05:05"), event)).toBe("berangkat");
    expect(travelDirection(undefined, at("2027-01-07", "08:00"), event)).toBe("pulang");
    expect(travelDirection("berangkat", at("2027-01-07", "08:00"), event)).toBe("berangkat");
    expect(directionLabel("berangkat", sampleTrips)).toBe("Berangkat · Sen, 4 Jan");
    expect(directionLabel("pulang", [])).toBe("Pulang");
  });

  it("the steps: kumpul, the ticket with coach and seat, the shuttle with the bus, arriving to the room", () => {
    const steps = travelSteps(sampleTrips, seats, "berangkat", "208");
    expect(steps.map(step => step.kind)).toEqual(["kumpul", "kereta", "bus", "tiba"]);
    expect(steps[0]).toMatchObject({ title: "Kumpul", line: "Stasiun Tugu Yogyakarta · pintu selatan", sub: "05.30", ticket: null });
    expect(steps[1].ticket).toEqual({
      from: "Yogyakarta", to: "Malang", depart: "06.30", arrive: "14.00", duration: "±7,5 jam", note: "Tunjukkan KTP saat naik kereta.",
      cols: [{ label: "Kereta", value: "KA (contoh)" }, { label: "Kelas", value: "Ekonomi" }, { label: "Gerbong", value: "3" }, { label: "Kursi", value: "12A" }],
    });
    expect(steps[2]).toMatchObject({ title: "Shuttle", line: "Bus 2 · St. Malang ke hotel", sub: "14.30" });
    expect(steps[3]).toMatchObject({ title: "Tiba di hotel", sub: "Check-in 15.30 · Kamar 208", toRoom: true });
    expect(travelSteps(sampleTrips, [], "berangkat", null)[3]).toMatchObject({ toRoom: false, sub: "Check-in 15.30" });
    expect(coordinatorOf(sampleTrips, "pulang")).toBe(sampleTrips[4].coordinatorId);
  });

  it("a ticket without a known seat shows what is written", () => {
    expect(ticketOf(sampleTrips[1], { tripId: sampleTrips[1].id, employeeId: rani.id, seat: "Bebas", vehicle: "" })?.cols.at(-1)).toEqual({ label: "Kursi", value: "Bebas" });
    expect(ticketOf(sampleTrips[0], undefined)).toBeNull();
  });
});

describe("Panduan", () => {
  it("lists the published guides in order, each with its first line", () => {
    const guides = shownGuides([...sampleGuides].reverse().concat({ ...sampleGuides[0], id: "x", slug: "draf", published: false }));
    expect(guides.map(guide => guide.slug)).toEqual(["denah-venue", "hotel", "dress-code", "tata-tertib"]);
    expect(guideLine(sampleGuides[1])).toBe("Sarapan 06.30–09.30 di Resto lantai 1.");
    expect(paragraphs("a\n\n b \nc")).toEqual(["a", "b", "c"]);
    expect(fileShown(sampleGuides[0].file)).toBe("gambar");
    expect(fileShown({ mime: "application/pdf", size: 1, version: "1" })).toBe("berkas");
    expect(fileShown(null)).toBeNull();
  });

  it("Denah: the session's own guide, else the first Denah, else none", () => {
    expect(denahFor({ mapGuideId: sampleGuides[1].id }, sampleGuides)?.slug).toBe("hotel");
    expect(denahFor({ mapGuideId: null }, sampleGuides)?.slug).toBe("denah-venue");
    expect(denahFor({ mapGuideId: null }, sampleGuides.slice(1))).toBeNull();
  });
});

describe("Notifikasi", () => {
  it("groups today and before, newest first, with the time or the day", () => {
    const { today, earlier } = groupNotifications(sampleNotifications, at("2027-01-05", "10:35"));
    expect(today.map(row => [row.title, row.time, row.unread])).toEqual([
      ["Team building mulai 15.00 di Lawn", "10.30", true], ["Jadwal berubah", "10.20", true], ["Momen", "10.08", true],
      ["Absen", "07.52", false], ["Jalan ke Aula Utama lewat lobby timur", "07.10", false],
    ]);
    expect(earlier.map(row => [row.title, row.time])).toEqual([["Kamar", "Sen, 4 Jan"]]);
    expect(today[0]).toMatchObject({ href: null, meta: "Pengumuman panitia · 10.30" });
    expect(earlier[0].meta).toBe("Kamar · Sen, 4 Jan · 15.10");
  });

  it("follows only addresses inside Main WAM", () => {
    expect(noteTarget(mainWamPath.session("abc"))).toBe(mainWamPath.session("abc"));
    expect(noteTarget(mainWamPath.home)).toBe(mainWamPath.home);
    for (const link of [null, "", "https://evil.example", "//evil.example/wam/acara", praWamPath.home, `${mainWamPath.home}x`, `${mainWamPath.home}/a b`]) expect(noteTarget(link)).toBeNull();
    const fromPra: MwNotification = { ...sampleNotifications[0], fromPraWam: true };
    expect(groupNotifications([fromPra], at("2027-01-05", "11:00")).today[0].meta).toBe("Pra WAM · 10.30");
    expect(noteHash("abc")).toBe("kabar-abc");
  });
});

describe("Masuk", () => {
  it("first time on a phone: Izin notifikasi; going somewhere: there; the first password: WAM's new-password page first", () => {
    expect(afterSignIn(undefined, { askNewPassword: false, onboarded: false })).toBe(mainWamPath.onboarding);
    expect(afterSignIn(mainWamPath.home, { askNewPassword: false, onboarded: true })).toBe(mainWamPath.home);
    expect(afterSignIn(mainWamPath.checkIn("tok"), { askNewPassword: false, onboarded: false })).toBe(mainWamPath.checkIn("tok"));
    expect(afterSignIn(undefined, { askNewPassword: true, onboarded: false })).toBe(praWamPath.newPassword(mainWamPath.onboarding));
    expect(afterSignIn("https://evil.example", { askNewPassword: false, onboarded: true })).toBe(mainWamPath.home);
    expect(afterSignIn(mainWamPath.login(), { askNewPassword: false, onboarded: true })).toBe(mainWamPath.home);
  });
});

describe("words and contacts", () => {
  it("say time the handbook's way", () => {
    expect(dateLabel("2027-01-05")).toBe("Sel, 5 Jan");
    expect(dayTime("2027-01-05T08:00:00+07:00")).toBe("Sel, 5 Jan · 08.00");
    const now = at("2027-01-05", "07:40");
    expect(untilLabel(now, "2027-01-05T07:40:30+07:00")).toBe("Sebentar lagi");
    expect(untilLabel(now, "2027-01-05T08:00:00+07:00")).toBe("20 menit lagi");
    expect(untilLabel(now, "2027-01-05T08:40:00+07:00")).toBe("1 jam lagi");
    expect(untilLabel(now, "2027-01-05T09:00:00+07:00")).toBe("1 jam 20 menit lagi");
    expect(untilLabel(now, "2027-01-06T06:00:00+07:00")).toBe("Besok 06.00");
    expect(untilLabel(now, "2027-01-07T06:00:00+07:00")).toBe("Kam, 7 Jan · 06.00");
    expect(untilLabel(now, "2027-01-05T07:00:00+07:00")).toBeNull();
    expect(durationLabel("2027-01-04T06:30:00+07:00", "2027-01-04T14:00:00+07:00")).toBe("±7,5 jam");
    expect(durationLabel("2027-01-04T06:30:00+07:00", "2027-01-04T07:15:00+07:00")).toBe("±45 menit");
  });

  it("turn a number into a call and a WhatsApp chat, or nothing", () => {
    expect(phoneDigits("0812-3456-7890")).toBe("6281234567890");
    expect(phoneDigits("+62 812 3456 7890")).toBe("6281234567890");
    expect(phoneDigits("812 3456 7890")).toBe("6281234567890");
    expect(phoneDigits("")).toBeNull();
    expect(phoneDigits("12")).toBeNull();
    expect(contactLinks("0812-3456-7890")).toEqual({ tel: "tel:+6281234567890", whatsapp: "https://wa.me/6281234567890" });
    expect(contactLinks(null)).toEqual({ tel: null, whatsapp: null });
  });
});
