import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * submitResetRequest against a small stand-in for the Supabase client: each table answers from
 * `tables`, and inserts are recorded.
 */
type Answer = { data: unknown; error: { code?: string; message?: string } | null };
let tables: Record<string, Answer>;
let insertError: Answer["error"];
let inserted: { table: string; row: Record<string, unknown> }[];

function query(table: string) {
  const builder = {
    select: () => builder, ilike: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    insert: async (row: Record<string, unknown>) => { inserted.push({ table, row }); return { error: insertError }; },
    then: (resolve: (answer: Answer) => unknown) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve),
  };
  return builder;
}
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query }) }));
vi.mock("./accounts", () => ({ resetPassword: vi.fn() }));

const { submitResetRequest } = await import("./reset-requests");

beforeEach(() => {
  inserted = []; insertError = null;
  tables = {
    employees: { data: [{ id: "e1", email: "Nama@Werkudara.com ", active: true }], error: null },
    pw_reset_requests: { data: [], error: null },
  };
});

describe("submitResetRequest", () => {
  it("records a known account and an unknown email, and answers both the same", async () => {
    const known = await submitResetRequest({ email: "nama@werkudara.com", note: "lupa" });
    expect(inserted.at(-1)?.row).toEqual({ employee_id: "e1", email: "nama@werkudara.com", note: "lupa" });
    tables.employees = { data: [], error: null };
    const unknown = await submitResetRequest({ email: "siapa@luar.com", note: "" });
    expect(inserted.at(-1)?.row).toEqual({ employee_id: null, email: "siapa@luar.com", note: "" });
    expect(unknown).toEqual(known);
    expect(known.sent).toBe(true);
  });

  it("does not add a second open request for the account, with the same answer", async () => {
    const first = await submitResetRequest({ email: "nama@werkudara.com", note: "" });
    tables.pw_reset_requests = { data: [{ employee_id: "e1", email: "nama@werkudara.com", created_at: new Date().toISOString() }], error: null };
    inserted = [];
    expect(await submitResetRequest({ email: "NAMA@werkudara.com", note: "" })).toEqual(first);
    expect(inserted).toEqual([]);
  });

  it("treats a request arriving at the same moment (unique index) as sent", async () => {
    insertError = { code: "23505", message: "duplicate key" };
    expect((await submitResetRequest({ email: "nama@werkudara.com", note: "" })).sent).toBe(true);
  });

  it("before the migration asks to contact the admin, for any email", async () => {
    tables.pw_reset_requests = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.pw_reset_requests'" } };
    const known = await submitResetRequest({ email: "nama@werkudara.com", note: "" });
    tables.employees = { data: [], error: null };
    const unknown = await submitResetRequest({ email: "siapa@luar.com", note: "" });
    expect(known).toEqual(unknown);
    expect(known.sent).toBe(false);
    expect(inserted).toEqual([]);
  });
});
