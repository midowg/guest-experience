import { describe, expect, it } from "vitest";
import { AGENDA, agendaSession, byVotes, hintsOpen, initials, quizChoices, journeyPercent, missionsOf, missionStops, ROAD, roadPoint, scrambled, sentenceRight, SENTENCES, signalPair, SIGNALS } from "./mission";

describe("the road from the office to the villa (24 Nov 2026)", () => {
  it("puts the bus at the office, along the road, and at the villa", () => {
    expect(roadPoint(0)).toMatchObject({ x: ROAD.from[0], y: ROAD.from[1] });
    const end = roadPoint(100);
    expect(end.x).toBeCloseTo(ROAD.to[0], 0);
    expect(end.y).toBeCloseTo(ROAD.to[1], 0);
    expect(roadPoint(50).x).toBeGreaterThan(roadPoint(25).x);
  });
  it("moves a stretch per mission, waits before launch, and arrives on check-in", () => {
    expect(journeyPercent({ launched: false, done: 0, missions: 3, arrived: false })).toBe(0);
    expect(journeyPercent({ launched: true, done: 0, missions: 3, arrived: false })).toBe(8);
    expect(journeyPercent({ launched: true, done: 3, missions: 3, arrived: false })).toBe(88);
    expect(journeyPercent({ launched: true, done: 1, missions: 3, arrived: true })).toBe(100);
    expect(missionStops(3)).toEqual([35, 61, 88]);
  });
});

describe("Misi Perjalanan (prototype, 23 Nov 2026)", () => {
  it("scrambles every sentence so that each piece is there once, and checks the order", () => {
    for (const [number, pieces] of Object.entries(SENTENCES)) {
      const start = scrambled(Number(number));
      expect(start.slice().sort()).toEqual(pieces.map((_, at) => at));
      expect(sentenceRight(start, Number(number))).toBe(false);
      expect(sentenceRight(pieces.map((_, at) => at), Number(number))).toBe(true);
    }
    expect(sentenceRight([0, 1, 2], 6)).toBe(false);
  });

  it("gives missions by role: no message for BoD, no sentence without one", () => {
    expect(missionsOf({ role: "HoD", sentences: [6, 12] })).toEqual(["kal", "sig"]);
    expect(missionsOf({ role: "BoD", sentences: [1] })).toEqual(["kal", "sig"]);
    expect(missionsOf({ role: "HoD", sentences: [] })).toEqual(["sig"]);
  });

  it("shares the three room hints out over the missions, all once every mission is done", () => {
    expect([0, 1, 2].map(done => hintsOpen(done, 2))).toEqual([0, 2, 3]);
    expect([0, 1].map(done => hintsOpen(done, 1))).toEqual([0, 3]);
    expect(hintsOpen(3, 3)).toBe(3);
  });

  it("builds a roommate's quiz: them and two others of the same rooms' group, always in the same order", () => {
    const pool = [{ name: "Laki Satu", men: true }, { name: "Laki Dua", men: true }, { name: "Perempuan Satu", men: false }, { name: "Perempuan Dua", men: false }];
    const mate = { name: "Laki Kamar", men: true };
    const choices = quizChoices(mate, pool, person => person.men);
    expect(choices).toHaveLength(3);
    expect(choices).toContain(mate);
    expect(choices.filter(choice => choice !== mate).every(choice => choice.men)).toBe(true);
    expect(quizChoices(mate, pool, person => person.men)).toEqual(choices);
    // Another question (salt) may bring other names, never without the roommate.
    expect(quizChoices(mate, pool, person => person.men, "q1")).toContain(mate);
  });

  it("gives each person two different Future Signal questions, the same every time", () => {
    const pair = signalPair("0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11");
    expect(pair[0]).not.toBe(pair[1]);
    expect(signalPair("0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11")).toEqual(pair);
    expect(pair.every(index => index >= 0 && index < SIGNALS.length)).toBe(true);
  });

  it("finds a session of the rundown, sorts questions by support, and makes initials", () => {
    expect(agendaSession("s1")?.day).toBe("Selasa, 24 Nov · Arrival & Welcome");
    expect(agendaSession("s2")).toBeNull();
    expect(agendaSession("x")).toBeNull();
    expect(AGENDA.flatMap(day => day.items).filter(item => item.id)).toHaveLength(7);
    expect(byVotes([{ id: "a", votes: 1 }, { id: "b", votes: 3 }, { id: "c", votes: 1 }]).map(item => item.id)).toEqual(["b", "a", "c"]);
    expect(initials("Linda Susanto")).toBe("LS");
  });
});
