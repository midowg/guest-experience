import { describe, expect, it } from "vitest";
import { bookerLabel, exportDates, exportDays, exportRows, exportText, rangeLabel, stampLabel } from "./schedule-export";
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
      session({ day: "2026-11-10", from: "18:00", to: "19:00", title: "Appraisal team Comms", roomId: null, roomName: null, location: "Lor Sawah",
        booking: { id: "b1", bookedBy: { id: "p1", name: "Raja", department: "Communications" } } }),
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
      "- Appraisal team Comms | *Di luar kantor (Lor Sawah)* | 18.00 - 19.00 (2 pax)",
      "",
      "meeting tanggal 11",
      "- Internal Departemen SS | *CFC Ananta Room* | 13.00 - 15.00",
      "",
      "update per 10/11/2026 11.50 WIB",
    ].join("\n"));
    expect(exportRows(days)[0]).toEqual(["Tanggal", "Kegiatan", "Tempat", "Mulai", "Selesai", "Pax", "Pemesan"]);
    expect(exportRows(days)).toContainEqual([expect.stringContaining("10 Nov 2026"), "Appraisal team Comms", "Di luar kantor (Lor Sawah)", "18.00", "19.00", "2", "Communications - Raja"]);
  });

  it("says when nothing is published", () => {
    expect(exportText([], new Date("2026-11-10T04:50:00Z"), ["2026-11-10"])).toMatch(/^Belum ada meeting terbit .*\n\nupdate per 10\/11\/2026 11\.50 WIB$/);
    expect(stampLabel(new Date("2026-11-10T17:05:00Z"))).toBe("11/11/2026 00.05 WIB");
  });
});
