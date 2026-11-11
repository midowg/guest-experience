import { describe, expect, it } from "vitest";
import { PURGE_KEYS, purgeDue, withoutPurged } from "./purge";
import { progressOf, type QQuestion, type QSection } from "./questionnaire";

const section: QSection = { id: "a", key: "A", title: "Nyaman saat menginap", short: "", hello: "", intro: "", tease: "", anonymous: false, sort: 1, hidden: false };
const question = (key: string, required = true): QQuestion => ({
  id: `q${key}`, sectionId: "a", key, prompt: key, kind: "text", required, visibility: "hr", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort: 1, hidden: false,
});

describe("the deletion date", () => {
  it("comes at 00.00 WIB on that day, and never without a date", () => {
    const form = { stayDeleteOn: "2027-02-06" };
    expect(purgeDue(form, new Date("2027-02-05T16:59:00Z"))).toBe(false);
    expect(purgeDue(form, new Date("2027-02-05T17:00:00Z"))).toBe(true);
    expect(purgeDue(form, new Date("2027-03-01T00:00:00Z"))).toBe(true);
    expect(purgeDue({ stayDeleteOn: null }, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
  it("names the stay, health, and allergy questions, and nothing else", () => {
    expect([...PURGE_KEYS].sort()).toEqual(["10", "11", "12", "13", "14b", "14c", "14d", "16", "33", "38", "5b", "7", "8", "9"]);
  });
});

describe("after the deletion", () => {
  it("drops the deleted questions, so someone who finished stays finished", () => {
    const content = { sections: [section], questions: [question("33"), question("16", false), question("14"), question("14b", false)] };
    const answers = { 14: "Halal" };
    const due = new Date("2027-02-06T00:00:00Z"), before = new Date("2027-01-01T00:00:00Z");
    const form = { stayDeleteOn: "2027-02-05" };
    expect(withoutPurged(content, form, before)).toBe(content);
    expect(progressOf(withoutPurged(content, form, before), answers, true).done).toBe(false);
    const after = withoutPurged(content, form, due);
    expect(after.questions.map(item => item.key)).toEqual(["14"]);
    expect(progressOf(after, answers, true).done).toBe(true);
  });
});
