import { describe, expect, it, vi } from "vitest";
import type { QForm, QQuestion, QSection } from "@/lib/pra-wam/questionnaire";

vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => { throw new Error("no database in this test"); } }));
vi.mock("./appraisal", () => ({ listPeople: vi.fn() }));

const { listPeople } = await import("./appraisal");
const {
  audienceRow, cleanQuestion, formSettingsSchema, movedSlugs, newKey, orderSchema, progressReport, questionCreateSchema, questionPatchSchema, questionProblems, sectionPatchSchema,
} = await import("./questionnaire-admin");

const named = "11111111-1111-4111-8111-111111111111";
const anon = "22222222-2222-4222-8222-222222222222";
const sections: QSection[] = [
  { id: named, key: "0", title: "Kenalan dulu", short: "", hello: "", intro: "", tease: "", anonymous: false, sort: 1, hidden: false },
  { id: anon, key: "D", title: "Ruang anonim", short: "", hello: "", intro: "", tease: "", anonymous: true, sort: 2, hidden: false },
];
const question = (over: Partial<QQuestion>): QQuestion => ({
  id: `q-${over.key}`, sectionId: named, key: "x", prompt: "Pertanyaan", kind: "text", required: false, visibility: "fasil", options: [], maxChoices: null,
  matrixRows: [], scale: [], placeholder: "", note: "", react: "", showIf: null, sort: 1, hidden: false, ...over,
});
const questions = [
  question({ key: "3", kind: "single", options: ["Staf", "Supervisor / lead", "Manajer ke atas"], required: true }),
  question({ key: "31", kind: "long", showIf: { question: "3", not: ["Staf"] }, sort: 2 }),
  question({ key: "D1", kind: "single", options: ["Ya", "Tidak"], sectionId: anon, visibility: "anon", required: true }),
];
const form = { sections, questions };
const fields = (over: Record<string, unknown> = {}) => cleanQuestion({
  sectionId: named, prompt: "Apa hobimu?", kind: "text", required: false, visibility: "fasil", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, hidden: false, ...over,
} as Parameters<typeof cleanQuestion>[0]);

describe("form settings", () => {
  it("tidy the name and address, and keep reserved or bad addresses out", () => {
    expect(formSettingsSchema.parse({ name: "  Cerita   Kita ", slug: " Cerita-Kita " })).toEqual({ name: "Cerita Kita", slug: "cerita-kita" });
    const reserved = formSettingsSchema.safeParse({ slug: "book" });
    expect(reserved.success).toBe(false);
    expect(reserved.error?.issues[0].message).toContain("sudah dipakai halaman WAM");
    expect(formSettingsSchema.safeParse({ slug: "a" }).error?.issues[0].message).toContain("3–40 karakter");
    expect(formSettingsSchema.safeParse({ name: "K" }).error?.issues[0].message).toBe("Nama minimal 2 karakter.");
  });

  it("check status, minutes and dates, and refuse an empty change", () => {
    expect(formSettingsSchema.safeParse({ status: "arsip" }).error?.issues[0].message).toBe("Pilih status: draf, buka, atau tutup.");
    expect(formSettingsSchema.safeParse({ minutes: 0 }).error?.issues[0].message).toBe("Perkiraan minimal 1 menit.");
    expect(formSettingsSchema.parse({ editUntil: "2026-12-20T23:59:00+07:00", stayDeleteOn: "2027-02-08" })).toEqual({ editUntil: "2026-12-20T23:59:00+07:00", stayDeleteOn: "2027-02-08" });
    expect(formSettingsSchema.safeParse({ editUntil: "besok" }).success).toBe(false);
    expect(formSettingsSchema.safeParse({}).error?.issues[0].message).toBe("Tidak ada yang diubah.");
  });

  it("take who it is for: everyone, or chosen people by id", () => {
    expect(formSettingsSchema.parse({ audience: "pilih", audienceIds: [named] })).toEqual({ audience: "pilih", audienceIds: [named] });
    expect(formSettingsSchema.safeParse({ audience: "sebagian" }).error?.issues[0].message).toBe("Pilih untuk semua peserta atau orang terpilih.");
    expect(formSettingsSchema.safeParse({ audienceIds: ["bukan-id"] }).error?.issues[0].message).toBe("Orang tidak dikenal.");
  });

  it("keep only active employees, each once, and never open it for nobody", async () => {
    vi.mocked(listPeople).mockResolvedValue([{ id: "a", active: true }, { id: "b", active: true }, { id: "gone", active: false }] as never);
    const open = { status: "buka", audience: "semua", audienceIds: [] } as unknown as QForm;
    expect(await audienceRow(open, { audience: "pilih", audienceIds: ["a", "a", "gone", "b"] })).toEqual({ row: { audience: "pilih", audience_ids: ["a", "b"] }, changed: true, label: "2 orang terpilih" });
    await expect(audienceRow(open, { audience: "pilih", audienceIds: ["gone"] })).rejects.toMatchObject({ status: 422 });
    const draft = { ...open, status: "draf" } as QForm;
    expect((await audienceRow(draft, { audience: "pilih", audienceIds: [] })).label).toBe("0 orang terpilih");
    await expect(audienceRow({ ...draft, audience: "pilih", audienceIds: [] }, { status: "buka" })).rejects.toMatchObject({ status: 422 });
    expect(await audienceRow({ ...open, audience: "pilih", audienceIds: ["a"] }, { name: "Baru" })).toEqual({ row: {}, changed: false, label: "1 orang terpilih" });
  });

  it("keep an old address redirecting, and never list the new one as old", () => {
    expect(movedSlugs([], "kuesioner", "cerita-kita")).toEqual(["kuesioner"]);
    expect(movedSlugs(["kuesioner"], "cerita-kita", "kuesioner")).toEqual(["cerita-kita"]);
    expect(movedSlugs(["a-b"], "cerita-kita", "cerita-kita")).toEqual(["a-b"]);
  });
});

