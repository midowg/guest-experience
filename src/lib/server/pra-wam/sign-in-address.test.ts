import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sign-in goes by Data karyawan's email (10 Nov 2026): an account whose login address is older
 * still signs in with the email admins set, and its login address follows. The database and
 * Supabase Auth are small fakes; obvious fake emails only.
 */

const fake = vi.hoisted(() => ({
  employees: [] as { id: string; email: string }[],
  accounts: [] as { employee_id: string; auth_user_id: string }[],
  users: new Map<string, string>(),
  updates: [] as { id: string; email: string }[],
  likes: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/server/supabase/admin", () => ({
  createPrivilegedClient: () => ({
    from: (table: string) => ({
      select: () => ({
        ilike: (_column: string, pattern: string) => ({
          limit: async () => {
            fake.likes.push(pattern);
            const plain = pattern.replace(/\\(.)/g, "$1").toLowerCase();
            return { data: fake.employees.filter(row => row.email.toLowerCase() === plain).map(({ id }) => ({ id })), error: null };
          },
        }),
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({ data: table === "pw_accounts" ? fake.accounts.find(row => row.employee_id === value) ?? null : null, error: null }),
        }),
      }),
    }),
    auth: { admin: {
      getUserById: async (id: string) => ({ data: { user: fake.users.has(id) ? { id, email: fake.users.get(id) } : null } }),
      updateUserById: async (id: string, values: { email: string }) => { fake.updates.push({ id, email: values.email }); return { data: null, error: null }; },
    } },
  }),
  createPublicClient: () => ({}),
}));

const { signInAddress } = await import("./session");

beforeEach(() => {
  fake.employees = [{ id: "e1", email: "Indahtri@contoh.test" }, { id: "e2", email: "budi@contoh.test" }, { id: "e3", email: "ganda@contoh.test" }, { id: "e4", email: "ganda@contoh.test" }];
  fake.accounts = [{ employee_id: "e1", auth_user_id: "u1" }, { employee_id: "e2", auth_user_id: "u2" }];
  fake.users = new Map([["u1", "indah@contoh.test"], ["u2", "budi@contoh.test"]]);
  fake.updates = []; fake.likes = [];
});

describe("signInAddress", () => {
  it("signs in an older login address with Data karyawan's email and names the account to follow", async () => {
    expect(await signInAddress("indahtri@contoh.test")).toEqual({ address: "indah@contoh.test", follow: "u1" });
  });

  it("uses the email as typed when it already matches, is unknown, belongs to two people, or has no account", async () => {
    expect(await signInAddress("budi@contoh.test")).toEqual({ address: "budi@contoh.test", follow: null });
    expect(await signInAddress("lain@contoh.test")).toEqual({ address: "lain@contoh.test", follow: null });
    expect(await signInAddress("ganda@contoh.test")).toEqual({ address: "ganda@contoh.test", follow: null });
    fake.accounts = [];
    expect(await signInAddress("indahtri@contoh.test")).toEqual({ address: "indahtri@contoh.test", follow: null });
  });

  it("matches the email literally: wildcards are escaped, filter characters skip the lookup", async () => {
    await signInAddress("in_ah%@contoh.test");
    expect(fake.likes).toEqual(["in\\_ah\\%@contoh.test"]);
    expect(await signInAddress("a*b@contoh.test")).toEqual({ address: "a*b@contoh.test", follow: null });
    expect(fake.likes).toHaveLength(1);
  });
});
