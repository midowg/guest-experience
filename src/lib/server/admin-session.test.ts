import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAuthConfig, SESSION_COOKIE, signPersonSession, signSession } from "@/lib/admin-token";

/*
 * The admin guards with a personal admin (13 Nov 2026): the grant decides which part of the admin
 * and which events open; a revoked grant, a changed WAM password or the retired shared password
 * end the session. A small stand-in for Supabase answers from `tables`.
 */
type Row = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  path: null as string | null,
  tables: {} as Record<string, Row[] | { error: { code: string; message: string } }>,
  auth: { userId: "auth-1" as string | null },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (fake.jar.has(name) ? { name, value: fake.jar.get(name)! } : undefined) }),
  headers: async () => new Headers(fake.path ? { "x-wk-admin-path": fake.path } : {}),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("./pra-wam/session", () => ({
  loginNameAddress: async (name: string) => name === "dewi" ? "dewi@werkudara.com" : null,
  signInAddress: async (typed: string) => ({ address: typed, follow: null }),
}));
vi.mock("./supabase/admin", () => {
  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    const answer = () => {
      const stored = fake.tables[table] ?? [];
      if (!Array.isArray(stored)) return { data: null, error: stored.error };
      return { data: stored.filter(row => filters.every(test => test(row))), error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "not"]) chain[method] = () => chain;
    chain.eq = (column: string, value: unknown) => { filters.push(row => row[column] === value); return chain; };
    chain.maybeSingle = async () => { const { data, error } = answer(); return { data: data?.[0] ?? null, error }; };
    chain.then = (resolve: (value: unknown) => unknown) => resolve(answer());
    return chain;
  }
  return {
    createPrivilegedClient: () => ({ from: query }),
    createPublicClient: () => ({ auth: { signInWithPassword: async () => fake.auth.userId ? { data: { user: { id: fake.auth.userId } }, error: null } : { data: { user: null }, error: { message: "bad" } } } }),
  };
});

const env = { ADMIN_PASSWORD: "correct horse battery", ADMIN_SESSION_SECRET: "s".repeat(32), SUPER_ADMIN_PASSWORD: "super secret owner" };
const DEWI = "0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11";
const EVENT = "5a6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c22";

const session = await import("./admin-session");
const actor = await import("./admin-actor");

function signIn(token: string, path: string | null) { fake.jar.set(SESSION_COOKIE, token); fake.path = path; }
const asDewi = (path: string | null, version = 1) => signIn(signPersonSession(adminAuthConfig(env)!, DEWI, version), path);

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  fake.jar.clear(); fake.path = null; fake.auth.userId = "auth-1";
  fake.tables = {
    pw_accounts: [{ employee_id: DEWI, auth_user_id: "auth-1", session_version: 1, active: true, must_change_password: false, employees: { full_name: "Dewi Lestari", active: true } }],
    admin_grants: [{ employee_id: DEWI, apps: ["wam", "acara"], all_events: false, event_ids: [] }],
    staff_members: [{ id: "staff-dewi", employee_id: DEWI }],
    event_documents: [{ id: EVENT, document: { event_kind: "acara", contact: { staff_id: "" } } }],
    events: [{ id: EVENT, admin_hidden: false }],
  };
});

describe("a personal admin", () => {
  it("opens the apps of their grant, and nothing outside it", async () => {
    asDewi("/api/admin/wam/accounts");
    await expect(session.requireApiAdmin()).resolves.toBe("admin");
    asDewi("/api/admin/wam/tv/screens");
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 403 });
    asDewi("/api/admin/employees");
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 403 });
    asDewi(null);
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 403 });
    asDewi("/admin/tv");
    await expect(session.requireAdminPage()).rejects.toThrow("NOT_FOUND");
  });

  it("is signed out once the grant is revoked or the WAM password changed", async () => {
    asDewi("/api/admin/wam/accounts", 2);
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 401 });
    fake.tables.admin_grants = [];
    asDewi("/api/admin/wam/accounts");
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("opens an event they are the PIC of or were given, else answers 404", async () => {
    asDewi("/api/admin/events/x");
    await expect(session.requireEventAccess(EVENT)).rejects.toMatchObject({ status: 404 });
    fake.tables.event_documents = [{ id: EVENT, document: { event_kind: "acara", contact: { staff_id: "staff-dewi" } } }];
    await expect(session.requireEventAccess(EVENT)).resolves.toBe("admin");
    fake.tables.event_documents = [{ id: EVENT, document: { event_kind: "acara", contact: { staff_id: "" } } }];
    fake.tables.admin_grants = [{ employee_id: DEWI, apps: ["acara"], all_events: false, event_ids: [EVENT] }];
    await expect(session.requireEventAccess(EVENT)).resolves.toBe("admin");
  });
});

describe("the super admin and the shared password", () => {
  it("lets the super admin open everything", async () => {
    signIn(signSession(adminAuthConfig(env)!, "super"), "/api/admin/employees");
    await expect(session.requireSuperAdmin()).resolves.toBeUndefined();
  });
  // The "not migrated yet" answer is kept for a minute, so the shared password is checked after migration last.
  it("retires the shared admin password once the grants table exists", async () => {
    signIn(signSession(adminAuthConfig(env)!, "admin"), "/api/admin/wam/accounts");
    await expect(session.requireApiAdmin()).rejects.toMatchObject({ status: 401 });
  });
});

describe("signing in with a WAM account", () => {
  it("lets in an admin with their password, the first WAM password too", async () => {
    await expect(actor.signInPersonAdmin("dewi", "pw")).resolves.toEqual({ employeeId: DEWI, version: 1, name: "Dewi Lestari" });
    (fake.tables.pw_accounts as Row[])[0].must_change_password = true;
    await expect(actor.signInPersonAdmin("dewi", "pw")).resolves.toMatchObject({ employeeId: DEWI });
    asDewi("/api/admin/wam/accounts");
    await expect(session.requireApiAdmin()).resolves.toBe("admin");
  });
  it("refuses a wrong pair and someone without access", async () => {
    fake.auth.userId = null;
    await expect(actor.signInPersonAdmin("dewi", "pw")).rejects.toMatchObject({ status: 401 });
    fake.auth.userId = "auth-1";
    await expect(actor.signInPersonAdmin("orang-lain", "pw")).rejects.toMatchObject({ status: 401 });
    fake.tables.admin_grants = [];
    await expect(actor.signInPersonAdmin("dewi", "pw")).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/belum punya akses admin/) });
  });
});
