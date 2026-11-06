import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * createAccount and createMissingAccounts against a small stand-in for the Supabase client: each
 * table answers from `tables`, and new sign-ins and pw_accounts rows are recorded.
 */
type Answer = { data: unknown; error: { code?: string; message?: string } | null };
let tables: Record<string, Answer>;
let users: { email: string; password: string }[];
let linked: Record<string, unknown>[];

function query(table: string) {
  const builder = {
    select: () => builder, order: () => builder, limit: () => builder,
    insert: async (row: Record<string, unknown>) => { linked.push(row); return { error: null }; },
    then: (resolve: (answer: Answer) => unknown) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(resolve),
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
vi.mock("./leads", () => ({ listLeads: async () => ({ byPerson: new Map(), migrated: true }), leadsOf: async () => ({ departments: [], businessUnits: [] }) }));

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
    pw_accounts: { data: [{ employee_id: "e2", last_login_at: null, active: true, must_change_password: true }], error: null },
    pw_roles: { data: [], error: null },
  };
});

describe("createAccount", () => {
  it("creates only this person's sign-in, with their email in lower case", async () => {
    expect(await createAccount("e1")).toEqual({ created: 1, skipped: [] });
    expect(users).toEqual([{ email: "satu@werkudara.com", password: "password-uji-saja" }]);
    expect(linked).toEqual([{ employee_id: "e1", auth_user_id: "auth-1" }]);
  });

  it("skips, with the reason, someone who already has an account, is inactive or has no email", async () => {
    expect(await createAccount("e2")).toEqual({ created: 0, skipped: ["Dua: sudah punya akun."] });
    expect(await createAccount("e4")).toEqual({ created: 0, skipped: ["Empat: nonaktif."] });
    expect(await createAccount("e3")).toEqual({ created: 0, skipped: ["Tiga: email masih kosong."] });
    expect(await createAccount("e5")).toEqual({ created: 0, skipped: ["Lima: email sudah dipakai akun lain."] });
    expect(users).toEqual([]);
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
    expect(result).toEqual({ created: 1, skipped: ["Tiga: email masih kosong.", "Lima: email sudah dipakai akun lain."] });
    expect(users.map(user => user.email)).toEqual(["satu@werkudara.com"]);
  });
});
