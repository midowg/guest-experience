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
  it("exports party, food, access, and photo choices", () => {
    const row: RsvpRecord = { id: "a", event_id: "b", invitation_id: "c", name: "Sari", organization: "Mitra", attendance: "yes", phone: "0812", email: "", has_allergy: true, allergy_details: "Kacang", created_at: "2026-10-12T11:00:00Z",
      party_size: 3, companion_names: ["Raka", "Dinda"], dietary: ["vegetarian", "allergy"], dietary_other: "", access: ["sign_interpreter"], access_other: "", photo_opt_out: true, whatsapp_consent: true };
    const [header, line] = rsvpCsv([row]).trimEnd().split("\r\n");
    const cells = (text: string) => text.slice(1, -1).split('","');
    const value = (name: string) => cells(line)[cells(header).indexOf(name)];
    expect(value("Jumlah orang")).toBe("3");
    expect(value("Nama pendamping")).toBe("Raka, Dinda");
    expect(value("Makanan")).toBe("Vegetarian; Alergi: Kacang");
    expect(value("Akses")).toBe("Juru bahasa isyarat");
    expect(value("Jangan tampilkan foto")).toBe("Ya");
    expect(value("Boleh dihubungi WA")).toBe("Ya");
  });
});

describe("idempotency binding", () => {
  it("is stable for identical payloads and differs when content changes", () => {
    const base = { name: "Tamu", attendance: "yes" };
    expect(payloadHash(base)).toBe(payloadHash({ name: "Tamu", attendance: "yes" }));
    expect(payloadHash(base)).not.toBe(payloadHash({ ...base, attendance: "no" }));
  });
});
