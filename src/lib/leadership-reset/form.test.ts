import { describe, expect, it } from "vitest";
import {
  answerFileName, answersToStore, answerText, contentSchema, daysUntil, DEFAULT_CONTENT, depthOf, exportColumns, formState, isoToWibInput,
  looksLikeKey, newKey, normalizeContent, questionsFor, wibInputToIso, wibInstantLabel, withStarter,
} from "./form";
import { leadershipResetApi, leadershipResetPath } from "@/lib/routes";

const questions = DEFAULT_CONTENT.questions.map(question => ({ ...question, enabled: true }));

describe("Refleksi Leader: questions per target", () => {
  it("asks each leader the question for their target; Sebagian gets both, and Semua goes to everyone", () => {
    expect(questionsFor("belum", questions).map(q => q.id)).toEqual(["belum", "langkah"]);
    expect(questionsFor("tercapai", questions).map(q => q.id)).toEqual(["tercapai", "langkah"]);
    expect(questionsFor("sebagian", questions).map(q => q.id)).toEqual(["belum", "tercapai", "langkah"]);
  });
  it("leaves out questions the CMS turned off", () => {
    expect(questionsFor("sebagian", DEFAULT_CONTENT.questions).map(q => q.id)).toEqual(["belum", "tercapai"]);
  });
});

describe("Refleksi Leader: answers as stored", () => {
  it("keeps the question as it read, drops empty optional answers and answers to questions not asked", () => {
    const { answers, missing } = answersToStore({ targetStatus: "belum", answers: [{ id: "belum", text: "  Saya terlalu cepat mengambil alih.  " }, { id: "tercapai", text: "tidak ditanya" }, { id: "langkah", text: " " }] }, questions);
    expect(missing).toBeNull();
    expect(answers).toEqual([{ id: "belum", label: questions[0].label, text: "Saya terlalu cepat mengambil alih." }]);
  });
  it("names a required question left empty", () => {
    expect(answersToStore({ targetStatus: "sebagian", answers: [{ id: "belum", text: "Ada" }] }, questions).missing).toBe("tercapai");
  });
});

describe("Refleksi Leader: content", () => {
  it("keeps the defaults valid, and falls back to them for anything stored that does not pass", () => {
    expect(contentSchema.safeParse(DEFAULT_CONTENT).success).toBe(true);
    expect(normalizeContent(null)).toEqual(DEFAULT_CONTENT);
    expect(normalizeContent({ title: "Reset 2027" }).title).toBe("Reset 2027");
    expect(normalizeContent({ questions: "rusak" })).toEqual(DEFAULT_CONTENT);
  });
  it("refuses a form where one kind of leader gets no question", () => {
    const onlyMet = { ...DEFAULT_CONTENT, questions: DEFAULT_CONTENT.questions.map(q => q.id === "belum" ? { ...q, enabled: false } : q) };
    expect(contentSchema.safeParse(onlyMet).success).toBe(false);
    const forEveryone = { ...DEFAULT_CONTENT, questions: [{ ...DEFAULT_CONTENT.questions[2], enabled: true }] };
    expect(contentSchema.safeParse(forEveryone).success).toBe(true);
  });
  it("refuses two questions with one id", () => {
    expect(contentSchema.safeParse({ ...DEFAULT_CONTENT, questions: [...DEFAULT_CONTENT.questions, DEFAULT_CONTENT.questions[0]] }).success).toBe(false);
  });
});

describe("Refleksi Leader: open, closed, past", () => {
  const now = new Date("2026-11-20T03:00:00Z");
  it("closes by the CMS switch or at the deadline", () => {
    expect(formState(true, null, now)).toBe("open");
    expect(formState(false, null, now)).toBe("closed");
    expect(formState(true, "2026-11-20T10:00:00+07:00", now)).toBe("past");
    expect(formState(true, "2026-11-20T10:01:00+07:00", now)).toBe("open");
  });
});

