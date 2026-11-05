import { describe, expect, it } from "vitest";
import { blocked, MINDS_SMOKE, pairScore, parseRoomLines, roomNotes, SMOKER, stayPerson, suggestRooms, type StayPerson } from "./stay";

const person = (id: string, extra: Partial<StayPerson> = {}): StayPerson => ({
  id, name: `${id.toUpperCase()} Orang`, department: "Comms", gender: "Perempuan",
  sleep: "22.00–24.00", wake: "05.00–06.30", ac: "Sedang", smoke: "Tidak merokok, tidak keberatan", departmentWish: "Siapa saja boleh",
  habits: [], wants: [], ...extra,
});

describe("reading the stay answers", () => {
  it("takes the answers by their fixed keys and drops the habits that say nothing", () => {
    const read = stayPerson({ id: "p1", name: "Ayu", department: "Comms" }, { 33: "Perempuan", 7: "Sebelum 22.00", 9: ["Mendengkur", "Tidak ada"], 13: ["p2"], 10: "" });
    expect(read).toMatchObject({ gender: "Perempuan", sleep: "Sebelum 22.00", habits: ["Mendengkur"], wants: ["p2"], ac: null, wake: null });
  });
});

describe("two people in one room", () => {
  it("never pairs different room groups, or a smoker with someone who minds", () => {
    expect(blocked(person("a"), person("b", { gender: "Laki-laki" }))).toContain("berbeda isian pembagian kamar");
    expect(blocked(person("a", { smoke: SMOKER }), person("b", { smoke: MINDS_SMOKE }))).toContain("A merokok, B keberatan");
    expect(blocked(person("a", { smoke: SMOKER }), person("b"))).toBeNull();
    expect(pairScore(person("a"), person("b", { gender: "Laki-laki" })).score).toBeLessThan(-50);
  });
  it("counts named roommates, both ways more, and notes what clashes", () => {
    const plain = pairScore(person("a"), person("b")).score;
    const oneWay = pairScore(person("a", { wants: ["b"] }), person("b")).score;
    const both = pairScore(person("a", { wants: ["b"] }), person("b", { wants: ["a"] })).score;
    expect(oneWay).toBeGreaterThan(plain);
    expect(both).toBeGreaterThan(oneWay + 6);
    const clash = pairScore(person("a", { sleep: "Sebelum 22.00", ac: "Dingin sekali", habits: ["Mendengkur"] }), person("b", { sleep: "Lewat tengah malam", ac: "Tidak terlalu dingin", habits: ["Gampang terbangun"] }));
    expect(clash.score).toBeLessThan(plain);
    expect(clash.notes).toEqual([
      "Jam tidur jauh berbeda: A Sebelum 22.00, B Lewat tengah malam.",
      "AC: A dingin sekali, B tidak terlalu dingin.",
      "A mendengkur, B gampang terbangun.",
    ]);
  });
  it("follows the department wish", () => {
    const same = person("a", { departmentWish: "Lebih nyaman satu departemen" });
    expect(pairScore(same, person("b")).score).toBeGreaterThan(pairScore(same, person("c", { department: "Finance" })).score);
    const other = person("a", { departmentWish: "Beda departemen, biar kenal" });
    expect(pairScore(other, person("c", { department: "Finance" })).score).toBeGreaterThan(pairScore(other, person("b")).score);
  });
  it("lists blocks apart from notes, and who has not answered", () => {
    const notes = roomNotes([person("a", { smoke: SMOKER }), person("b", { smoke: MINDS_SMOKE }), person("c", { gender: null })]);
    expect(notes.blocked).toEqual(["A merokok, B keberatan dengan rokok."]);
    expect(notes.notes).toContain("C belum mengisi bagian menginap.");
  });
});

describe("the automatic suggestion", () => {
  it("keeps who is placed, fills same-group rooms first, and puts named pairs together", () => {
    const people = [
      person("w1"), person("w2", { wants: ["w4"] }), person("w3"), person("w4", { wants: ["w2"] }),
      person("m1", { gender: "Laki-laki" }), person("m2", { gender: "Laki-laki" }), person("m3", { gender: "Laki-laki" }),
      person("x", { gender: null }),
    ];
    const plan = suggestRooms(people, [
      { id: "r1", name: "101", capacity: 2, members: ["m1"] },
      { id: "r2", name: "102", capacity: 2, members: [] },
      { id: "r3", name: "103", capacity: 2, members: [] },
      { id: "r4", name: "104", capacity: 3, members: [] },
    ]);
    const roomOf = new Map(plan.map(item => [item.employeeId, item.roomId]));
    expect(roomOf.has("m1")).toBe(false);
    expect(["m2", "m3"]).toContain([...roomOf].find(([, room]) => room === "r1")?.[0]);
    expect(roomOf.get("w2")).toBe(roomOf.get("w4"));
    expect(roomOf.has("x")).toBe(false);
    for (const room of ["r1", "r2", "r3", "r4"]) {
      const genders = new Set(plan.filter(item => item.roomId === room).map(item => people.find(p => p.id === item.employeeId)!.gender).concat(room === "r1" ? ["Laki-laki"] : []));
      expect(genders.size).toBeLessThanOrEqual(1);
    }
    expect(plan).toEqual(suggestRooms(people, [
      { id: "r1", name: "101", capacity: 2, members: ["m1"] }, { id: "r2", name: "102", capacity: 2, members: [] },
      { id: "r3", name: "103", capacity: 2, members: [] }, { id: "r4", name: "104", capacity: 3, members: [] },
    ]));
  });
  it("never puts a smoker with someone who minds, and leaves people out rather than break a rule", () => {
    const plan = suggestRooms([person("a", { smoke: SMOKER }), person("b", { smoke: MINDS_SMOKE })], [{ id: "r1", name: "1", capacity: 2, members: [] }]);
    expect(plan).toHaveLength(1);
  });
  it("does not add to a full room or one holding someone without a stay answer", () => {
    const people = [person("a"), person("b"), person("c", { gender: null })];
    expect(suggestRooms(people, [{ id: "r1", name: "1", capacity: 1, members: ["a"] }, { id: "r2", name: "2", capacity: 3, members: ["c"] }])).toEqual([]);
  });
});

describe("pasting the hotel's rooms", () => {
  it("reads rooms with or without a kind, and number ranges", () => {
    expect(parseRoomLines("208, Twin bed, 2\n\n301-303; Triple; 3\nSuite 1\t4")).toEqual({ problems: [], rooms: [
      { name: "208", kind: "Twin bed", capacity: 2 },
      { name: "301", kind: "Triple", capacity: 3 }, { name: "302", kind: "Triple", capacity: 3 }, { name: "303", kind: "Triple", capacity: 3 },
      { name: "Suite 1", kind: "", capacity: 4 },
    ] });
  });
  it("says which line it cannot read, and catches a room written twice", () => {
    expect(parseRoomLines("208").problems[0]).toMatch(/^Baris 1: tulis/);
    expect(parseRoomLines("208, Twin, 0").problems[0]).toBe("Baris 1: kapasitas harus angka 1–8.");
    expect(parseRoomLines("208, 2\n207-209, 2").problems).toEqual(["Kamar 208 tertulis lebih dari sekali."]);
    expect(parseRoomLines("1-500, 2").problems[0]).toContain("paling banyak 100 kamar per baris");
  });
});
