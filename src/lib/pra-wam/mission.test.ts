import { describe, expect, it } from "vitest";
import { AGENDA, agendaSession, byVotes, initials, missionsOf, scrambled, sentenceRight, SENTENCES, signalPair, SIGNALS } from "./mission";

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
    expect(missionsOf({ role: "HoD", sentences: [6, 12] })).toEqual(["kal", "sig", "pes"]);
    expect(missionsOf({ role: "BoD", sentences: [1] })).toEqual(["kal", "sig"]);
    expect(missionsOf({ role: "CoS", sentences: [] })).toEqual(["sig", "pes"]);
  });

  it("gives each person two different Future Signal questions, the same every time", () => {
    const pair = signalPair("0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11");
    expect(pair[0]).not.toBe(pair[1]);
    expect(signalPair("0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11")).toEqual(pair);
    expect(pair.every(index => index >= 0 && index < SIGNALS.length)).toBe(true);
  });

  it("finds a session of the rundown, sorts questions by support, and makes initials", () => {
    expect(agendaSession("s1")?.day).toBe("Selasa, 24 Nov");
    expect(agendaSession("x")).toBeNull();
    expect(AGENDA.flatMap(day => day.items).filter(item => item.id)).toHaveLength(8);
    expect(byVotes([{ id: "a", votes: 1 }, { id: "b", votes: 3 }, { id: "c", votes: 1 }]).map(item => item.id)).toEqual(["b", "a", "c"]);
    expect(initials("Linda Susanto")).toBe("LS");
  });
});
