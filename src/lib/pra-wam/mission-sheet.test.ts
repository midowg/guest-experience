import { describe, expect, it } from "vitest";
import { asMissionSheet, missionSheetSchema, parseSentences } from "./mission-sheet";

/* Misi Perjalanan's room list as the admin page edits it (made-up people). */
const person = (name: string, room: string) => ({ name, nick: name.split(" ")[0], dept: "Dept", room, sleep: null, wake: null, sents: [6], hints: ["a"] });

describe("Misi Perjalanan: the room list", () => {
  it("takes a sound list", () => {
    expect(missionSheetSchema.safeParse({ rooms: { C1: "A3", R1: "B1" }, people: [person("Ani Satu", "C1"), person("Ina Dua", "R1")], bod: [{ name: "Bima Dir", sents: [1], ceo: true }] }).success).toBe(true);
  });

  it("refuses a person without a room, a name twice, and the same room number twice", () => {
    const messages = (value: unknown) => { const parsed = missionSheetSchema.safeParse(value); return parsed.success ? [] : parsed.error.issues.map(issue => issue.message); };
    expect(messages({ rooms: { C1: "A3" }, people: [person("Ani Satu", "X")], bod: [] }).join()).toMatch(/Kamar untuk Ani Satu/);
    expect(messages({ rooms: { C1: "A3" }, people: [person("Ani Satu", "C1")], bod: [{ name: " ani  satu ", sents: [] }] }).join()).toMatch(/dua kali/);
    expect(messages({ rooms: { C1: "A3", R1: "a3" }, people: [], bod: [] }).join()).toMatch(/nomor kamar yang sama/);
  });

  it("reads a stored list leniently and the sentences from text", () => {
    expect(asMissionSheet({ rooms: { C1: "A3", X: 5 }, people: [{ name: "Ani", room: "C1", sents: [6, 99, "x"], hints: ["a", 2] }], extra: true }))
      .toEqual({ rooms: { C1: "A3" }, people: [{ name: "Ani", nick: "", dept: "", room: "C1", sleep: null, wake: null, sents: [6], hints: ["a"] }], bod: [] });
    expect(asMissionSheet(null)).toEqual({ rooms: {}, people: [], bod: [] });
    expect(parseSentences("6, 12; 6 x 30")).toEqual([6, 12]);
  });
});
