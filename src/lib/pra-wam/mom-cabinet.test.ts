import { describe, expect, it } from "vitest";
import { activityOf, cabinetFolder, filterEntries, filterOptions, monthName, pdfName, photoName, placeEntries, safeName, type CabinetEntry } from "./mom-cabinet";

const entry = (patch: Partial<CabinetEntry> = {}): CabinetEntry => ({
  sessionId: "5e550000-0000-4000-8000-000000000001", code: "MoM/2026/11/0012", title: "Appraisal team SS", date: "2026-11-10", from: "13.00", to: "14.00",
  place: "CFC Ananta Room", department: "Sales & Marketing", short: "SM", hod: false, chair: "Etik", notetaker: "Raja",
  present: 3, total: 4, guests: 0, topics: 2, decisions: 3, actions: 2, open: 1, version: 1, sentAt: "2026-11-10T07:00:00Z", telegramOff: false, photos: [], ...patch,
});

describe("Arsip MoM folders", () => {
  it("names the activity without the team, as the panitia's archive does", () => {
    expect(activityOf("Appraisal team SS", "SM")).toBe("Appraisal");
    expect(activityOf("Appraisal tim", "SM")).toBe("Appraisal");
    expect(activityOf("Review KPI SM", "SM")).toBe("Review KPI");
    expect(activityOf("Evaluasi Meeting", "CoE")).toBe("Evaluasi Meeting");
    expect(activityOf("  Team  ", "")).toBe("Team");
  });

  it("files a MoM by month, activity, day and team (REKAP DOKUMENTASI MEETING / DOKUMENTASI APPRAISAL / APPRAISAL-10 NOVEMBER 2026 / TEAM SM)", () => {
    expect(cabinetFolder(entry())).toEqual(["REKAP DOKUMENTASI MEETING-NOVEMBER 2026", "DOKUMENTASI APPRAISAL", "APPRAISAL-10 NOVEMBER 2026", "TEAM SM"]);
    expect(cabinetFolder(entry({ hod: true, title: "Meeting HOD Q4", short: "HOD", date: "2026-12-01" }))[3]).toBe("TEAM HOD");
    expect(cabinetFolder(entry({ title: "Rapat: anggaran/Q1?" }))[1]).toBe("DOKUMENTASI RAPAT- ANGGARAN-Q1-");
    expect(monthName("2026-05")).toBe("MEI 2026");
    expect(safeName("  a.  ")).toBe("a");
  });

  it("gives a second meeting of one team on one day its own folder, oldest first", () => {
    const placed = placeEntries([entry({ sessionId: "b", code: "MoM/2026/11/0013", from: "15.00" }), entry({ sessionId: "a" })]);
    expect(placed.map(item => [item.sessionId, item.path[3]])).toEqual([["a", "TEAM SM"], ["b", "TEAM SM (2)"]]);
  });

  it("names what goes in a meeting's folder after the MoM", () => {
    expect(pdfName(entry({ version: 2 }))).toBe("MoM-2026-11-0012_v2.pdf");
    expect(photoName(entry(), 0)).toBe("MoM-2026-11-0012_foto-01.jpg");
    expect(photoName(entry({ code: "CoE-20261112-4F3A" }), 9)).toBe("CoE-20261112-4F3A_foto-10.jpg");
    expect(pdfName(entry({ code: "CoE-20261112-4F3A", numbered: false }))).toBe("MoM_CoE-20261112-4F3A_v1.pdf");
  });

  it("names them after the nomor surat typed, slashes made safe", () => {
    const typed = entry({ code: "001/MoM/BAS/XI/2026", numbered: true, version: 3 });
    expect(pdfName(typed)).toBe("001-MoM-BAS-XI-2026_v3.pdf");
    expect(photoName(typed, 1)).toBe("001-MoM-BAS-XI-2026_foto-02.jpg");
    expect(photoName(entry({ code: "002\\MoM:BAS*XI?2026" }), 0)).toBe("002-MoM-BAS-XI-2026_foto-01.jpg");
  });
});

describe("Arsip MoM filters", () => {
  const all = [
    entry({ sessionId: "a" }),
    entry({ sessionId: "b", code: "MoM/2026/12/0001", title: "Evaluasi Meeting", date: "2026-12-02", department: "Center of Excellence", short: "CoE", notetaker: "Sofyan" }),
  ];
  it("lists the months newest first and the departments", () => {
    expect(filterOptions(all)).toEqual({ months: ["2026-12", "2026-11"], departments: ["Center of Excellence", "Sales & Marketing"] });
  });
  it("narrows by month, department, and every word typed", () => {
    expect(filterEntries(all, { query: "", month: "2026-11", department: "" }).map(item => item.sessionId)).toEqual(["a"]);
    expect(filterEntries(all, { query: "", month: "", department: "Center of Excellence" }).map(item => item.sessionId)).toEqual(["b"]);
    expect(filterEntries(all, { query: "evaluasi sofyan", month: "", department: "" }).map(item => item.sessionId)).toEqual(["b"]);
    expect(filterEntries(all, { query: "0012", month: "", department: "" }).map(item => item.sessionId)).toEqual(["a"]);
    expect(filterEntries(all, { query: "tidak ada", month: "", department: "" })).toEqual([]);
  });
});
