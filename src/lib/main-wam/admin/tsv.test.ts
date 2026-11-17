import { describe, expect, it } from "vitest";
import { amountText, clockTime, eventDayDate, fold, parseAmount, parseTsv, readColumns, yesNo } from "./tsv";
import { matchPerson, searchPeople, type AdminPerson } from "./people";

const DATES = ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"];

describe("parseTsv", () => {
  it("reads cells as Excel copies them: tabs, quoted cells with tabs, line breaks and quotes", () => {
    const paste = 'Hari\tJudul\tKeterangan\r\n2\t"Pemaparan\tdepartemen"\t"Baris satu\nbaris ""dua"""\r\n\r\n3\tGala\t\r\n';
    expect(parseTsv(paste)).toEqual([["Hari", "Judul", "Keterangan"], ["2", "Pemaparan departemen", 'Baris satu baris "dua"'], ["3", "Gala", ""]]);
  });
  it("drops blank rows and trims, and falls back to semicolons or commas without tabs", () => {
    expect(parseTsv("\n  a ; b \n\n c;d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTsv("Rani Contoh, Gerbong 3\nSari Contoh, Bus 2")).toEqual([["Rani Contoh", "Gerbong 3"], ["Sari Contoh", "Bus 2"]]);
    expect(parseTsv("﻿Nama\tKursi")).toEqual([["Nama", "Kursi"]]);
  });
  it("keeps a single column paste whole", () => {
    expect(parseTsv("Rani Contoh\nSari Contoh")).toEqual([["Rani Contoh"], ["Sari Contoh"]]);
  });
});

describe("cell readers", () => {
  it("folds case, accents and spaces", () => expect(fold("  Ďewi   LESTARI ")).toBe("dewi lestari"));
  it("reads yes/no words, and refuses anything else", () => {
    for (const word of ["ya", "Y", "1", "v", "✓", "Wajib", "TRUE"]) expect(yesNo(word)).toBe(true);
    for (const word of ["", "tidak", "-", "0", "N", "false"]) expect(yesNo(word)).toBe(false);
    expect(yesNo("x")).toBeNull();
    expect(yesNo("mungkin")).toBeNull();
  });
  it("reads clock times as typed in a sheet", () => {
    expect(clockTime("08.00")).toBe("08:00");
    expect(clockTime("8:30")).toBe("08:30");
    expect(clockTime("08:00:00")).toBe("08:00");
    expect(clockTime("0730")).toBe("07:30");
    expect(clockTime("7")).toBe("07:00");
    expect(clockTime("2.30 PM")).toBe("14:30");
    expect(clockTime("12:00 AM")).toBe("00:00");
    expect(clockTime("24:00")).toBeNull();
    expect(clockTime("08.75")).toBeNull();
    expect(clockTime("pagi")).toBeNull();
  });
  it("reads the event day by number, Hari N, ISO, d/m/y or a day name, inside the event only", () => {
    expect(eventDayDate("2", DATES)).toBe("2027-01-05");
    expect(eventDayDate("Hari 3", DATES)).toBe("2027-01-06");
    expect(eventDayDate("Hari ke-4", DATES)).toBe("2027-01-07");
    expect(eventDayDate("2027-01-04", DATES)).toBe("2027-01-04");
    expect(eventDayDate("5/1/2027", DATES)).toBe("2027-01-05");
    expect(eventDayDate("06/01/27", DATES)).toBe("2027-01-06");
    expect(eventDayDate("Sel, 5 Jan", DATES)).toBe("2027-01-05");
    expect(eventDayDate("7 Januari 2027", DATES)).toBe("2027-01-07");
    expect(eventDayDate("5", DATES)).toBeNull();
    expect(eventDayDate("2027-01-08", DATES)).toBeNull();
    expect(eventDayDate("8 Jan", DATES)).toBeNull();
    expect(eventDayDate("", DATES)).toBeNull();
  });
  it("reads amounts the Indonesian way", () => {
    expect(parseAmount("13,6")).toBe(13.6);
    expect(parseAmount("1.240")).toBe(1240);
    expect(parseAmount("1.240,5")).toBe(1240.5);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount(" 350 ")).toBe(350);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeUndefined();
    expect(parseAmount("1.2.3")).toBeUndefined();
    expect(amountText(13.6)).toBe("13,6");
    expect(amountText(null)).toBe("");
  });
  it("finds the header row in any order, else uses the documented order", () => {
    const patterns = { name: /^nama$/, seat: /^kursi$/, vehicle: /^kendaraan$/ };
    expect(readColumns([["Kendaraan", "Nama", "Kursi"]], patterns, { name: 0, seat: 1, vehicle: 2 })).toEqual({ columns: { name: 1, seat: 2, vehicle: 0 }, header: true });
    expect(readColumns([["Rani Contoh", "12A", ""]], patterns, { name: 0, seat: 1, vehicle: 2 })).toEqual({ columns: { name: 0, seat: 1, vehicle: 2 }, header: false });
  });
});

describe("people", () => {
  const people: AdminPerson[] = [
    { id: "1", fullName: "Rani Contoh", name: "Rani", department: "CoE" },
    { id: "2", fullName: "Dimas Contoh Satu", name: "Dimas", department: "Corporate" },
    { id: "3", fullName: "Dimas Contoh Dua", name: "Dimas", department: "Finance" },
    { id: "4", fullName: "Sari Contoh", name: "Sari", department: "HRGA" },
  ];
  it("matches a full name in any case, or a nama panggilan only one person has", () => {
    expect(matchPerson("rani  CONTOH", people).person?.id).toBe("1");
    expect(matchPerson("Sari", people).person?.id).toBe("4");
    expect(matchPerson("Dimas", people).error).toMatch(/dipakai 2 orang/);
    expect(matchPerson("Budi", people).error).toMatch(/tidak ada di Data karyawan/);
    expect(matchPerson(" ", people).error).toBe("Nama kosong.");
  });
  it("searches by every word over full name, nickname and department", () => {
    expect(searchPeople(people, "dimas fin").map(person => person.id)).toEqual(["3"]);
    expect(searchPeople(people, "").length).toBe(4);
  });
});
