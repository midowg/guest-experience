import { describe, expect, it } from "vitest";
import { sampleActivityGroups, sampleGroup4, sampleGroups, samplePeople, sampleSessionIds } from "../sample";
import {
  activityImportSchema, groupImportSchema, groupInputSchema, membersInputSchema, movesOut, nextGroupNumber, parseActivityPaste, parseGroupPaste, sortOf, ungrouped,
} from "./groups";
import { activityPostSchema, groupsPostSchema } from "./requests";
import { sampleAdminPeople } from "./sample";

const id = (key: keyof typeof samplePeople) => samplePeople[key].id;

describe("kelompok", () => {
  it("checks number, name, members and koordinator", () => {
    expect(groupInputSchema.safeParse({ number: 4, name: "Arjuno" }).success).toBe(true);
    expect(groupInputSchema.safeParse({ number: 0, name: "Arjuno" }).error?.issues[0].message).toBe("Nomor kelompok 1–99.");
    expect(groupInputSchema.safeParse({ number: 4, name: " " }).error?.issues[0].message).toBe("Tulis nama kelompok.");
    expect(membersInputSchema.safeParse({ employeeIds: [id("rani")], coordinatorId: id("sari") }).error?.issues[0].message).toBe("Koordinator harus anggota kelompok ini.");
    expect(membersInputSchema.safeParse({ employeeIds: [id("rani"), id("rani")], coordinatorId: null }).error?.issues[0].message).toBe("Ada anggota yang tertulis dua kali.");
    expect(membersInputSchema.safeParse({ employeeIds: [id("rani"), id("sari")], coordinatorId: id("rani") }).success).toBe(true);
  });
  it("flags who has no kelompok and picks the next free number", () => {
    const without = ungrouped(sampleAdminPeople, sampleGroups).map(person => person.name);
    expect(without).toContain("Arman");
    expect(without).not.toContain("Rani");
    expect(nextGroupNumber(sampleGroups)).toBe(13);
    expect(nextGroupNumber([{ number: 1 }, { number: 3 }])).toBe(2);
  });
  it("refuses one person in two kelompok, or a number twice, in an import", () => {
    const groups = [{ number: 1, name: "Bromo", employeeIds: [id("rani")], coordinatorId: null }, { number: 2, name: "Kawi", employeeIds: [id("rani")], coordinatorId: null }];
    expect(groupImportSchema.safeParse({ groups }).error?.issues[0].message).toBe("Satu orang hanya boleh di satu kelompok.");
    expect(groupImportSchema.safeParse({ groups: [groups[0], { ...groups[0], employeeIds: [] }] }).error?.issues[0].message).toBe("Kelompok 1 tertulis dua kali.");
    // The request keeps the import's own checks.
    expect(groupsPostSchema.safeParse({ action: "impor", groups }).success).toBe(false);
    expect(groupsPostSchema.safeParse({ action: "impor", groups: [groups[0]] }).success).toBe(true);
  });
});

