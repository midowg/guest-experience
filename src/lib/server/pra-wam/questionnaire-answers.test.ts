import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QForm, QQuestion, QSection } from "@/lib/pra-wam/questionnaire";

/*
 * Saving answers and sending the anonymous section, against a small stand-in for the Supabase
 * client: reads answer from `tables`, writes are recorded in order and answer from `writeErrors`.
 */
type Result = { data?: unknown; error: { code?: string; message?: string } | null };
let tables: Record<string, Result>;
let writeErrors: Record<string, Result["error"]>;
let writes: { table: string; op: "insert" | "upsert" | "delete"; row?: unknown }[];

function query(table: string) {
  let op: "select" | "insert" | "upsert" | "delete" = "select";
  const builder = {
    select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, maybeSingle: () => builder,
    insert: (row: unknown) => { op = "insert"; writes.push({ table, op, row }); return builder; },
    upsert: (row: unknown) => { op = "upsert"; writes.push({ table, op, row }); return builder; },
    delete: () => { op = "delete"; writes.push({ table, op }); return builder; },
    then: (resolve: (result: Result) => unknown) => Promise.resolve(op === "select" ? tables[table] ?? { data: null, error: null } : { error: writeErrors[`${table}:${op}`] ?? null }).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));

const form: QForm = { id: "f1", name: "Kuesioner", slug: "kuesioner", oldSlugs: [], status: "buka", intro: "", cardText: "", minutes: 15, editUntil: null, stayDeleteOn: null, hrAccess: [], audience: "semua", audienceIds: [] };
const section = (id: string, anonymous = false): QSection => ({ id, key: id, title: id, short: id, hello: "", intro: "", tease: "", anonymous, sort: anonymous ? 2 : 1, hidden: false });
const question = (key: string, sectionId: string, rest: Partial<QQuestion>): QQuestion => ({
  id: `q-${key}`, sectionId, key, prompt: `Pertanyaan ${key}`, kind: "text", required: false, visibility: "hr", options: [], maxChoices: null, matrixRows: [], scale: [],
  placeholder: "", note: "", react: "", showIf: null, sort: 0, hidden: false, ...rest,
});
const content = {
  sections: [section("s0"), section("sD", true)],
  questions: [
    question("1", "s0", { required: true, sort: 1 }),
    question("2", "s0", { kind: "department", sort: 2 }),
    question("3", "s0", { kind: "single", required: true, options: ["Staf", "Lead"], sort: 3 }),
    question("6", "s0", { kind: "consent", sort: 4 }),
    question("13", "s0", { kind: "person", maxChoices: 2, sort: 5 }),
    question("D1", "sD", { kind: "matrix", required: true, visibility: "anon", matrixRows: ["Hospitality", "Inclusivity"], scale: ["1", "2", "3", "4", "5"], sort: 6 }),
    question("D2", "sD", { kind: "long", visibility: "anon", sort: 7 }),
    question("D3", "sD", { kind: "single", visibility: "anon", required: true, options: ["Ya", "Tidak"], showIf: { question: "3", any: ["Lead"] }, sort: 8 }),
  ],
};
let current: QForm;
const me = "11111111-2222-4333-8444-555555555555";

vi.mock("./questionnaire", async importOriginal => ({
  ...(await importOriginal<typeof import("./questionnaire")>()),
  currentForm: async () => current,
  formContent: async () => content,
  departmentOptions: async () => ["IT", "Finance"],
  peopleOptions: async () => [{ id: me, name: "Saya", department: "IT" }, { id: "p2", name: "Rekan Dua", department: "Finance" }],
}));

const { saveAnswer, submitAnonymous } = await import("./questionnaire-answers");

beforeEach(() => {
  current = { ...form };
  writes = []; writeErrors = {};
  tables = {
    cq_answers: { data: [], error: null },
    cq_progress: { data: null, error: null },
    cq_anon_receipts: { data: null, error: null },
  };
});

const written = (table: string, op?: string) => writes.filter(write => write.table === table && (!op || write.op === op));

