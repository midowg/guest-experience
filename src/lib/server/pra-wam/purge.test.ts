import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QQuestion } from "@/lib/pra-wam/questionnaire";

/* The stay deletion against a small in-memory stand-in for Supabase. */
type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let form: { id: string; stayDeleteOn: string | null; status: string };
function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let mode: "select" | "delete" | "update" = "select";
  let head = false;
  let values: Row = {};
  const run = () => {
    const rows = db[table] ?? [];
    const found = rows.filter(row => filters.every(test => test(row)));
    if (mode === "delete") { db[table] = rows.filter(row => !found.includes(row)); return { data: null, count: found.length, error: null }; }
    if (mode === "update") { for (const row of found) Object.assign(row, values); return { data: null, error: null }; }
    return head ? { data: null, count: found.length, error: null } : { data: found, error: null };
  };
  const builder = {
    select: (_columns: string, options?: { head?: boolean }) => { head = !!options?.head; return builder; },
    delete: () => { mode = "delete"; return builder; },
    update: (next: Row) => { mode = "update"; values = next; return builder; },
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, list: unknown[]) => { filters.push(row => list.includes(row[key])); return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("server-only", () => ({}));
const question = (key: string) => ({ id: `q${key}`, key }) as QQuestion;
vi.mock("./questionnaire", () => ({
  questionnaireMissing: () => false,
  currentForm: async () => form,
  formContent: async () => ({ sections: [], questions: ["33", "7", "16", "14b", "14", "15", "1"].map(question) }),
}));

const { purgeIfDue, purgeStatus, purgeStayData } = await import("./purge");
const answer = (employee_id: string, key: string) => ({ form_id: "f1", employee_id, question_id: `q${key}`, value: "x" });

beforeEach(() => {
  form = { id: "f1", stayDeleteOn: "2027-02-06", status: "tutup" };
  db = {
    cq_answers: [answer("p1", "33"), answer("p1", "7"), answer("p1", "16"), answer("p1", "14b"), answer("p1", "14"), answer("p1", "15"), answer("p1", "1"), answer("p2", "33")],
    cq_stay_members: [{ form_id: "f1", employee_id: "p1", room_id: "r1" }, { form_id: "f1", employee_id: "p2", room_id: "r1" }],
    cq_stay_rooms: [{ form_id: "f1", id: "r1", name: "208" }],
    cq_forms: [{ id: "f1", rooms_published_at: "2027-01-10T00:00:00Z" }],
  };
});

describe("deleting the stay data", () => {
  it("refuses before the date and touches nothing", async () => {
    await expect(purgeStayData(form, new Date("2027-02-05T16:00:00Z"))).rejects.toThrow("belum tiba");
    await expect(purgeStayData({ ...form, stayDeleteOn: null }, new Date("2027-03-01T00:00:00Z"))).rejects.toThrow("belum diatur");
    expect(db.cq_answers).toHaveLength(8);
  });
  it("from the date, deletes the stay, health and allergy answers and the pairing, and keeps everything else", async () => {
    const now = new Date("2027-02-06T01:00:00Z");
    expect(await purgeStatus(form, now)).toEqual({ date: "2027-02-06", due: true, answers: 5, roommates: 2 });
    expect(await purgeStayData(form, now)).toEqual({ answers: 5, roommates: 2 });
    expect(db.cq_answers.map(row => row.question_id).sort()).toEqual(["q1", "q14", "q15"]);
    expect(db.cq_stay_members).toEqual([]);
    expect(db.cq_stay_rooms).toHaveLength(1);
    expect(db.cq_forms[0].rooms_published_at).toBeNull();
    expect(await purgeStatus(form, now)).toMatchObject({ answers: 0, roommates: 0 });
  });
  it("runs by itself only once the date has come", async () => {
    form = { ...form, stayDeleteOn: "2099-01-01" };
    await purgeIfDue();
    expect(db.cq_answers).toHaveLength(8);
  });
});
