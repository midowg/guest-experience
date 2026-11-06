import { describe, expect, it } from "vitest";
import { buildOrg, type OrgPerson } from "./org";

const p = (id: string, name: string, department: string, position: string, reportsTo: string | null = null, businessUnit = "WNS"): OrgPerson => ({ id, name, department, position, businessUnit, reportsTo });
const people = [
  p("bagus", "I Gusti Putu Yaktianuraga", "Corporate", "Managing Director"),
  p("fadli", "Fadli Fahmi Ali", "Corporate", "Chief Executive Officer"),
  p("adiel", "Adiel Priyarama", "Corporate", "Chief of Staff"),
  p("gm", "Gita", "Sales & Marketing", "General Manager"),
  p("bsm", "Budi", "Sales & Marketing", "Business Solutions Manager"),
  p("eng", "Eko", "Sales & Marketing", "Commercial Engineer", "bsm"),
  p("des", "Dewi", "Sales & Marketing", "Creative Designer"),
  p("tee1", "Tari", "Takshaka Event & Experience", "Producer", null, "TEE"),
  p("mrp1", "Mira", "Maha Raja Pratama", "Staff", null, "MRP"),
];

describe("buildOrg", () => {
  const org = buildOrg(people, new Set(["bagus", "fadli"]), { "Sales & Marketing": ["gm"] }, ["MRP", "WNS", "TEE", "NMU", "WNN"]);

  it("puts the BOD on top, the Chief of Staff under them, then the departments by BU", () => {
    expect(org.bod.map(person => person.id)).toEqual(["fadli", "bagus"]);
    expect(org.staff.map(person => person.id)).toEqual(["adiel"]);
    expect(org.departments.map(department => department.name)).toEqual(["Maha Raja Pratama", "Sales & Marketing", "Takshaka Event & Experience"]);
  });

  it("hangs a team under the person it reports to, and everyone else under the HOD", () => {
    const sales = org.departments.find(department => department.name === "Sales & Marketing")!;
    expect(sales.heads.map(head => head.id)).toEqual(["gm"]);
    const gm = sales.heads[0];
    expect(gm.children.map(child => child.id)).toEqual(["bsm", "des"]);
    expect(gm.children[0].children.map(child => child.id)).toEqual(["eng"]);
    expect(sales.loose).toEqual([]);
    expect(sales.size).toBe(4);
  });

  it("shows a HOD from another department on the card they head, with its people under them", () => {
    const shared = buildOrg(people, new Set(["bagus", "fadli"]), { "Sales & Marketing": ["gm"], "Maha Raja Pratama": ["gm"] });
    const mrp = shared.departments.find(department => department.name === "Maha Raja Pratama")!;
    expect(mrp.heads.map(head => head.id)).toEqual(["gm"]);
    expect(mrp.heads[0].children.map(child => child.id)).toEqual(["mrp1"]);
    expect(mrp.size).toBe(1);
    const sales = shared.departments.find(department => department.name === "Sales & Marketing")!;
    expect(sales.heads[0].children.map(child => child.id)).toEqual(["bsm", "des"]);
  });

  it("keeps a department without a HOD flat, and cuts a loop", () => {
    const looped = buildOrg([p("a", "A", "X", "Staff", "b"), p("b", "B", "X", "Staff", "a")], new Set(), {});
    const x = looped.departments[0];
    expect(x.heads).toEqual([]);
    expect(x.loose.length).toBeGreaterThan(0);
    const ids = (nodes: typeof x.loose): string[] => nodes.flatMap(node => [node.id, ...ids(node.children)]);
    expect(ids(x.loose).sort()).toEqual(["a", "b"]);
  });
});
