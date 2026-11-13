import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * createAccount and createMissingAccounts against a small stand-in for the Supabase client: each
 * table answers from `tables`, and new sign-ins and pw_accounts rows are recorded.
 */
type Answer = { data: unknown; error: { code?: string; message?: string } | null };
/** A table's answer, or one that depends on the columns asked for. */
let tables: Record<string, Answer | ((columns: string) => Answer)>;
let users: { email: string; password: string }[];
let linked: Record<string, unknown>[];

function query(table: string) {
  let columns = "";
  const builder = {
    select: (asked = "") => { columns = asked; return builder; }, order: () => builder, limit: () => builder, not: () => builder, eq: () => builder,
    insert: async (row: Record<string, unknown>) => { linked.push(row); return { error: null }; },
    then: (resolve: (answer: Answer) => unknown) => {
      const answer = tables[table] ?? { data: [], error: null };
      return Promise.resolve(typeof answer === "function" ? answer(columns) : answer).then(resolve);
    },
  };
  return builder;
}
const auth = {
  admin: {
    createUser: vi.fn(async ({ email, password }: { email: string; password: string }) => {
      if (email === "dipakai@werkudara.com") return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
      users.push({ email, password });
      return { data: { user: { id: `auth-${users.length}` } }, error: null };
    }),
    deleteUser: vi.fn(),
  },
};
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query, auth }) }));
vi.mock("./leads", () => ({ listLeads: async () => ({ byPerson: new Map(), migrated: true }), leadsOf: async () => ({ departments: [], lead: false }) }));

const { createAccount, createMissingAccounts } = await import("./accounts");

const person = (id: string, name: string, email: string, active = true) => ({ id, full_name: name, department: "Accounting", email, active });

beforeEach(() => {
  vi.stubEnv("WAM_DEFAULT_PASSWORD", "password-uji-saja");
  users = []; linked = [];
  tables = {
    employees: { data: [
      person("e1", "Satu", "Satu@Werkudara.com"),
      person("e2", "Dua", "dua@werkudara.com"),
      person("e3", "Tiga", ""),
      person("e4", "Empat", "empat@werkudara.com", false),
      person("e5", "Lima", "dipakai@werkudara.com"),
    ], error: null },
    pw_accounts: { data: [{ employee_id: "e2", last_login_at: null, active: true, must_change_password: true, login_name: "dua" }], error: null },
    pw_roles: { data: [], error: null },
  };
});

describe("createAccount", () => {
  it("creates only this person's sign-in, with their email in lower case", async () => {
    expect(await createAccount("e1")).toEqual({ created: 1, skipped: [] });
    expect(users).toEqual([{ email: "satu@werkudara.com", password: "password-uji-saja" }]);
    expect(linked).toEqual([{ employee_id: "e1", auth_user_id: "auth-1", login_name: "satu" }]);
  });

  it("skips, with the reason, someone who already has an account, is inactive or whose email is taken", async () => {
    expect(await createAccount("e2")).toEqual({ created: 0, skipped: ["Dua: sudah punya akun."] });
    expect(await createAccount("e4")).toEqual({ created: 0, skipped: ["Empat: nonaktif."] });
    expect(await createAccount("e5")).toEqual({ created: 0, skipped: ["Lima: email sudah dipakai akun lain."] });
    expect(users).toEqual([]);
  });

  it("gives someone without an email a sign-in by nama panggilan, at an address that never gets mail", async () => {
    expect(await createAccount("e3")).toEqual({ created: 1, skipped: [] });
    expect(users).toEqual([{ email: "tiga@tanpa-email.wam.invalid", password: "password-uji-saja" }]);
    expect(linked).toEqual([{ employee_id: "e3", auth_user_id: "auth-1", login_name: "tiga" }]);
  });

  it("before migration 202611130007 still skips someone without an email", async () => {
    tables.pw_accounts = columns => columns.includes("login_name")
      ? { data: null, error: { code: "42703", message: "column pw_accounts.login_name does not exist" } }
      : { data: [{ employee_id: "e2", last_login_at: null, active: true, must_change_password: true }], error: null };
    expect((await createAccount("e3")).skipped[0]).toMatch(/^Tiga: email masih kosong/);
  });

  it("answers 404 for someone not in Data karyawan", async () => {
    await expect(createAccount("e9")).rejects.toMatchObject({ status: 404 });
  });

  it("needs the shared first password on the server", async () => {
    vi.stubEnv("WAM_DEFAULT_PASSWORD", "");
    await expect(createAccount("e1")).rejects.toMatchObject({ status: 503 });
  });
});

describe("createMissingAccounts", () => {
  it("creates everyone active still missing one, through the same steps", async () => {
    const result = await createMissingAccounts();
    expect(result).toEqual({ created: 2, skipped: ["Lima: email sudah dipakai akun lain."] });
    expect(users.map(user => user.email)).toEqual(["satu@werkudara.com", "tiga@tanpa-email.wam.invalid"]);
  });
});
