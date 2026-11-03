import { describe, expect, it } from "vitest";
import { participantGroups, unitsFromSheets } from "./units";

const sheets = [
  { name: "Karyawan", rows: [["NAMA KARYAWAN", "DEPARTMENT"], ["Yulia Uji", "BAS"]] },
  { name: "Unit dan jabatan", rows: [
    ["NIP", "Nama panggilan", "Jenis unit", "Unit", "Jabatan di unit", "Utama", "Sumber"],
    ["", "Yulia", "Departemen", "Business & Administrative Services", "Senior Manager", "Ya", ""],
    ["", "Yulia", "BU", "WNS", "Anggota", "Ya", ""],
    ["", "Yulia", "Departemen", "Business & Administrative Services", "Lead departemen", "Tidak", ""],
    ["", "Yulia", "BU", "MRP", "Lead BU", "Tidak", ""],
    ["", "", "", "", "", "", ""],
    ["", "Tanpa unit", "Divisi?", "", "", "", ""],
  ] },
  { name: "Unit", rows: [["Jenis", "Nama unit", "Kode"], ["Departemen", "Business & Administrative Services", "BAS"]] },
];

describe("unitsFromSheets", () => {
  const parsed = unitsFromSheets(sheets);
  it("reads the units with their codes", () => {
    expect(parsed.sheet).toBe("Unit dan jabatan");
    expect(parsed.units).toEqual([
      { kind: "departemen", name: "Business & Administrative Services", code: "BAS" },
      { kind: "bu", name: "WNS", code: "WNS" },
      { kind: "bu", name: "MRP", code: "MRP" },
    ]);
  });
  it("merges a person's rows per unit: title, lead, own unit", () => {
    expect(parsed.members).toEqual([
      { nip: "", nickname: "Yulia", kind: "departemen", unit: "Business & Administrative Services", jobTitle: "Senior Manager", isLead: true, isPrimary: true },
      { nip: "", nickname: "Yulia", kind: "bu", unit: "WNS", jobTitle: "", isLead: false, isPrimary: true },
      { nip: "", nickname: "Yulia", kind: "bu", unit: "MRP", jobTitle: "", isLead: true, isPrimary: false },
    ]);
  });
  it("skips blank rows and reports broken ones", () => {
    expect(parsed.skipped).toEqual(["Baris 7: jenis unit, unit, atau nama kosong."]);
  });
});

describe("participantGroups", () => {
  const people = [{ id: "yulia", department: "BAS" }, { id: "adi", department: "Sales" }, { id: "rina", department: "BAS" }];
  it("uses units when imported: own led units first, a person under every unit", () => {
    const units = [
      { id: "sales", kind: "departemen" as const, name: "Sales & Marketing", code: null },
      { id: "mrp", kind: "bu" as const, name: "MRP", code: "MRP" },
      { id: "bas", kind: "departemen" as const, name: "Business & Administrative Services", code: "BAS" },
      { id: "empty", kind: "departemen" as const, name: "Kosong", code: null },
    ];
    const memberships = [
      { unitId: "bas", employeeId: "yulia", isLead: true }, { unitId: "bas", employeeId: "rina", isLead: false },
      { unitId: "mrp", employeeId: "yulia", isLead: true }, { unitId: "sales", employeeId: "adi", isLead: false },
    ];
    expect(participantGroups(people, "yulia", units, memberships)).toEqual([
      { id: "bas", label: "BAS", memberIds: ["yulia", "rina"] },
      { id: "mrp", label: "MRP", memberIds: ["yulia"] },
      { id: "sales", label: "Sales & Marketing", memberIds: ["adi"] },
    ]);
  });
  it("falls back to the department column, the viewer's first", () => {
    expect(participantGroups(people, "adi").map(group => group.label)).toEqual(["Sales", "BAS"]);
  });
});