describe("saveAnswer", () => {
  it("refuses a draft, a closed form and one past its deadline, without writing", async () => {
    current = { ...form, status: "draf" };
    await expect(saveAnswer(me, "1", "Dewi")).rejects.toMatchObject({ status: 404 });
    current = { ...form, status: "tutup" };
    await expect(saveAnswer(me, "1", "Dewi")).rejects.toMatchObject({ status: 409 });
    current = { ...form, editUntil: new Date(Date.now() - 60_000).toISOString() };
    await expect(saveAnswer(me, "1", "Dewi")).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });

  it("refuses someone the form is not for, but lets Admin WAM try it", async () => {
    current = { ...form, audience: "pilih", audienceIds: ["p2"] };
    await expect(saveAnswer(me, "1", "Dewi")).rejects.toMatchObject({ status: 404, message: "Kuesioner ini tidak dibuka untukmu." });
    await expect(submitAnonymous(me, {})).rejects.toMatchObject({ status: 404 });
    expect(writes).toEqual([]);
    await saveAnswer(me, "1", "Dewi", { preview: true });
    current = { ...form, audience: "pilih", audienceIds: [me] };
    await saveAnswer(me, "1", "Dewi");
    expect(writes.filter(write => write.table === "cq_answers")).toHaveLength(2);
  });

  it("never saves an anonymous question with a name", async () => {
    await expect(saveAnswer(me, "D2", "rahasia")).rejects.toMatchObject({ status: 422 });
    expect(writes).toEqual([]);
  });

  it("refuses an unknown question, an option not offered, a department or person off the list, and myself", async () => {
    await expect(saveAnswer(me, "99", "x")).rejects.toMatchObject({ status: 404 });
    await expect(saveAnswer(me, "3", "Bos")).rejects.toMatchObject({ status: 422, message: "Pilihan ini tidak ada di daftar." });
    await expect(saveAnswer(me, "2", "Marketing")).rejects.toMatchObject({ status: 422 });
    await expect(saveAnswer(me, "13", ["p9"])).rejects.toMatchObject({ status: 422 });
    await expect(saveAnswer(me, "13", [me])).rejects.toMatchObject({ status: 422 });
    await expect(saveAnswer(me, "13", ["p2", "p2", me])).rejects.toMatchObject({ status: 422 });
    await expect(saveAnswer(me, "1", 42)).rejects.toMatchObject({ status: 422, fieldErrors: { 1: ["Jawaban paling panjang 300 karakter."] } });
    expect(written("cq_answers")).toEqual([]);
  });

  it("stores a cleaned answer for me, and removes the row when it is emptied", async () => {
    const saved = await saveAnswer(me, "1", "  Dewi  ");
    expect(saved.value).toBe("Dewi");
    expect(written("cq_answers", "upsert")[0].row).toMatchObject({ form_id: "f1", question_id: "q-1", employee_id: me, value: "Dewi" });
    expect(await saveAnswer(me, "13", ["p2", "p2"])).toMatchObject({ value: ["p2"] });
    writes = [];
    await saveAnswer(me, "1", "   ");
    expect(written("cq_answers", "delete")).toHaveLength(1);
    expect(written("cq_answers", "upsert")).toEqual([]);
  });

  it("records consent when ticked, keeps the first time, and takes it back when unticked", async () => {
    await saveAnswer(me, "6", true);
    const first = written("cq_progress", "upsert")[0].row as { consent_at: string | null };
    expect(first.consent_at).toEqual(expect.any(String));
    tables.cq_progress = { data: { consent_at: "2026-11-01T01:00:00.000Z", completed_at: null }, error: null };
    writes = [];
    await saveAnswer(me, "6", true);
    expect(written("cq_progress", "upsert")[0].row).toMatchObject({ consent_at: "2026-11-01T01:00:00.000Z" });
    writes = [];
    await saveAnswer(me, "6", false);
    expect(written("cq_progress", "upsert")[0].row).toMatchObject({ consent_at: null });
  });

  it("marks completed_at once every section is done, and clears it when it no longer is", async () => {
    tables.cq_answers = { data: [{ question_id: "q-1", value: "Dewi" }, { question_id: "q-3", value: "Staf" }], error: null };
    tables.cq_anon_receipts = { data: { submitted_on: "2026-11-04" }, error: null };
    const done = await saveAnswer(me, "1", "Dewi");
    expect(done.progress.done).toBe(true);
    expect(done.completedAt).toEqual(expect.any(String));
    tables.cq_anon_receipts = { data: null, error: null };
    tables.cq_progress = { data: { consent_at: null, completed_at: "2026-11-02T00:00:00.000Z" }, error: null };
    const undone = await saveAnswer(me, "1", "Dewi");
    expect(undone.progress.done).toBe(false);
    expect(undone.completedAt).toBeNull();
  });

  it("asks for the migration when the tables are missing", async () => {
    tables.cq_answers = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.cq_answers'" } };
    await expect(saveAnswer(me, "1", "Dewi")).rejects.toMatchObject({ status: 503 });
  });
});

