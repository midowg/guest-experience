import { describe, expect, it } from "vitest";
import { aboutInputSchema, aboutParagraphs, aboutProblems, cleanAbout, dateRange, defaultAbout, pointParts } from "./about";

const events = [
  { kind: "pra_wam" as const, name: "Pra WAM 2026", startDate: "2026-10-28", endDate: "2026-12-23" },
  { kind: "wam" as const, name: "WAM 2027", startDate: "2027-01-04", endDate: "2027-01-07" },
];
const good = { title: "Apa itu WAM?", summary: "Pertemuan tahunan Werkudara.", body: "Paragraf pertama yang cukup panjang.\n\nParagraf kedua.", points: ["Kapan: 4–7 Jan 2027"] };

describe("Apa itu WAM", () => {
  it("tidies text: line endings, trailing spaces, blank runs, empty points", () => {
    expect(cleanAbout({ title: "  Apa   itu WAM? ", summary: "Satu\r\ndua ", body: "A  \r\n\r\n\r\n\r\nB\n", points: [" Kapan:  Januari ", "", "   "] }))
      .toEqual({ title: "Apa itu WAM?", summary: "Satu dua", body: "A\n\nB", points: ["Kapan: Januari"] });
  });

  it("accepts a sensible text and cleans it on the way in", () => {
    const result = aboutInputSchema.safeParse({ ...good, points: [...good.points, " "] });
    expect(result.success).toBe(true);
    expect(result.data?.points).toEqual(["Kapan: 4–7 Jan 2027"]);
  });

  it("refuses short, long, or too many parts, and names the field", () => {
    expect(aboutInputSchema.safeParse({ ...good, title: " a " }).success).toBe(false);
    expect(aboutInputSchema.safeParse({ ...good, body: "x".repeat(4001) }).success).toBe(false);
    expect(aboutInputSchema.safeParse({ ...good, points: Array(7).fill("Poin penting") }).success).toBe(false);
    expect(aboutInputSchema.safeParse({ ...good, summary: 5 }).success).toBe(false);
    expect(aboutProblems({ ...good, summary: "Pendek" })).toEqual({ summary: "Ringkasan minimal 10 karakter." });
    expect(aboutProblems({ ...good, points: ["ok", "x"] }).points).toBe("Poin 2: Poin minimal 2 karakter.");
    expect(aboutProblems(good)).toEqual({});
  });

  it("keeps markup as text: nothing is parsed as HTML", () => {
    const result = aboutInputSchema.parse({ ...good, body: "<script>alert(1)</script> tetap teks biasa." });
    expect(aboutParagraphs(result.body)).toEqual(["<script>alert(1)</script> tetap teks biasa."]);
  });

  it("splits paragraphs at blank lines, keeping single line breaks", () => {
    expect(aboutParagraphs("Satu\nbaris dua\n\n  \n\nTiga\r\n\r\nEmpat")).toEqual(["Satu\nbaris dua", "Tiga", "Empat"]);
    expect(aboutParagraphs("   ")).toEqual([]);
  });

  it("reads a short label before a colon", () => {
    expect(pointParts("Kapan: 4–7 Jan 2027")).toEqual({ label: "Kapan", text: "4–7 Jan 2027" });
    expect(pointParts("Jam 13:00 di ruang utama")).toEqual({ label: null, text: "Jam 13:00 di ruang utama" });
    expect(pointParts("Tanpa label")).toEqual({ label: null, text: "Tanpa label" });
  });

  it("names date ranges in Indonesian", () => {
    expect(dateRange("2026-10-28", "2026-12-23")).toBe("28 Okt – 23 Des 2026");
    expect(dateRange("2027-01-04", "2027-01-07")).toBe("4–7 Jan 2027");
    expect(dateRange("2027-01-05", "2027-01-05")).toBe("5 Jan 2027");
    expect(dateRange("2026-12-28", "2027-01-02")).toBe("28 Des 2026 – 2 Jan 2027");
  });

  it("has a default that passes its own checks, with or without events", () => {
    const withEvents = defaultAbout(events);
    expect(withEvents.points[0]).toContain("28 Okt – 23 Des 2026");
    expect(withEvents.points[1]).toBe("WAM 2027: 4–7 Jan 2027");
    expect(aboutProblems(withEvents)).toEqual({});
    const without = defaultAbout([]);
    expect(without.points.map(point => point.split(":")[0])).toEqual(["SMM", "OPM", "Yang ikut"]);
    expect(without.summary).toContain("Werkudara Annual Meeting");
    expect(aboutProblems(without)).toEqual({});
  });
});
