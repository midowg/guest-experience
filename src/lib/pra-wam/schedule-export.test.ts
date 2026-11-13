import { describe, expect, it } from "vitest";
import { bookerLabel, departmentsMet, exportDates, exportDays, exportRows, exportText, fullSessions, fullSheets, queryDate, rangeLabel, stampLabel, titleWithDepartment } from "./schedule-export";
import type { Session } from "./sessions";

const at = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();
const session = (patch: Partial<Session> & { day: string; from: string; to: string }): Session => {
  const { day, from, to, ...rest } = patch;
  return {
    id: `${day}${from}${rest.title ?? ""}`, title: "Appraisal team SS", kind: "rapat", description: "", status: "terbit",
    planFrom: null, planTo: null, startsAt: at(day, from), endsAt: at(day, to), roomId: "r1", roomName: "CFC Ananta Room", location: null,
    participantCount: 2, isParticipant: false, participants: null, booking: null, ...rest,
  } as Session;
};

describe("schedule export", () => {
  it("names the booker by department and call name", () => {
    expect(bookerLabel({ name: "Raja", department: "Sales & Marketing" })).toBe("SM - Raja");
    expect(bookerLabel({ name: "Raja", department: "" })).toBe("Raja");
  });

  it("puts the booker's department after the name, once", () => {
    expect(titleWithDepartment("Appraisal team", "SM")).toBe("Appraisal team SM");
    expect(titleWithDepartment("Appraisal team SM", "SM")).toBe("Appraisal team SM");
    expect(titleWithDepartment("Rapat (HRGA)", "HRGA")).toBe("Rapat (HRGA)");
    expect(titleWithDepartment(" Forum HC ", "")).toBe("Forum HC");
  });

  it("covers Monday to Sunday of the week, or the day", () => {
    expect(exportDates("minggu", "2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(exportDates("hari", "2026-11-11")).toEqual(["2026-11-11"]);
    expect(rangeLabel(exportDates("minggu", "2026-11-11"))).toBe("9 – 15 Nov 2026");
    expect(rangeLabel(exportDates("minggu", "2026-12-02"))).toBe("30 Nov – 6 Des 2026");
  });

  it("joins the times of one name and place on a day, leaves drafts and cancelled out, writes the WhatsApp text", () => {
    const sessions = [
      session({ day: "2026-11-10", from: "13:30", to: "15:00", participantCount: 3 }),
      session({ day: "2026-11-10", from: "11:00", to: "12:30" }),
      session({ day: "2026-11-10", from: "18:00", to: "19:00", title: "Appraisal team", roomId: null, roomName: null, location: "Lor Sawah",
        booking: { id: "b1", bookedBy: { id: "p1", name: "Raja", department: "Sales & Marketing" } } }),
      session({ day: "2026-11-10", from: "09:00", to: "10:00", title: "Draf", status: "draf" }),
      session({ day: "2026-11-11", from: "09:00", to: "10:00", title: "Batal", status: "batal" }),
      session({ day: "2026-11-11", from: "13:00", to: "15:00", title: "Internal Departemen SS", participantCount: 0 }),
      session({ day: "2026-11-20", from: "13:00", to: "15:00", title: "Minggu depan" }),
    ];
    const dates = exportDates("minggu", "2026-11-10");
    const days = exportDays(sessions, dates);
    expect(days.map(day => day.date)).toEqual(["2026-11-10", "2026-11-11"]);
    const text = exportText(days, new Date("2026-11-10T04:50:00Z"), dates);
    expect(text).toBe([
      "meeting tanggal 10",
      "- Appraisal team SS | *CFC Ananta Room* | 11.00 - 12.30 (2 pax) & 13.30 - 15.00 (3 pax)",
      "- Appraisal team SM | *Di luar kantor (Lor Sawah)* | 18.00 - 19.00 (2 pax)",
      "",
      "meeting tanggal 11",
      "- Internal Departemen SS | *CFC Ananta Room* | 13.00 - 15.00",
      "",
      "update per 10/11/2026 11.50 WIB",
    ].join("\n"));
    expect(exportRows(days)[0]).toEqual(["Tanggal", "Kegiatan", "Tempat", "Mulai", "Selesai", "Pax", "Pemesan"]);
    expect(exportRows(days)).toContainEqual([expect.stringContaining("10 Nov 2026"), "Appraisal team SM", "Di luar kantor (Lor Sawah)", "18.00", "19.00", "2", "SM - Raja"]);
  });

  it("says when nothing is published", () => {
    expect(exportText([], new Date("2026-11-10T04:50:00Z"), ["2026-11-10"])).toMatch(/^Belum ada meeting terbit .*\n\nupdate per 10\/11\/2026 11\.50 WIB$/);
    expect(stampLabel(new Date("2026-11-10T17:05:00Z"))).toBe("11/11/2026 00.05 WIB");
  });
});

describe("data lengkap", () => {
  const meetings = [
    session({ day: "2026-11-12", from: "13:00", to: "14:00", title: "Koordinasi event", id: "b" }),
    session({ day: "2026-11-10", from: "09:00", to: "10:30", title: "Appraisal", id: "a" }),
    session({ day: "2026-11-20", from: "09:00", to: "10:00", title: "Nanti", id: "c" }),
    session({ day: "2026-11-11", from: "09:00", to: "10:00", title: "Draf", id: "d", status: "draf" }),
  ];
  const people: Record<string, { fullName: string; department: string }[]> = {
    a: [{ fullName: "Raja Pratama", department: "Sales & Marketing" }, { fullName: "Dewi Lestari", department: "Center of Excellence" }, { fullName: "Bima Putra", department: "Sales & Marketing" }],
    b: [{ fullName: "Sari", department: "" }],
  };

  it("keeps the published meetings in the range, earliest first; an empty end is open", () => {
    expect(fullSessions(meetings, "2026-11-10", "2026-11-12").map(each => each.id)).toEqual(["a", "b"]);
    expect(fullSessions(meetings, null, null).map(each => each.id)).toEqual(["a", "b", "c"]);
    expect(fullSessions(meetings, "2026-11-11", null).map(each => each.id)).toEqual(["b", "c"]);
    expect([queryDate("2026-11-10"), queryDate("10/11/2026"), queryDate(null)]).toEqual(["2026-11-10", null, null]);
  });

  it("names the departments that met, the most people first, and everyone by full name", () => {
    expect(departmentsMet(people.a)).toBe("SM x CoE");
    const sheets = fullSheets(fullSessions(meetings, "2026-11-10", "2026-11-12"), id => people[id] ?? []);
    expect(sheets.meetings[0]).toEqual(["Tanggal", "Mulai", "Selesai", "Ruang / tempat", "Kegiatan", "Jenis", "Pemesan", "Dept x Dept", "Jumlah peserta", "Peserta"]);
    expect(sheets.meetings[1]).toEqual(["Selasa, 10 Nov 2026", "09.00", "10.30", "CFC Ananta Room", "Appraisal", "Rapat", "", "SM x CoE", "3", "Bima Putra, Dewi Lestari, Raja Pratama"]);
    expect(sheets.meetings[2].slice(7)).toEqual(["", "1", "Sari"]);
    expect(sheets.people.slice(1).map(row => [row[4], row[5], row[6]])).toEqual([
      ["Appraisal", "Bima Putra", "Sales & Marketing"], ["Appraisal", "Dewi Lestari", "Center of Excellence"], ["Appraisal", "Raja Pratama", "Sales & Marketing"],
      ["Koordinasi event", "Sari", "-"],
    ]);
  });
});
