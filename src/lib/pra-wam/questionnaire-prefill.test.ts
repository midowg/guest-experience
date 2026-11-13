import { describe, expect, it } from "vitest";
import type { QQuestion } from "./questionnaire";
import { highestPost, nameAnswer, postOption, prefillAnswers, tidyName, type PrefillPerson } from "./questionnaire-prefill";

const question = (key: string, rest: Partial<QQuestion>): QQuestion => ({
  id: `q-${key}`, sectionId: "s", key, prompt: key, kind: "text", required: true, visibility: "hr", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort: 0, hidden: false, ...rest,
});
const questions = [
  question("1", {}),
  question("2", { kind: "department" }),
  question("3", { kind: "single", options: ["Staf", "Lead", "HOD", "GM"] }),
  question("5", {}),
  question("33", { kind: "single", options: ["Laki-laki", "Perempuan"] }),
];
const dewi: PrefillPerson = { fullName: "Dewi Lestari", nickname: "Dewi", phone: " 0812 3456 7890 ", gender: "P", department: "Finance", post: "lead" };

describe("prefill from Data karyawan", () => {
  it("fills name, department, position, phone and gender", () => {
    expect(prefillAnswers(questions, {}, dewi, ["Finance", "Comms"])).toEqual({ 1: "Dewi Lestari (Dewi)", 2: "Finance", 3: "Lead", 5: "0812 3456 7890", 33: "Perempuan" });
  });

  it("never overwrites an answer, and leaves out what does not fit", () => {
    const out = prefillAnswers(questions, { 1: "Dewi L.", 3: "" }, { ...dewi, department: "Departemen Lama", gender: "", phone: "", post: null }, ["Finance"]);
    expect(out).toEqual({});
    // HR changed the position options or the kind: no guess.
    expect(prefillAnswers([question("3", { kind: "single", options: ["Staf", "Manajer"] }), question("2", { kind: "single", options: ["Finance"] })], {}, dewi, ["Finance"])).toEqual({});
  });

  it("tidies names and picks the highest post", () => {
    expect(tidyName("  SITI  NUR'AINI ")).toBe("Siti Nur'Aini");
    expect(tidyName("Dewi van Lestari")).toBe("Dewi van Lestari");
    expect(nameAnswer("DEWI LESTARI", "DEWI LESTARI")).toBe("Dewi Lestari");
    expect(nameAnswer("DEWI LESTARI", "DEWI")).toBe("Dewi Lestari (Dewi)");
    expect(nameAnswer("Bima Putra", "")).toBe("Bima Putra");
    expect(highestPost(["staf", "lead", "staf"])).toBe("lead");
    expect(highestPost(["hod", "gm"])).toBe("gm");
    expect(highestPost([])).toBeNull();
  });
});

describe("position options as HR renamed them", () => {
  it("fills the post into the option HR wrote, spaces and spelling aside", () => {
    const renamed = [question("3", { kind: "single", options: ["Staff", "Leader", "HOD", " GM"] })];
    expect(prefillAnswers(renamed, {}, dewi, [])).toEqual({ 3: "Leader" });
    expect(prefillAnswers(renamed, {}, { ...dewi, post: "staf" }, [])).toEqual({ 3: "Staff" });
    expect(prefillAnswers(renamed, {}, { ...dewi, post: "gm" }, [])).toEqual({ 3: " GM" });
    expect(postOption(["Staf", "Head of Department"], "hod")).toBe("Head of Department");
    expect(postOption(["Staf", "Manajer"], "hod")).toBeNull();
  });
});

describe("interns", () => {
  it("fills in the option that names them, never Staf; nothing when HR has no such option; a daily worker by post", () => {
    const withThem = [question("3", { kind: "single", options: ["Staff", "Leader", "HOD", "Intern / Magang"] })];
    expect(prefillAnswers(withThem, {}, { ...dewi, post: "staf", category: "intern" }, [])).toEqual({ 3: "Intern / Magang" });
    expect(prefillAnswers(withThem, {}, { ...dewi, post: "staf", category: "dw" }, [])).toEqual({ 3: "Staff" });
    const without = [question("3", { kind: "single", options: ["Staff", "Leader", "HOD"] })];
    expect(prefillAnswers(without, {}, { ...dewi, post: "staf", category: "intern" }, [])).toEqual({});
    expect(prefillAnswers(without, {}, { ...dewi, post: "staf", category: "karyawan" }, [])).toEqual({ 3: "Staff" });
  });
});
