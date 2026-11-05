import { describe, expect, it } from "vitest";
import { groupSize, needBlock, type NeedPerson } from "./needs";
import { answerLevel, type QQuestion } from "./questionnaire";

const question = (extra: Partial<QQuestion>): QQuestion => ({
  id: "q", sectionId: "a", key: "14", prompt: "Ada kebutuhan makanan?", kind: "multi", required: false, visibility: "fasil",
  options: ["Tidak ada", "Halal", "Vegetarian", "Ada alergi"], maxChoices: null, matrixRows: [], scale: [], placeholder: "", note: "", react: "",
  showIf: null, sort: 1, hidden: false, ...extra,
});
const people = new Map<string, NeedPerson>([
  ["p1", { id: "p1", name: "Ayu", department: "Comms" }], ["p2", { id: "p2", name: "Budi", department: "Finance" }],
  ["p3", { id: "p3", name: "Citra", department: "HR" }], ["p4", { id: "p4", name: "Dodi", department: "IT" }],
]);
const block = { key: "14", title: "Makanan", purpose: "Untuk panitia konsumsi." };

describe("the level one answer is read at", () => {
  it("is the stricter of the answer's own level and its question's", () => {
    expect(answerLevel("fasil", "hr")).toBe("hr");
    expect(answerLevel("hr", "fasil")).toBe("hr");
    expect(answerLevel("rekan", null)).toBe("rekan");
    expect(answerLevel("fasil", "bukan-level")).toBe("fasil");
    expect(answerLevel("fasil", "hronly")).toBe("hronly");
  });
});

describe("a needs block", () => {
  it("names answers given under the panitia label, counts the ones given under the HR label, and keeps 'Tidak ada' a number", () => {
    const result = needBlock(block, question({}), [
      { employeeId: "p1", value: ["Halal", "Ada alergi"], readLevel: "fasil" },
      { employeeId: "p2", value: ["Vegetarian"], readLevel: "hr" },
      { employeeId: "p3", value: ["Tidak ada"], readLevel: "fasil" },
      { employeeId: "gone", value: ["Halal"], readLevel: "fasil" },
    ], people)!;
    const byLabel = Object.fromEntries(result.groups.map(group => [group.label, group]));
    expect(byLabel.Halal.people.map(person => person.name)).toEqual(["Ayu"]);
    expect(byLabel.Vegetarian).toMatchObject({ people: [], unnamed: 1 });
    expect(byLabel["Tidak ada"]).toMatchObject({ people: [], unnamed: 1, countOnly: true });
    expect(groupSize(byLabel.Halal)).toBe(1);
    expect(JSON.stringify(result)).not.toContain("Budi");
  });
  it("names written answers only under the panitia label, and only counts an HR question's", () => {
    const allergies = needBlock({ ...block, key: "14b" }, question({ key: "14b", kind: "long", options: [] }), [
      { employeeId: "p1", value: "Alergi kacang, parah", readLevel: "fasil" },
      { employeeId: "p2", value: "rahasia lama", readLevel: "hr" },
      { employeeId: "p4", value: "   " },
    ], people)!;
    expect(allergies.entries).toEqual([{ person: people.get("p1"), text: "Alergi kacang, parah" }]);
    expect(allergies).toMatchObject({ hrOnly: 1, hrQuestion: false });
    expect(JSON.stringify(allergies)).not.toContain("rahasia lama");
    const prayer = needBlock({ ...block, key: "15" }, question({ key: "15", kind: "text", options: [], visibility: "hr" }), [{ employeeId: "p1", value: "Ruang salat" }], people)!;
    expect(prayer).toMatchObject({ entries: [], hrOnly: 1, hrQuestion: true });
    expect(JSON.stringify(prayer)).not.toContain("Ruang salat");
  });
  it("counts HR choices without names, and never shows Rahasia HR", () => {
    const shirts = needBlock({ ...block, key: "38" }, question({ key: "38", kind: "single", options: ["S", "M"], visibility: "hr" }), [{ employeeId: "p1", value: "M" }], people)!;
    expect(shirts.groups).toEqual([{ label: "S", people: [], unnamed: 0, countOnly: false }, { label: "M", people: [], unnamed: 1, countOnly: false }]);
    expect(needBlock(block, question({ visibility: "hronly" }), [{ employeeId: "p1", value: ["Halal"] }], people)).toBeNull();
    const widened = needBlock(block, question({}), [{ employeeId: "p1", value: ["Halal"], readLevel: "hronly" }], people)!;
    expect(widened.groups.every(group => groupSize(group) === 0)).toBe(true);
  });
});
