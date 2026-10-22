import { describe, expect, it } from "vitest";
import { beoActions, beoSummary, nextBeoStatus } from "./beo";
import { createSeedEvent } from "./seed-event";
import type { RsvpRecord } from "./types";

const base = { event_id: "e", organization: "", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: "2026-10-20T00:00:00Z" };
const rsvp = (patch: Partial<RsvpRecord>): RsvpRecord => ({ ...base, id: crypto.randomUUID(), name: "Tamu", attendance: "yes", ...patch });

describe("BEO summary", () => {
  const rows = [
    rsvp({ name: "Ayu Lestari", party_size: 3, dietary: ["vegetarian", "allergy"], allergy_details: "Kacang", access: ["wheelchair", "other"], access_other: "Lift" }),
    rsvp({ name: "Budi", dietary: ["vegetarian"] }),
    rsvp({ name: "Lama", has_allergy: true, allergy_details: "Udang" }),
    rsvp({ name: "Citra", dietary: ["other"], dietary_other: "Tanpa gula" }),
    rsvp({ name: "Tidak", attendance: "no", party_size: 4, dietary: ["vegetarian"] }),
  ];
  const summary = beoSummary({ ...createSeedEvent(), guest_estimate: 10 }, rows);

  it("counts people attending with companions, and only yes answers", () => {
    expect(summary.estimate).toBe(10);
    expect(summary.attending).toBe(6);
    expect(summary.answeredYes).toBe(4);
  });

  it("counts food per answer and reads the old allergy field", () => {
    expect(summary.dietary).toEqual([
      { key: "vegetarian", label: "Vegetarian", count: 2 },
      { key: "allergy", label: "Alergi", count: 2 },
      { key: "other", label: "Makanan lainnya", count: 1 },
    ]);
    expect(summary.allergies).toEqual([{ name: "Ayu Lestari", firstName: "Ayu", details: "Kacang" }, { name: "Lama", firstName: "Lama", details: "Udang" }]);
    expect(summary.otherFood).toEqual([{ name: "Citra", details: "Tanpa gula" }]);
  });

  it("lists access needs with labels", () => {
    expect(summary.access).toEqual([{ name: "Ayu Lestari", needs: ["Kursi roda"], other: "Lift" }]);
  });

  it("flags answers changed after the numbers were set", () => {
    const later = [...rows, rsvp({ created_at: "2026-10-22T00:00:00Z" }), rsvp({ updated_at: "2026-10-23T00:00:00Z" })];
    expect(beoSummary(createSeedEvent(), later, "2026-10-21T00:00:00Z").changedSinceLock).toBe(2);
    expect(beoSummary(createSeedEvent(), later).changedSinceLock).toBe(0);
  });
});

describe("BEO status", () => {
  it("moves draft → set → revised → final → done, and reopens as a revision", () => {
    expect(nextBeoStatus("draft", "set")).toBe("set");
    expect(nextBeoStatus("set", "revise")).toBe("revised");
    expect(nextBeoStatus("revised", "final")).toBe("final");
    expect(nextBeoStatus("final", "done")).toBe("done");
    expect(nextBeoStatus("done", "reopen")).toBe("revised");
  });
  it("does not let a set number change without a revision", () => {
    expect(beoActions("set")).not.toContain("save");
    expect(nextBeoStatus("set", "save")).toBeNull();
    expect(nextBeoStatus("draft", "final")).toBeNull();
  });
});