describe("submitAnonymous", () => {
  const good = { D1: { Hospitality: "4", Inclusivity: "2" }, D2: "  Lebih banyak diskusi  " };

  it("stores the answers with no person and no time, after a receipt that holds only who and which form", async () => {
    const result = await submitAnonymous(me, good);
    const receipt = written("cq_anon_receipts", "insert");
    const answers = written("cq_anon_answers", "insert");
    expect(receipt).toHaveLength(1);
    expect(receipt[0].row).toEqual({ form_id: "f1", employee_id: me });
    expect(writes.indexOf(receipt[0])).toBeLessThan(writes.indexOf(answers[0]));
    const rows = answers[0].row as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["form_id", "question_id", "value"]);
    expect(rows).toEqual(expect.arrayContaining([
      { form_id: "f1", question_id: "q-D1", value: good.D1 },
      { form_id: "f1", question_id: "q-D2", value: "Lebih banyak diskusi" },
    ]));
    expect(JSON.stringify(rows)).not.toContain(me);
    expect(result.progress.sectionsDone).toBeGreaterThanOrEqual(1);
  });

  it("refuses a second send, before writing anything", async () => {
    tables.cq_anon_receipts = { data: { submitted_on: "2026-11-04" }, error: null };
    await expect(submitAnonymous(me, good)).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });

  it("treats a receipt that arrived at the same moment as already sent, and stores no answers", async () => {
    writeErrors["cq_anon_receipts:insert"] = { code: "23505", message: "duplicate key" };
    await expect(submitAnonymous(me, good)).rejects.toMatchObject({ status: 409 });
    expect(written("cq_anon_answers")).toEqual([]);
  });

  it("checks every answer first: no strays, no missing required, nothing invalid", async () => {
    await expect(submitAnonymous(me, { ...good, 1: "Dewi" })).rejects.toMatchObject({ status: 422 });
    await expect(submitAnonymous(me, { D2: "hanya ini" })).rejects.toMatchObject({ status: 422, fieldErrors: { D1: ["Wajib dijawab."] } });
    await expect(submitAnonymous(me, { D1: { Hospitality: "4" } })).rejects.toMatchObject({ status: 422 });
    await expect(submitAnonymous(me, { D1: { Hospitality: "9", Inclusivity: "2" } })).rejects.toMatchObject({ status: 422 });
    expect(writes).toEqual([]);
  });

  it("follows branching on my named answers: a question shown to leads is required for them", async () => {
    tables.cq_answers = { data: [{ question_id: "q-3", value: "Lead" }], error: null };
    await expect(submitAnonymous(me, good)).rejects.toMatchObject({ fieldErrors: { D3: ["Wajib dijawab."] } });
    await submitAnonymous(me, { ...good, D3: "Ya" });
    expect((written("cq_anon_answers", "insert")[0].row as unknown[]).length).toBe(3);
  });

  it("does not store a hidden branch's answer", async () => {
    await submitAnonymous(me, { ...good, D3: "Ya" });
    const rows = written("cq_anon_answers", "insert")[0].row as { question_id: string }[];
    expect(rows.map(row => row.question_id)).not.toContain("q-D3");
  });

  it("takes the receipt back when the answers could not be stored, so the person can try again", async () => {
    writeErrors["cq_anon_answers:insert"] = { message: "boom" };
    await expect(submitAnonymous(me, good)).rejects.toMatchObject({ status: 503 });
    expect(written("cq_anon_receipts", "delete")).toHaveLength(1);
  });

  it("refuses once the form is closed", async () => {
    current = { ...form, status: "tutup" };
    await expect(submitAnonymous(me, good)).rejects.toMatchObject({ status: 409 });
    expect(writes).toEqual([]);
  });
});
