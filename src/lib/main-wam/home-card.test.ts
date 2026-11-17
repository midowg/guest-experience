import { describe, expect, it } from "vitest";
import { HOME_CARD_ORDER, pickHomeCard, type HomeCardCandidate } from "./home-card";
import { DEFAULT_MODULES } from "./settings";

const now = new Date("2027-01-05T13:45:00+07:00");
const on = { ...DEFAULT_MODULES, silent: true, voting: true, survei: true };
const pengumuman: HomeCardCandidate = { kind: "pengumuman", id: "a1", title: "Team building mulai 15.00 di Lawn", body: "Pakai kaos tim.", pinnedUntil: "2027-01-05T15:00:00+07:00" };
const silent: HomeCardCandidate = { kind: "silent", questionId: "q1", sessionId: "s1", closesAt: "2027-01-05T15:00:00+07:00" };
const voting: HomeCardCandidate = { kind: "voting", categoryId: "c1", title: "Rekan paling suportif", closesAt: "2027-01-06T15:00:00+07:00" };
const berangkat: HomeCardCandidate = { kind: "berangkat", direction: "berangkat", tripId: "t1", title: "Kereta ke Malang", startsAt: "2027-01-04T06:30:00+07:00", seat: "Gerbong 3 · Kursi 12A" };
const survei: HomeCardCandidate = { kind: "survei", formSlug: "survei-wam", title: "Survei evaluasi" };

describe("Beranda's one contextual card", () => {
  it("follows the order: pengumuman penting, Silent Meeting, voting, hari berangkat, survei", () => {
    expect(HOME_CARD_ORDER).toEqual(["pengumuman", "silent", "voting", "berangkat", "survei"]);
    const all = [survei, berangkat, voting, silent, pengumuman];
    expect(pickHomeCard(all, on, now)).toBe(pengumuman);
    expect(pickHomeCard([survei, berangkat, voting, silent], on, now)).toBe(silent);
    expect(pickHomeCard([survei, berangkat, voting], on, now)).toBe(voting);
    expect(pickHomeCard([survei, berangkat], on, now)).toBe(berangkat);
    expect(pickHomeCard([survei], on, now)).toBe(survei);
    expect(pickHomeCard([], on, now)).toBeNull();
  });

  it("leaves no trace of a module that is off", () => {
    expect(pickHomeCard([silent, voting, survei], DEFAULT_MODULES, now)).toBeNull();
    expect(pickHomeCard([silent, voting, berangkat], { ...DEFAULT_MODULES, voting: true }, now)).toBe(voting);
    // Pengumuman and hari berangkat are the handbook's own: never behind a module.
    expect(pickHomeCard([berangkat], DEFAULT_MODULES, now)).toBe(berangkat);
    expect(pickHomeCard([pengumuman], DEFAULT_MODULES, now)).toBe(pengumuman);
  });

  it("drops an announcement whose pin has run out", () => {
    const expired = { ...pengumuman, pinnedUntil: "2027-01-05T13:00:00+07:00" };
    expect(pickHomeCard([expired, silent], on, now)).toBe(silent);
  });

  it("keeps the server's order within a kind (the newest pinned first)", () => {
    const newer = { ...pengumuman, id: "a2", title: "Baru" };
    expect(pickHomeCard([newer, pengumuman], on, now)).toBe(newer);
  });
});