describe("sections and order", () => {
  it("check a section's texts", () => {
    expect(sectionPatchSchema.parse({ title: "  Tentang   kamu " })).toEqual({ title: "Tentang kamu" });
    expect(sectionPatchSchema.safeParse({ short: "x".repeat(31) }).error?.issues[0].message).toBe("Nama singkat paling panjang 30 karakter.");
  });

  it("take sections, or the questions of one section", () => {
    expect(orderSchema.safeParse({ sections: [named, anon] }).success).toBe(true);
    expect(orderSchema.safeParse({ sectionId: named, questions: [anon] }).success).toBe(true);
    expect(orderSchema.safeParse({ questions: ["x"] }).success).toBe(false);
  });
});

describe("questions", () => {
  it("never accept a key, and need a section, a prompt and a kind to start", () => {
    expect(questionPatchSchema.parse({ key: "99", prompt: "Baru?" })).toEqual({ prompt: "Baru?" });
    const missing = questionCreateSchema.safeParse({ prompt: "Hai?" });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.map(issue => issue.path[0])).toEqual(expect.arrayContaining(["sectionId", "kind"]));
  });

  it("drop what the kind does not use, and blank options", () => {
    const parsed = questionPatchSchema.parse({ options: [" Ya ", "", "Tidak"] });
    expect(parsed.options).toEqual(["Ya", "Tidak"]);
    const text = fields({ options: ["a", "b"], maxChoices: 3, placeholder: "Contoh" });
    expect(text).toMatchObject({ options: [], maxChoices: null, placeholder: "Contoh" });
    expect(fields({ kind: "single", options: ["a", "b"], placeholder: "x" }).placeholder).toBe("");
    expect(fields({ kind: "person", maxChoices: 2 }).maxChoices).toBe(2);
  });

  it("need enough distinct options, rows and scale", () => {
    expect(questionProblems(fields({ kind: "single", options: ["Ya"] }), null, form).options).toEqual(["Isi minimal 2 pilihan, satu per baris."]);
    expect(questionProblems(fields({ kind: "multi", options: ["Ya", "ya"] }), null, form).options?.[0]).toContain("sama");
    expect(questionProblems(fields({ kind: "multi", options: ["A", "B"], maxChoices: 3 }), null, form).maxChoices).toBeTruthy();
    const matrix = questionProblems(fields({ kind: "matrix", matrixRows: [], scale: ["1"] }), null, form);
    expect(Object.keys(matrix).sort()).toEqual(["matrixRows", "scale"]);
    expect(questionProblems(fields({ kind: "single", options: ["Ya", "Tidak"] }), null, form)).toEqual({});
  });

  it("keep anonymous answers in the anonymous section only", () => {
    expect(questionProblems(fields({ sectionId: anon, visibility: "fasil" }), null, form).visibility?.[0]).toContain("harus anonim");
    expect(questionProblems(fields({ visibility: "anon" }), null, form).visibility?.[0]).toContain("Hanya pertanyaan di bagian anonim");
    expect(questionProblems(fields({ sectionId: "33333333-3333-4333-8333-333333333333" }), null, form).sectionId).toBeTruthy();
  });

  it("check show-if rules: a choice question of the form, its own options, no self or loop, no anonymous source", () => {
    expect(questionProblems(fields({ showIf: { question: "3", not: ["Staf"] } }), null, form)).toEqual({});
    expect(questionProblems(fields({ showIf: { question: "404", any: ["x"] } }), null, form).showIf?.[0]).toContain("tidak ada lagi");
    expect(questionProblems(fields({ showIf: { question: "31", any: ["x"] } }), null, form).showIf?.[0]).toContain("bertipe pilihan");
    expect(questionProblems(fields({ showIf: { question: "3", any: ["Direktur"] } }), null, form).showIf?.[0]).toContain("tidak ada di pertanyaan itu");
    expect(questionProblems(fields({ showIf: { question: "3" } }), null, form).showIf?.[0]).toBe("Pilih minimal satu jawaban acuan.");
    expect(questionProblems(fields({ kind: "single", options: ["a", "b"], showIf: { question: "3", any: ["Staf"] } }), "3", form).showIf?.[0]).toContain("dirinya sendiri");
    expect(questionProblems(fields({ showIf: { question: "D1", any: ["Ya"] } }), null, form).showIf?.[0]).toContain("anonim");
    // 3 waits on a question that waits on 3: a loop.
    const loop = { sections, questions: [...questions, question({ key: "4", kind: "single", options: ["a", "b"], showIf: { question: "3", any: ["Staf"] } })] };
    expect(questionProblems(fields({ kind: "single", options: ["Staf", "Lain"], showIf: { question: "4", any: ["a"] } }), "3", loop).showIf?.[0]).toContain("saling menunggu");
  });

  it("make new keys that fit the database and are not taken", () => {
    const taken = new Set<string>();
    for (let index = 0; index < 50; index++) {
      const key = newKey("q", taken);
      expect(key).toMatch(/^q[a-z0-9]{6}$/);
      expect(taken.has(key)).toBe(false);
      taken.add(key);
    }
  });
});

