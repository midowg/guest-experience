import { describe, expect, it } from "vitest";
import { buildOrg, subGroupOf, type OrgPerson } from "./org";

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
    expect(gm.children).toEqual([]);
    expect(sales.groups.map(group => [group.name, group.people.map(person => person.id)])).toEqual([["Business Solutions", ["bsm"]], ["Creative & Content", ["des"]]]);
    expect(sales.groups[0].people[0].children.map(child => child.id)).toEqual(["eng"]);
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
    expect(sales.groups.flatMap(group => group.people.map(person => person.id))).toEqual(["bsm", "des"]);
  });

  it("reads the Sales & Marketing sub-group from the position, first match first", () => {
    expect(subGroupOf("Sales & Marketing", "Business Solution Manager")).toBe("Business Solutions");
    expect(subGroupOf("Sales & Marketing", "Business Solutions & Commercial Coordinator")).toBe("Business Solutions");
    expect(subGroupOf("Sales & Marketing", "Commercial Creative Designer")).toBe("Creative & Content");
    expect(subGroupOf("Sales & Marketing", "Costing & Pricing Analyst")).toBe("Commercial");
    expect(subGroupOf("Sales & Marketing", "General Manager")).toBeNull();
    expect(subGroupOf("Accounting", "Commercial Engineer")).toBeNull();
  });

  it("keeps a person outside every group under the HOD", () => {
    const withOther = buildOrg([...people, p("ops", "Oki", "Sales & Marketing", "Sales Admin")], new Set(["bagus", "fadli"]), { "Sales & Marketing": ["gm"] });
    const sales = withOther.departments.find(department => department.name === "Sales & Marketing")!;
    expect(sales.heads[0].children.map(child => child.id)).toEqual(["ops"]);
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

describe("GM, a HOD under them, and teams (org chart of 10 Nov 2026)", () => {
  const q = (id: string, department: string, patch: Partial<OrgPerson> = {}): OrgPerson => ({ id, name: id, department, position: "", businessUnit: "WNS", reportsTo: null, ...patch });
  const team = [
    q("etik", "Sales & Marketing", { post: "gm" }),
    q("linda", "Sales & Marketing", { post: "hod", unit: "Commercial", reportsTo: "etik" }),
    q("ivana", "Sales & Marketing", { unit: "Commercial", reportsTo: "linda" }),
    q("irvani", "Sales & Marketing", { unit: "Business Solutions", lead: true }),
    q("elifasa", "Sales & Marketing", { unit: "Business Solutions", reportsTo: "etik" }),
    q("ainur", "Sales & Marketing", { reportsTo: "etik" }),
    q("nofri", "Bali Office", { post: "gm" }),
    q("ramadhan", "Bali Office", { reportsTo: "nofri" }),
    q("setiyadi", "Bali Office", { reportsTo: "ramadhan" }),
  ];
  const org = buildOrg(team, new Set(), { "Sales & Marketing": ["etik", "linda"], "Bali Office": ["nofri"] });
  const sales = org.departments.find(department => department.name === "Sales & Marketing")!;
  const ids = (nodes: { id: string; children: { id: string }[] }[]) => nodes.map(node => node.id);

  it("heads the card with the GM only; the HOD under them sits in their team with their people", () => {
    expect(ids(sales.heads)).toEqual(["etik"]);
    expect(sales.groups.map(group => [group.name, ids(group.people)])).toEqual([["Business Solutions", ["elifasa", "irvani"]], ["Commercial", ["linda"]]]);
    expect(ids(sales.groups[1].people[0].children)).toEqual(["ivana"]);
    // Without a team: under the GM.
    expect(ids(sales.heads[0].children)).toEqual(["ainur"]);
  });

  it("hangs staff under staff (Setiyadi under Ramadhan)", () => {
    const bali = org.departments.find(department => department.name === "Bali Office")!;
    expect(ids(bali.heads[0].children)).toEqual(["ramadhan"]);
    expect(ids(bali.heads[0].children[0].children)).toEqual(["setiyadi"]);
  });
});