describe("Refleksi Leader: writing helpers", () => {
  it("measures depth by words", () => {
    expect(depthOf("").level).toBe(0);
    expect(depthOf("Saya kurang mendelegasikan").level).toBe(1);
    expect(depthOf(Array(12).fill("kata").join(" ")).level).toBe(2);
    expect(depthOf(Array(40).fill("kata").join(" ")).level).toBe(3);
  });
  it("adds a starter on its own line, without the ellipsis", () => {
    expect(withStarter("", "Saya cenderung…")).toBe("Saya cenderung ");
    expect(withStarter("Kalimat pertama.  ", "Saya cenderung…")).toBe("Kalimat pertama.\nSaya cenderung ");
  });
});

describe("Refleksi Leader: time in WIB", () => {
  it("reads datetime-local as WIB and back", () => {
    expect(wibInputToIso("2026-11-25T17:00")).toBe("2026-11-25T17:00:00+07:00");
    expect(wibInputToIso("25/11/2026")).toBeNull();
    expect(isoToWibInput("2026-11-25T17:00:00+07:00")).toBe("2026-11-25T17:00");
    expect(wibInstantLabel("2026-11-25T10:05:00Z")).toBe("25 Nov 2026, 17.05 WIB");
  });
  it("counts days to the training from today in WIB", () => {
    // 18.30 UTC on the 19th is already 01.30 WIB on the 20th.
    expect(daysUntil("2026-11-25", new Date("2026-11-19T18:30:00Z"))).toBe(5);
    expect(daysUntil("2026-11-25", new Date("2026-11-19T10:00:00Z"))).toBe(6);
    expect(daysUntil("2026-11-19", new Date("2026-11-19T10:00:00Z"))).toBe(0);
  });
});

describe("Refleksi Leader: what a leader keeps", () => {
  const answer = { name: "Contoh Satu", team: "Tim Uji", targetStatus: "sebagian" as const, answers: [{ id: "belum", label: "Q1?", text: "A1" }, { id: "tercapai", label: "Q2?", text: "A2" }], createdAt: "2026-11-19T03:00:00Z", updatedAt: "2026-11-19T04:00:00Z" };
  it("writes the answer as plain text with the questions", () => {
    const text = answerText(DEFAULT_CONTENT, answer);
    expect(text).toContain("Leadership Reset – Comeback in Last Minute");
    expect(text).toContain("Capaian target: Sebagian tercapai");
    expect(text).toContain("1. Q1?\nA1\n\n2. Q2?\nA2");
    expect(text.trimEnd().endsWith("Let's reflect, reset, and lead forward!")).toBe(true);
    expect(answerFileName(answer)).toBe("refleksi-contoh-satu.txt");
  });
});

describe("Refleksi Leader: keys and addresses", () => {
  it("makes long random keys that pass the check", () => {
    const a = newKey(), b = newKey();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(looksLikeKey(a)).toBe(true);
    expect(looksLikeKey("pendek")).toBe(false);
    expect(looksLikeKey("a".repeat(40) + "/")).toBe(false);
  });
  it("keeps a leader's key after # and the others out of queries", () => {
    expect(leadershipResetPath.own("k".repeat(43))).toBe(`/refleksi#jawaban=${"k".repeat(43)}`);
    expect(leadershipResetPath.cms("c".repeat(43))).toBe(`/refleksi/kelola/${"c".repeat(43)}`);
    expect(leadershipResetPath.cms("c".repeat(43), "isi")).toBe(`/refleksi/kelola/${"c".repeat(43)}?bagian=isi`);
    expect(leadershipResetApi.cmsResponse("a b")).toBe("/api/leadership-reset/kelola/jawaban/a%20b");
  });
});

describe("Refleksi Leader: Excel columns", () => {
  it("puts the current questions first, then older ones still in answers, and drops turned-off ones nobody answered", () => {
    const responses = [{ answers: [{ id: "belum", label: "Q1", text: "a" }, { id: "lama", label: "Pertanyaan lama", text: "b" }] }];
    expect(exportColumns(DEFAULT_CONTENT.questions, responses).map(c => c.id)).toEqual(["belum", "tercapai", "lama"]);
  });
});
