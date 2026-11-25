import { describe, expect, it } from "vitest";
import type { TagCandidate } from "@/lib/main-wam/misi/rules";
import { changeLook, clampIndex, DEFAULT_LOOK, knownIds, listPeople, lookToAll, originalName, toggleId, type Look } from "./editor";

const person = (name: string, department: string, bod = false): TagCandidate => ({ id: `id-${name}`, name, department, bod, seatmate: false, roommate: false });
const photos = (): (Look & { id: string })[] => [{ id: "a", ...DEFAULT_LOOK }, { id: "b", ...DEFAULT_LOOK }, { id: "c", ...DEFAULT_LOOK }];

describe("the look of each photo", () => {
  it("starts with Tanpa and Asli, and a change goes to the chosen photo only", () => {
    expect(DEFAULT_LOOK).toEqual({ sign: "tanpa", tone: "asli" });
    const next = changeLook(photos(), 1, { sign: "tanda" }, false);
    expect(next.map(photo => photo.sign)).toEqual(["tanpa", "tanda", "tanpa"]);
    expect(next.map(photo => photo.tone)).toEqual(["asli", "asli", "asli"]);
  });

  it("with Terapkan ke semua foto the change goes to every photo, and switching it on copies the chosen look to all", () => {
    expect(changeLook(photos(), 0, { tone: "mono" }, true).map(photo => photo.tone)).toEqual(["mono", "mono", "mono"]);
    const own = changeLook(photos(), 2, { sign: "polaroid", tone: "hangat" }, false);
    expect(lookToAll(own, 2).map(photo => [photo.sign, photo.tone])).toEqual([["polaroid", "hangat"], ["polaroid", "hangat"], ["polaroid", "hangat"]]);
    expect(lookToAll([], 0)).toEqual([]);
  });

  it("keeps the chosen photo in range", () => {
    expect([clampIndex(5, 3), clampIndex(-1, 3), clampIndex(1, 3), clampIndex(0, 0)]).toEqual([2, 0, 1, 0]);
  });
});

describe("the one list of people", () => {
  const everyone = [person("Sari", "HRGA"), person("Arman", "BOD", true), person("Bima", "Finance"), person("Wulan", "BOD", true), person("Ayu", "Kreatif")];

  it("puts BOD first (in the same list), then the rest by name", () => {
    expect(listPeople(everyone, "").map(entry => entry.name)).toEqual(["Arman", "Wulan", "Ayu", "Bima", "Sari"]);
  });

  it("searches name and department, ignoring case and spaces around", () => {
    expect(listPeople(everyone, "  ari ").map(entry => entry.name)).toEqual(["Sari"]);
    expect(listPeople(everyone, "fin").map(entry => entry.name)).toEqual(["Bima"]);
    expect(listPeople(everyone, "BOD").map(entry => entry.name)).toEqual(["Arman", "Wulan"]);
    expect(listPeople(everyone, "zzz")).toEqual([]);
  });

  it("has no limit on how many are chosen: toggling keeps adding (more than the old six), and a second tap takes one off", () => {
    let ids: string[] = [];
    for (let index = 0; index < 20; index++) ids = toggleId(ids, `p${index}`);
    expect(ids).toHaveLength(20);
    expect(toggleId(ids, "p3")).toHaveLength(19);
    expect(toggleId(ids, "p3")).not.toContain("p3");
  });

  it("sends only people who are still in the list", () => {
    expect(knownIds(["id-Sari", "id-Gone", "id-Bima"], everyone)).toEqual(["id-Sari", "id-Bima"]);
  });
});

describe("the original kept on the phone", () => {
  it("is named by the moment it was taken, numbered when there are several", () => {
    const at = new Date(2027, 0, 5, 15, 20, 3);
    expect(originalName(at)).toBe("wam-momen-20270105-152003.jpg");
    expect(originalName(at, 2)).toBe("wam-momen-20270105-152003-3.jpg");
  });
});
