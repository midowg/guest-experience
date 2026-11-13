import { describe, expect, it } from "vitest";
import { audienceLabel, baseChoice, isOtherOption, otherText, withOther, cleanAnswer, complete, editable, inAudience, progressOf, seesQuestionnaire, reservedSlugs, shows, slugFromName, slugProblem, type QQuestion, type QSection } from "./questionnaire";

const question = (key: string, extra: Partial<QQuestion> = {}): QQuestion => ({
  id: `q-${key}`, sectionId: "s1", key, prompt: "Pertanyaan", kind: "text", required: false, visibility: "rekan", options: [], maxChoices: null,
  matrixRows: [], scale: [], placeholder: "", note: "", react: "", showIf: null, sort: 0, hidden: false, ...extra,
});
const section = (id: string, extra: Partial<QSection> = {}): QSection => ({ id, key: id, title: "Bagian", short: "", hello: "", intro: "", tease: "", anonymous: false, sort: 0, hidden: false, ...extra });

describe("the address", () => {
  it("comes from the name", () => {
    expect(slugFromName("Kuesioner")).toBe("kuesioner");
    expect(slugFromName("Cerita Kita 2026!")).toBe("cerita-kita-2026");
    expect(slugFromName("  Ceríta  —  Kita ")).toBe("cerita-kita");
  });
  it("refuses WAM's own pages and bad shapes", () => {
    expect(slugProblem("kuesioner")).toBeNull();
    expect(slugProblem("book")).toMatch(/sudah dipakai/);
    expect(reservedSlugs).toContain("settings");
    expect(slugProblem("ab")).toMatch(/3–40/);
    expect(slugProblem("-cerita")).toMatch(/3–40/);
    expect(slugProblem("cerita--kita")).toMatch(/berurutan/);
    expect(slugProblem("Cerita")).toMatch(/huruf kecil/);
  });
});

describe("showing a question", () => {
  const lead = question("31", { showIf: { question: "3", not: ["Staf"] } });
  it("follows another answer", () => {
    expect(shows(lead, {})).toBe(false);
    expect(shows(lead, { "3": "Staf" })).toBe(false);
    expect(shows(lead, { "3": "Manajer ke atas" })).toBe(true);
    expect(shows(question("x", { showIf: { question: "17", any: ["Musik"] } }), { "17": ["Game", "Musik"] })).toBe(true);
    expect(shows(question("x", { hidden: true }), {})).toBe(false);
  });
});

describe("cleaning an answer", () => {
  it("keeps choices to the list and the maximum", () => {
    const multi = question("17", { kind: "multi", options: ["Musik", "Game", "Film"], maxChoices: 2 });
    expect(cleanAnswer(multi, ["Musik", "Musik", "Game"])).toEqual({ value: ["Musik", "Game"] });
    expect(cleanAnswer(multi, ["Musik", "Game", "Film"])).toEqual({ problem: "Pilih paling banyak 2." });
    expect(cleanAnswer(multi, ["Catur"])).toEqual({ problem: "Ada pilihan yang tidak ada di daftar." });
  });
  it("checks departments, people and matrix rows", () => {
    expect(cleanAnswer(question("2", { kind: "department" }), "Finance", { departments: ["Finance"] })).toEqual({ value: "Finance" });
    expect(cleanAnswer(question("2", { kind: "department" }), "Gudang", { departments: ["Finance"] })).toEqual({ problem: "Pilihan ini tidak ada di daftar." });
    expect(cleanAnswer(question("13", { kind: "person", maxChoices: 3 }), ["p1"], { people: ["p1", "p2"] })).toEqual({ value: ["p1"] });
    const matrix = question("D1", { kind: "matrix", matrixRows: ["Hospitality"], scale: ["Sedikit", "Terasa"] });
    expect(cleanAnswer(matrix, { Hospitality: "Terasa" })).toEqual({ value: { Hospitality: "Terasa" } });
    expect(cleanAnswer(matrix, { Lain: "Terasa" })).toEqual({ problem: "Ada baris yang pilihannya tidak dikenal." });
  });
  it("trims text and caps its length", () => {
    expect(cleanAnswer(question("1"), "  Dewi  ")).toEqual({ value: "Dewi" });
    expect("problem" in cleanAnswer(question("1"), "x".repeat(301))).toBe(true);
  });
});

