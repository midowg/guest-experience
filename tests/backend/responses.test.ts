import { describe, expect, it } from "vitest";
import { csvCell, payloadHash, rsvpCsv } from "@/lib/server/responses";
import type { RsvpRecord } from "@/lib/types";

describe("CSV export", () => {
  it("neutralises spreadsheet formula prefixes", () => {
    for (const dangerous of ["=cmd|' /c calc'!A1", "+1+1", "-2+3", "@SUM(A1)", "\tSUM"]) {
      expect(csvCell(dangerous).startsWith("\"'")).toBe(true);
    }
  });
  it("escapes quotes and flattens newlines so rows stay aligned", () => {
    expect(csvCell('Nama "panggilan"')).toBe('"Nama ""panggilan"""');
    expect(csvCell("baris1\r\nbaris2")).toBe('"baris1 baris2"');
  });
  it("keeps ordinary text unchanged", () => expect(csvCell("Werkudara")).toBe('"Werkudara"'));
  it("emits one header plus one row per RSVP", () => {
    const row: RsvpRecord = { id: "a", event_id: "b", name: "Tamu", organization: "Panitia", attendance: "yes", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: "2026-10-12T11:00:00Z" };
    const lines = rsvpCsv([row]).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Hadir"');
    expect(lines[0]).toContain('"Jenis RSVP"');
    expect(lines[1]).toContain('"Umum"');
    expect(lines[1]).not.toContain("undefined");
  });
});

describe("idempotency binding", () => {
  it("is stable for identical payloads and differs when content changes", () => {
    const base = { name: "Tamu", attendance: "yes" };
    expect(payloadHash(base)).toBe(payloadHash({ name: "Tamu", attendance: "yes" }));
    expect(payloadHash(base)).not.toBe(payloadHash({ ...base, attendance: "no" }));
  });
});
