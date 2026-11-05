import { describe, expect, it } from "vitest";
import type { QQuestion } from "./questionnaire";
import { adminReader, exportable, recapAccess, SHARE_CHOICES, shareOf, shareQuestion, summarize } from "./recap";

const question = (extra: Partial<QQuestion>): QQuestion => ({
  id: "q", sectionId: "s", key: "1", prompt: "Tanya", kind: "single", required: false, visibility: "fasil", options: [], maxChoices: null,
  matrixRows: [], scale: [], placeholder: "", note: "", react: "", showIf: null, sort: 1, hidden: false, ...extra,
});
const names = new Map([["p1", "Ayu"], ["p2", "Budi"]]);
const full = { access: "full" as const, names, small: false };

describe("who reads what", () => {
  const locked = adminReader(false), open = adminReader(true);
  it("keeps HR text and Rahasia HR behind Data HR, and lets HR choices through as counts", () => {
    expect(recapAccess({ visibility: "hr", kind: "single" }, locked)).toBe("counts");
    expect(recapAccess({ visibility: "hr", kind: "matrix" }, locked)).toBe("counts");
    expect(recapAccess({ visibility: "hr", kind: "text" }, locked)).toBe("needs-hr");
    expect(recapAccess({ visibility: "hr", kind: "person" }, locked)).toBe("needs-hr");
    expect(recapAccess({ visibility: "hronly", kind: "single" }, locked)).toBe("needs-hr");
    expect(recapAccess({ visibility: "hronly", kind: "long" }, open)).toBe("full");
    expect(recapAccess({ visibility: "hr", kind: "text" }, open)).toBe("full");
    for (const visibility of ["rekan", "fasil", "pilih", "anon"] as const) expect(recapAccess({ visibility, kind: "long" }, locked)).toBe("full");
  });
  it("exports HR columns only with Data HR open, and never an anonymous answer per person", () => {
    expect(exportable({ visibility: "hr" }, locked)).toBe(false);
    expect(exportable({ visibility: "hronly" }, locked)).toBe(false);
    expect(exportable({ visibility: "hr" }, open)).toBe(true);
    expect(exportable({ visibility: "anon" }, open)).toBe(false);
    expect(exportable({ visibility: "pilih" }, locked)).toBe(true);
  });
  it("reads the sharing choice carefully: no answer means without a name", () => {
    const decider = question({ id: "q30", kind: "single", options: Object.values(SHARE_CHOICES) });
    expect(shareQuestion([question({ id: "x" }), decider], "s")).toBe(decider);
    expect(shareQuestion([decider], "other")).toBeNull();
    expect(shareOf(SHARE_CHOICES.named)).toBe("named");
    expect(shareOf(SHARE_CHOICES.facilitator)).toBe("facilitator");
    expect(shareOf(SHARE_CHOICES.unnamed)).toBe("unnamed");
    expect(shareOf(undefined)).toBe("unnamed");
  });
});

describe("one question's summary", () => {
  it("keeps a single choice in the question's order, zeros included, old choices last", () => {
    const item = summarize(question({ options: ["Tidak pernah", "Kadang", "Selalu"] }), ["Kadang", "Selalu", "Kadang", "Dulu ada", ""], full);
    expect(item.answered).toBe(4);
    expect(item.body).toEqual({ type: "bars", rest: 0, bars: [
      { label: "Tidak pernah", count: 0 }, { label: "Kadang", count: 2 }, { label: "Selalu", count: 1 }, { label: "Dulu ada", count: 1 },
    ] });
  });
  it("sorts several choices by count and counts a person once per choice", () => {
    const item = summarize(question({ kind: "multi", options: ["Musik", "Film", "Buku"] }), [["Film", "Musik"], ["Film"], ["Film", "Film"]], full);
    expect(item.several).toBe(true);
    expect(item.body).toEqual({ type: "bars", rest: 0, bars: [{ label: "Film", count: 3 }, { label: "Musik", count: 1 }, { label: "Buku", count: 0 }] });
  });
  it("names chosen people and folds everyone past the top ten into one number", () => {
    const people = Array.from({ length: 12 }, (_, index) => `x${index}`);
    const item = summarize(question({ kind: "person" }), [["p1", "p2"], ["p1"], people], full);
    expect(item.body.type === "bars" && item.body.bars.slice(0, 2)).toEqual([{ label: "Ayu", count: 2 }, { label: "Budi", count: 1 }]);
    expect(item.body.type === "bars" && item.body.rest).toBe(4);
  });
  it("counts a matrix per row and scale step", () => {
    const item = summarize(question({ kind: "matrix", matrixRows: ["Hospitality", "Inclusivity"], scale: ["Belum", "Terasa"] }), [
      { Hospitality: "Terasa", Inclusivity: "Belum" }, { Hospitality: "Terasa" }, { Hospitality: "Lain" },
    ], full);
    expect(item.body).toEqual({ type: "matrix", scale: ["Belum", "Terasa"], rows: [{ label: "Hospitality", counts: [0, 2] }, { label: "Inclusivity", counts: [1, 0] }] });
  });
  it("groups the same open answer, most often first, in an order that is not the order of arrival", () => {
    const item = summarize(question({ kind: "text" }), ["Bohemian  Rhapsody", "Lagu A", "bohemian rhapsody", "Lagu B", "   "], full);
    expect(item.answered).toBe(4);
    if (item.body.type !== "quotes") throw new Error("quotes expected");
    expect(item.body.quotes[0]).toEqual({ text: "Bohemian Rhapsody", count: 2 });
    expect(item.body.quotes.map(quote => quote.text).sort()).toEqual(["Bohemian Rhapsody", "Lagu A", "Lagu B"]);
  });
  it("holds the numbers back for a small group, and holds everything back without Data HR", () => {
    expect(summarize(question({}), ["A", "B"], { ...full, small: true }).body).toEqual({ type: "few" });
    const locked = summarize(question({ kind: "long", visibility: "hronly" }), ["rahasia"], { ...full, access: "needs-hr" });
    expect(locked.body).toEqual({ type: "needs-hr" });
    expect(JSON.stringify(locked)).not.toContain("rahasia");
    expect(summarize(question({}), [], full).body).toEqual({ type: "none" });
  });
  it("counts consent as agreed", () => {
    expect(summarize(question({ kind: "consent" }), [true, true, false], full).body).toEqual({ type: "bars", rest: 0, bars: [{ label: "Setuju", count: 2 }] });
  });
});