describe("progress", () => {
  const sections = [section("s1", { sort: 1 }), section("s2", { sort: 2, anonymous: true })];
  const questions = [
    question("1", { required: true }),
    question("m", { kind: "matrix", required: true, matrixRows: ["A", "B"], scale: ["1", "2"] }),
    question("D4", { sectionId: "s2", required: true }),
  ];
  it("counts a section done when its required questions are, and the anonymous one by its receipt", () => {
    expect(progressOf({ sections, questions }, {}, false)).toEqual({ sectionsDone: 0, sectionsTotal: 2, requiredLeft: 3, done: false });
    expect(progressOf({ sections, questions }, { "1": "Dewi", m: { A: "1" } }, false).requiredLeft).toBe(2);
    expect(progressOf({ sections, questions }, { "1": "Dewi", m: { A: "1", B: "2" } }, true)).toEqual({ sectionsDone: 2, sectionsTotal: 2, requiredLeft: 0, done: true });
  });
  it("leaves out a section whose every question is hidden, so an emptied anonymous part never blocks finishing", () => {
    const hidden = questions.map(item => item.sectionId === "s2" ? { ...item, hidden: true } : item);
    expect(progressOf({ sections, questions: hidden }, { "1": "Dewi", m: { A: "1", B: "2" } }, false)).toEqual({ sectionsDone: 1, sectionsTotal: 1, requiredLeft: 0, done: true });
  });
  it("needs a ticked consent and every matrix row", () => {
    expect(complete(question("6", { kind: "consent" }), false)).toBe(false);
    expect(complete(question("6", { kind: "consent" }), true)).toBe(true);
  });
});

describe("changing answers", () => {
  it("is open until the deadline", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(editable({ status: "buka", editUntil: null }, now)).toBe(true);
    expect(editable({ status: "buka", editUntil: "2026-11-09T00:00:00Z" }, now)).toBe(false);
    expect(editable({ status: "draf", editUntil: null }, now)).toBe(false);
  });
});

describe("who it is for", () => {
  const all = { status: "buka" as const, audience: "semua" as const, audienceIds: [] };
  const chosen = { status: "buka" as const, audience: "pilih" as const, audienceIds: ["a", "b"] };
  it("is everyone's, or only the chosen people's", () => {
    expect(inAudience(all, "z")).toBe(true);
    expect(inAudience(chosen, "a")).toBe(true);
    expect(inAudience(chosen, "z")).toBe(false);
    expect(audienceLabel(all)).toBe("Semua peserta");
    expect(audienceLabel(chosen)).toBe("2 orang terpilih");
  });
  it("hides a draft and a form for others, except from Admin WAM", () => {
    expect(seesQuestionnaire(chosen, "a", false)).toBe(true);
    expect(seesQuestionnaire(chosen, "z", false)).toBe(false);
    expect(seesQuestionnaire({ ...all, status: "draf" }, "a", false)).toBe(false);
    expect(seesQuestionnaire({ ...chosen, status: "draf" }, "z", true)).toBe(true);
    expect(seesQuestionnaire({ ...chosen, status: "tutup" }, "a", false)).toBe(true);
  });
});

describe("Lainnya, written in", () => {
  it("keeps what was written after Lainnya, and every rule still sees Lainnya", () => {
    const single = question("17", { kind: "single", options: ["Musik", "Lainnya"] });
    expect(cleanAnswer(single, "Lainnya: Badminton ")).toEqual({ value: "Lainnya: Badminton" });
    expect(cleanAnswer(single, "Lainnya")).toEqual({ value: "Lainnya" });
    expect(cleanAnswer(single, "Musik: rock")).toEqual({ problem: "Pilihan ini tidak ada di daftar." });
    expect(cleanAnswer(single, `Lainnya: ${"x".repeat(201)}`)).toEqual({ problem: "Pilihan ini tidak ada di daftar." });
    const multi = question("21", { kind: "multi", options: ["Outdoor", "Lainnya"] });
    expect(cleanAnswer(multi, ["Outdoor", "Lainnya: Memancing"])).toEqual({ value: ["Outdoor", "Lainnya: Memancing"] });
    expect(baseChoice("Lainnya: Memancing")).toBe("Lainnya");
    expect([otherText("Lainnya: Memancing"), otherText("Outdoor")]).toEqual(["Memancing", ""]);
    expect([withOther("Lainnya", "  Memancing"), withOther("Lainnya", " ")]).toEqual(["Lainnya: Memancing", "Lainnya"]);
    expect([isOtherOption("Lainnya"), isOtherOption("lainnya, sebutkan"), isOtherOption("Tidak ada")]).toEqual([true, true, false]);
    // A chosen option is kept as HR wrote it, a leading space included (" GM"); only a written-in Lainnya is tidied.
    expect(cleanAnswer(question("3", { kind: "single", options: ["Staff", " GM"] }), " GM")).toEqual({ value: " GM" });
    const follow = question("18", { showIf: { question: "17", any: ["Lainnya"] } });
    expect(shows(follow, { 17: "Lainnya: Badminton" })).toBe(true);
  });
});
