import { describe, expect, it, vi } from "vitest";
import type { QQuestion, QSection, Visibility } from "@/lib/pra-wam/questionnaire";
import type { Member } from "./session";

/* Data kuesioner for BoD: which answers BoD reads next to a name. */
const FORM = { id: "f1", name: "Kuesioner", slug: "kuesioner", status: "buka", editUntil: null };
const AYU = "11111111-2222-4333-8444-555555555555";
const section = (id: string, title: string, anonymous = false): QSection => ({ id, key: id, title, short: "", hello: "", intro: "", tease: "", anonymous, sort: 1, hidden: false });
const question = (id: string, sectionId: string, visibility: Visibility, extra: Partial<QQuestion> = {}): QQuestion => ({
  id, sectionId, key: id, prompt: `Pertanyaan ${id}`, kind: "text", required: false, visibility, options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort: Number(id.replace(/\D/g, "")), hidden: false, ...extra,
});
const sections = [section("s1", "Tentang kamu"), section("s2", "Cerita"), section("s3", "Tanpa nama", true)];
const questions = [
  question("q1", "s1", "rekan"), question("q2", "s1", "fasil"), question("q3", "s1", "hr"), question("q4", "s1", "hronly"),
  question("q5", "s2", "pilih"), question("q6", "s2", "rekan", { kind: "single", options: ["Dibagikan dengan namaku", "Dibagikan tanpa nama", "Hanya dibaca fasilitator"] }),
  question("q7", "s3", "anon"),
];
let answers: { employee_id: string; question_id: string; value: unknown; read_level?: string | null }[] = [];

function query() {
  const filters: ((row: Record<string, unknown>) => boolean)[] = [];
  const builder = {
    select: () => builder, order: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => key === "form_id" || row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    range: () => Promise.resolve({ data: answers.filter(row => filters.every(test => test(row))), error: null }),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("./questionnaire", () => ({ currentForm: async () => FORM, formContent: async () => ({ sections, questions }), questionnaireWaiting: () => new Error("waiting") }));
vi.mock("./questionnaire-admin", () => ({ questionnaireProgress: async () => null }));
vi.mock("./appraisal", () => ({ listPeople: async () => [{ id: AYU, name: "Ayu Lestari", department: "Comms", active: true }] }));

const { bodPersonAnswers, bodReadsNamed } = await import("./bod-survey");
const bod = { id: "b", name: "Bima", roles: ["bod"] } as unknown as Member;
const peserta = { id: "p", name: "Peserta", roles: [] } as unknown as Member;

describe("Data kuesioner untuk BoD", () => {
  it("reads with a name only what the label lets management read", () => {
    expect(bodReadsNamed("rekan", undefined)).toBe(true);
    expect(bodReadsNamed("hr", undefined)).toBe(true);
    expect(bodReadsNamed("fasil", undefined)).toBe(false);
    expect(bodReadsNamed("hronly", undefined)).toBe(false);
    expect(bodReadsNamed("anon", undefined)).toBe(false);
    expect(bodReadsNamed("pilih", "named")).toBe(true);
    expect(bodReadsNamed("pilih", "unnamed")).toBe(false);
    expect(bodReadsNamed("pilih", "facilitator")).toBe(false);
  });

  it("shows a person's Rekan, HR and shared answers, never Panitia-only, Rahasia or the sharing choice itself", async () => {
    answers = [
      { employee_id: AYU, question_id: "q1", value: "Suka lari" }, { employee_id: AYU, question_id: "q2", value: "Ukuran M" },
      { employee_id: AYU, question_id: "q3", value: "Cukup seimbang" }, { employee_id: AYU, question_id: "q4", value: "Rahasia sekali" },
      { employee_id: AYU, question_id: "q5", value: "Cerita panjang" }, { employee_id: AYU, question_id: "q6", value: "Dibagikan tanpa nama" },
    ];
    const first = await bodPersonAnswers(bod, AYU);
    expect(first.sections.map(item => item.title)).toEqual(["Tentang kamu"]);
    expect(first.sections[0].answers.map(item => item.answer)).toEqual(["Suka lari", "Cukup seimbang"]);
    answers = answers.map(row => row.question_id === "q6" ? { ...row, value: "Dibagikan dengan namaku" } : row);
    const shared = await bodPersonAnswers(bod, AYU);
    expect(shared.sections[1]).toEqual({ title: "Cerita", answers: [{ prompt: "Pertanyaan q5", answer: "Cerita panjang", level: "pilih" }] });
  });

  it("keeps an answer given under a stricter label closed, even if the question was widened later", async () => {
    answers = [{ employee_id: AYU, question_id: "q1", value: "Dulu rahasia", read_level: "hronly" }];
    expect((await bodPersonAnswers(bod, AYU)).sections).toEqual([]);
  });

  it("is for BoD only", async () => {
    await expect(bodPersonAnswers(peserta, AYU)).rejects.toMatchObject({ status: 403 });
  });
});
