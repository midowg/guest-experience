import { describe, expect, it } from "vitest";
import { beoSummary, emptyBeo } from "./beo";
import { beoDocument, beoFileName, beoVersionFromParam } from "./beo-document";
import { beoPdf, pdfSafe } from "./server/beo-pdf";
import { createSeedEvent } from "./seed-event";
import type { RsvpRecord } from "./types";

const event = { ...createSeedEvent(), slug: "trip-lombok", guest_estimate: 20 };
const rsvps: RsvpRecord[] = [
  { id: "r1", event_id: event.id, name: "Ayu Lestari", organization: "", attendance: "yes", phone: "", email: "", has_allergy: true, allergy_details: "Kacang", party_size: 2, dietary: ["allergy"], access: ["wheelchair"], created_at: "2026-10-20T00:00:00Z" },
];
const state = { ...emptyBeo, status: "set" as const, version: 2, prepared_count: 24, notes: "Prasmanan\nTanpa babi" };
const revisions = [{ id: "v2", version: 2, status: "set" as const, prepared_count: 24, attending: 2, reason: "", device_id: null, at: "2026-10-20T01:00:00Z" }];
const summary = beoSummary(event, rsvps);

describe("BEO document", () => {
  it("gives the supplier first names only, no access, RSVP counts or history", () => {
    const doc = beoDocument(event, summary, state, revisions, "vendor");
    expect(doc.banner).toMatch(/VERSI PENYEDIA/);
    expect(doc.numbers).toEqual([{ label: "Jumlah porsi/pax disiapkan", value: "24", main: true }]);
    const text = JSON.stringify(doc.tables);
    expect(text).toContain("Ayu");
    expect(text).not.toContain("Lestari");
    expect(doc.tables.map(table => table.title)).not.toContain("Akses khusus");
    expect(doc.tables.map(table => table.title)).not.toContain("Riwayat");
  });

  it("gives the internal version everything, clearly marked", () => {
    const doc = beoDocument(event, summary, state, revisions, "internal");
    expect(doc.banner).toMatch(/VERSI INTERNAL/);
    expect(doc.numbers.map(item => item.value)).toEqual(["24", "2", "20"]);
    expect(JSON.stringify(doc.tables)).toContain("Ayu Lestari");
    expect(doc.tables.find(table => table.title === "Akses khusus")?.rows).toEqual([["Ayu Lestari", "Kursi roda"]]);
    expect(doc.tables.find(table => table.title === "Riwayat")?.rows).toHaveLength(1);
  });

  it("reads the version from the address and names the file", () => {
    expect(beoVersionFromParam("internal")).toBe("internal");
    expect(beoVersionFromParam("apa saja")).toBe("vendor");
    expect(beoFileName("trip-lombok", "vendor", state)).toBe("beo-trip-lombok-penyedia-v2.pdf");
  });
});

describe("BEO PDF", () => {
  it("keeps text the standard fonts can draw", () => {
    expect(pdfSafe("Café – “Pak” · 18.00")).toBe("Café – “Pak” · 18.00");
    expect(pdfSafe("Kacang 🥜 ≈ 3")).toBe("Kacang ? ? 3");
  });

  it("produces a PDF for both versions", async () => {
    for (const version of ["vendor", "internal"] as const) {
      const bytes = await beoPdf(beoDocument(event, summary, state, revisions, version));
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.length).toBeGreaterThan(1500);
    }
  });
});
