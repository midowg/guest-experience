import { beforeEach, describe, expect, it, vi } from "vitest";

/* Who may open Misi Perjalanan, and that each person receives their own room only (made-up people). */
const fake = vi.hoisted(() => ({ sheet: null as unknown, hod: false }));
vi.mock("../supabase/admin", () => ({
  createPrivilegedClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fake.sheet ? { value: fake.sheet } : null, error: null }) }) }) }) }),
}));
vi.mock("./hod", () => ({ hodStanding: async () => ({ isHod: fake.hod, unitIds: [] }) }));

const { missionFor } = await import("./mission");
const person = (name: string, room: string) => ({ name, nick: name.split(" ")[0], dept: "Dept", room, sleep: "22.00", wake: "05.00", sents: [3], hints: ["a", "b", "c"] });
const member = (name: string, patch: Record<string, unknown> = {}) => ({ id: `id-${name}`, name, nickname: "", department: "", position: "", mustChangePassword: false, roles: [], photo: null, ...patch }) as never;

beforeEach(() => {
  fake.hod = false;
  fake.sheet = { rooms: { A: "A3", B: "B3" }, people: [person("Ani Satu", "A"), person("Ina Dua", "A"), person("Budi Tiga", "B"), person("Cici Empat", "B")], bod: [{ name: "Ceo Utama", sents: [1], ceo: true }] };
});

describe("missionFor", () => {
  it("gives a HoD in the list their own room and roommates only, and the others' names to guess from", async () => {
    const view = await missionFor(member("Ani  Satu"));
    expect(view?.role).toBe("HoD");
    expect(view?.room?.code).toBe("A3");
    expect(view?.room?.mates.map(mate => mate.name)).toEqual(["Ina Dua"]);
    // The quiz: the roommate and people from outside the room only, never this person.
    expect(view?.room?.mates[0].questions).toHaveLength(3);
    const names = view?.room?.mates[0].questions.flatMap(question => question.choices.map(choice => choice.name)) ?? [];
    expect(names).toContain("Ina Dua");
    expect(names).not.toContain("Ani Satu");
    expect(names.filter(name => name !== "Ina Dua").every(name => ["Budi Tiga", "Cici Empat"].includes(name))).toBe(true);
    expect(JSON.stringify(view)).not.toContain("B3");
  });

  it("lets BoD (the CEO with Mode CEO) and CoS in without a room", async () => {
    expect(await missionFor(member("Ceo Utama"))).toMatchObject({ role: "BoD", ceo: true, sentences: [1], room: null });
    expect(await missionFor(member("Cici Staf", { position: "Chief of Staff" }))).toMatchObject({ role: "CoS", room: null, sentences: [] });
    expect(await missionFor(member("Bod Lain", { roles: ["bod"] }))).toMatchObject({ role: "BoD", ceo: false });
  });

  it("lets another HoD in without a room, and nobody else", async () => {
    expect(await missionFor(member("Peserta Biasa"))).toBeNull();
    fake.hod = true;
    expect(await missionFor(member("Hod Lain"))).toMatchObject({ role: "HoD", room: null });
  });

  it("is closed to everyone while the sheet is missing", async () => {
    fake.sheet = null;
    expect(await missionFor(member("Ani Satu"))).toBeNull();
  });
});