describe("progress", () => {
  const people = [
    { id: "p1", name: "Budi", department: "IT" },
    { id: "p2", name: "Ani", department: "IT" },
    { id: "p3", name: "Cici", department: "" },
  ];

  it("counts done, started and not started, from named answers and the anonymous receipt", () => {
    const report = progressReport({
      formName: "Kuesioner", sections, questions, people,
      progress: [{ employee_id: "p2", consent_at: "2026-11-04T01:00:00Z", completed_at: null, updated_at: "2026-11-04T01:00:00Z" }],
      answers: [
        { employee_id: "p1", question_id: "q-3", value: "Staf", updated_at: "2026-11-04T02:00:00Z" },
        { employee_id: "p2", question_id: "q-3", value: "Manajer ke atas", updated_at: "2026-11-04T03:00:00Z" },
      ],
      receipts: ["p1"],
    });
    expect(report.counts).toEqual({ belum: 1, sedang: 1, selesai: 1 });
    const byName = Object.fromEntries(report.people.map(person => [person.name, person]));
    expect(byName.Budi).toMatchObject({ state: "selesai", sectionsDone: 2, sectionsTotal: 2, lastActivity: "2026-11-04T02:00:00Z" });
    expect(byName.Ani).toMatchObject({ state: "sedang", sectionsDone: 1, lastActivity: "2026-11-04T03:00:00Z" });
    expect(byName.Cici).toMatchObject({ state: "belum", department: "Tanpa departemen", lastActivity: null });
    expect(report.people.map(person => person.name)).toEqual(["Ani", "Budi", "Cici"]);
    expect(report.departments).toEqual([
      { name: "IT", counts: { belum: 0, sedang: 1, selesai: 1 }, total: 2 },
      { name: "Tanpa departemen", counts: { belum: 1, sedang: 0, selesai: 0 }, total: 1 },
    ]);
  });
});