describe("impor kelompok", () => {
  const ctx = { people: sampleAdminPeople, groups: sampleGroups };
  it("groups the rows by number and finds people by full name or nickname", () => {
    const paste = ["Kelompok\tNama kelompok\tNama karyawan\tKoordinator", "5\tPanderman\tHana Contoh\tya", "Kelompok 5\t\tMaya\t", "13\tBaru\tArman Contoh\t"].join("\n");
    const result = parseGroupPaste(paste, ctx);
    expect(result.header).toBe(true);
    expect(result.rows.every(row => !row.errors.length)).toBe(true);
    expect(result.groups).toEqual([
      { number: 5, name: "Panderman", employeeIds: [id("hana"), id("maya")], coordinatorId: id("hana") },
      { number: 13, name: "Baru", employeeIds: [id("arman")], coordinatorId: null },
    ]);
  });
  it("keeps an existing kelompok's name when the paste leaves it out, and asks for a new one's", () => {
    const result = parseGroupPaste("4\t\tRani Contoh\n14\t\tSari Contoh", ctx);
    expect(result.groups[0]).toMatchObject({ number: 4, name: "Arjuno" });
    expect(result.rows[1].errors).toEqual(["Kelompok 14 baru: tulis namanya di salah satu baris."]);
  });
  it("says what is wrong, row by row", () => {
    const paste = ["0\tBromo\tRani Contoh\t", "1\tBromo\tBudi\t", "1\tKawi\tSari Contoh\tya", "1\tBromo\tDewi Contoh\tya", "2\tKawi\tRani Contoh\tmungkin"].join("\n");
    const rows = parseGroupPaste(paste, ctx).rows;
    expect(rows[0].errors).toEqual(['Kelompok "0": tulis nomor 1–99.']);
    expect(rows[1].errors[0]).toMatch(/^Budi tidak ada di Data karyawan/);
    expect(rows[2].errors).toEqual(['Kelompok 1 sudah bernama "Bromo" di baris 2.']);
    expect(rows[3].errors).toEqual(["Kelompok 1 sudah punya koordinator di baris 3."]);
    expect(rows[4].errors).toEqual(expect.arrayContaining(['Koordinator "mungkin": tulis ya atau kosongkan.', "Rani Contoh sudah ada di baris 1. Satu orang satu kelompok."]));
    expect(rows.every(row => row.input === null)).toBe(true);
  });
  it("says who moves out of another kelompok", () => {
    expect(movesOut(id("rani"), 5, sampleGroups)?.id).toBe(sampleGroup4.id);
    expect(movesOut(id("rani"), 4, sampleGroups)).toBeNull();
    expect(movesOut(id("arman"), 5, sampleGroups)).toBeNull();
  });
});

describe("kelompok kegiatan", () => {
  const team = sampleSessionIds["team-building"];
  it("reads a paste of one session by group, the kind from the first word", () => {
    const paste = ["Kelompok kegiatan\tNama karyawan\tCatatan", "Pos 2\tRani Contoh\t", "Pos 2\tSari Contoh\tDekat kolam", "Angkot 3\tDewi Contoh\t"].join("\n");
    const result = parseActivityPaste(paste, { people: sampleAdminPeople, existing: [], kind: "pos" });
    expect(result.groups).toEqual([
      { label: "Pos 2", kind: "pos", note: "Dekat kolam", sort: 2, employeeIds: [id("rani"), id("sari")] },
      { label: "Angkot 3", kind: "angkot", note: "", sort: 3, employeeIds: [id("dewi")] },
    ]);
    expect(activityImportSchema.safeParse({ sessionId: team, groups: result.groups }).success).toBe(true);
    expect(activityPostSchema.safeParse({ action: "impor", sessionId: team, groups: result.groups }).success).toBe(true);
  });
  it("refuses a person twice in one session, an unknown kind, and an empty group name", () => {
    const rows = parseActivityPaste("Pos 1\tRani Contoh\nPos 2\tRani Contoh\n\tSari Contoh\nMeja 1\tDewi Contoh\tPerahu", { people: sampleAdminPeople, existing: sampleActivityGroups, kind: "pos" }).rows;
    expect(rows[1].errors[0]).toMatch(/sudah ada di baris 1/);
    expect(rows[2].errors).toContain("Nama kelompok kegiatan kosong.");
    expect(rows[3].errors[0]).toMatch(/^Jenis "Perahu"/);
    const groups = [{ label: "Pos 1", kind: "pos" as const, note: "", sort: 1, employeeIds: [id("rani")] }, { label: "pos 1", kind: "pos" as const, note: "", sort: 2, employeeIds: [] }];
    expect(activityImportSchema.safeParse({ sessionId: team, groups }).error?.issues[0].message).toBe("pos 1 tertulis dua kali.");
  });
  it("sorts by the number in the name", () => {
    expect(sortOf("Meja 12", 0)).toBe(12);
    expect(sortOf("Pos utara", 3)).toBe(1003);
  });
});
