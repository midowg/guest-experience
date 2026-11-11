import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The HR APIs refuse without the admin session. Since 11 Nov 2026 (owner's decision) the data is
 * open for every signed-in admin: no unlock is needed, and a read without one is logged with no
 * name. An email unlock still works and names the person on the log while they stay on the list. Data HR opens with the WAM
 * email of someone on the list; an unknown email and one without access get the same answer.
 * Cookies and the database are fakes (a tiny in-memory table store); the session and cookie
 * checks are the real ones. Obvious fake emails and secrets only.
 */

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => {
  const jar = new Map<string, string>();
  const tables: Record<string, Row[]> = {};
  const state = { reads: [] as string[], rpc: [] as string[], allowRate: true, clock: 0 };
  return { jar, tables, state };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (fake.jar.has(name) ? { name, value: fake.jar.get(name)! } : undefined),
    set: (name: string, value: string) => { fake.jar.set(name, value); },
    delete: (name: string) => { fake.jar.delete(name); },
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/server/supabase/admin", () => {
  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; values: Row } = { kind: "select" };
    const rows = () => (fake.tables[table] ??= []);
    const run = () => {
      if (mode.kind === "insert") {
        rows().push({ id: `r${rows().length + 1}`, created_at: new Date(Date.now() + ++fake.state.clock).toISOString(), ...mode.row });
        return { data: null, error: null };
      }
      const found = rows().filter(row => filters.every(test => test(row)));
      if (mode.kind === "update") { for (const row of found) Object.assign(row, mode.values); return { data: found, error: null }; }
      if (!["cq_forms", "cq_hr_access_log", "employees", "pw_accounts"].includes(table)) fake.state.reads.push(table);
      return { data: found, error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "range"]) chain[method] = () => chain;
    chain.eq = (column: string, value: unknown) => { filters.push(row => row[column] === value); return chain; };
    chain.in = (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return chain; };
    chain.gte = (column: string, value: string) => { filters.push(row => String(row[column]) >= value); return chain; };
    chain.is = (column: string, value: unknown) => { filters.push(row => (row[column] ?? null) === value); return chain; };
    chain.insert = (row: Row) => { mode = { kind: "insert", row }; return chain; };
    chain.update = (values: Row) => { mode = { kind: "update", values }; return chain; };
    chain.maybeSingle = async () => { const result = run(); return { data: Array.isArray(result.data) ? result.data[0] ?? null : null, error: null }; };
    chain.then = (resolve: (value: unknown) => unknown) => resolve(run());
    return chain;
  }
  return {
    createPrivilegedClient: () => ({
      from: query,
      rpc: async (_name: string, args: { p_key: string }) => { fake.state.rpc.push(args.p_key); return { data: fake.state.allowRate, error: null }; },
    }),
  };
});

const origin = "https://journey.test";
let ip = 0;
/** Each request from its own network unless one is given, so the per-network count stays apart. */
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip % 250}`, ...headers }, body: JSON.stringify(body ?? {}),
});
const del = (path: string) => new Request(`${origin}${path}`, { method: "DELETE", headers: { origin } });
const get = (path: string) => new Request(`${origin}${path}`, { headers: { "sec-fetch-site": "same-origin" } });
const json = async (response: Response) => ({ status: response.status, body: await response.json() as { ok: boolean; message: string; data?: unknown } });

const FORM = "f0000000-0000-4000-8000-000000000000";
const HR = "6f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
const OTHER = "7a1c1e2a-3b4c-4d5e-8f60-718293a4b5c7";
const ASLEEP = "8b1c1e2a-3b4c-4d5e-8f60-718293a4b5c8";
const HR_EMAIL = "hr.satu@contoh.test";
const OTHER_EMAIL = "bukan.hr@contoh.test";
const NO_ACCESS = /^Email ini tidak punya akses Data HR\./;

let adminToken: (role?: "admin" | "super") => string;
let routes: {
  unlock: typeof import("./unlock/route"); lock: typeof import("./lock/route"); access: typeof import("./access/route"); accessPerson: typeof import("./access/[employeeId]/route");
  people: typeof import("./person/route"); person: typeof import("./person/[employeeId]/route"); log: typeof import("./log/route");
};
let lock: typeof import("@/lib/server/pra-wam/hr-lock");

beforeAll(async () => {
  process.env.ADMIN_PASSWORD = "contoh-admin-palsu";
  process.env.SUPER_ADMIN_PASSWORD = "contoh-super-palsu";
  process.env.ADMIN_SESSION_SECRET = "x".repeat(48);
  process.env.RATE_LIMIT_SECRET = "y".repeat(48);
  const token = await import("@/lib/admin-token");
  adminToken = (role = "admin") => token.signSession(token.adminAuthConfig()!, role);
  lock = await import("@/lib/server/pra-wam/hr-lock");
  routes = {
    unlock: await import("./unlock/route"), lock: await import("./lock/route"), access: await import("./access/route"), accessPerson: await import("./access/[employeeId]/route"),
    people: await import("./person/route"), person: await import("./person/[employeeId]/route"), log: await import("./log/route"),
  };
}, 20_000);

beforeEach(() => {
  fake.jar.clear();
  fake.state.reads.length = 0; fake.state.rpc.length = 0; fake.state.allowRate = true;
  fake.tables.cq_forms = [{ id: FORM, updated_at: "2026-11-04T01:00:00.000000+00:00", hr_access: [HR, ASLEEP] }];
  fake.tables.cq_hr_access_log = [];
  fake.tables.employees = [
    { id: HR, full_name: "Dewi HR", department: "HRGA", email: HR_EMAIL, active: true },
    { id: OTHER, full_name: "Budi Lain", department: "Finance", email: OTHER_EMAIL, active: true },
    { id: ASLEEP, full_name: "Sari Nonaktif", department: "HRGA", email: "sari@contoh.test", active: true },
  ];
  fake.tables.pw_accounts = [{ employee_id: HR, active: true }, { employee_id: OTHER, active: true }, { employee_id: ASLEEP, active: false }];
});

const logRows = () => fake.tables.cq_hr_access_log;
const dataRoutes = () => [
  ["daftar orang", () => routes.people.GET(get("/x"))],
  ["satu orang", () => routes.person.GET(get("/x"), { params: Promise.resolve({ employeeId: OTHER }) })],
  ["log akses", () => routes.log.GET(get("/x"))],
] as const;
async function unlockAsHr() {
  fake.jar.set("wk_admin", adminToken());
  const response = await routes.unlock.POST(post("/x", { email: HR_EMAIL }, { "user-agent": "Vitest" }));
  expect(response.status).toBe(200);
  return response;
}

describe("HR data routes", () => {
  it("answer 401 without an admin session", async () => {
    for (const [, call] of dataRoutes()) expect((await call()).status).toBe(401);
    expect(fake.state.reads).toEqual([]);
  });

  it("open for every signed-in admin without an unlock, and log a read with no name", async () => {
    fake.jar.set("wk_admin", adminToken());
    for (const [, call] of dataRoutes()) expect((await call()).status).toBe(200);
    expect(logRows().map(row => [row.action, row.actor_employee_id, row.subject_employee_id])).toEqual([["lihat", null, OTHER]]);
  });

  it("name the person only for an unlock cookie of this session and of someone still on the list", async () => {
    const config = (await import("@/lib/admin-token")).adminAuthConfig()!;
    fake.jar.set("wk_admin", adminToken());
    fake.jar.set("wk_hr", lock.signHrToken(config.secret, adminToken("super"), HR));
    // Open anyway, but not under that person's name.
    expect((await lock.hrUnlocked())?.actor).toEqual({ id: null, name: "Admin" });
    fake.jar.set("wk_hr", lock.signHrToken(config.secret, fake.jar.get("wk_admin")!, HR));
    expect((await lock.hrUnlocked())?.actor).toEqual({ id: HR, name: "Dewi HR" });
    fake.tables.cq_forms[0].hr_access = [ASLEEP];
    expect((await lock.hrUnlocked())?.actor).toEqual({ id: null, name: "Admin" });
  });

  it("refuse a cross-site read even when unlocked", async () => {
    await unlockAsHr();
    const response = await routes.log.GET(new Request(`${origin}/x`, { headers: { "sec-fetch-site": "cross-site" } }));
    expect(response.status).toBe(403);
  });
});

describe("unlocking with the WAM email", () => {
  it("needs the admin session and this site as origin", async () => {
    expect((await routes.unlock.POST(post("/x", { email: HR_EMAIL }))).status).toBe(401);
    fake.jar.set("wk_admin", adminToken());
    expect((await routes.unlock.POST(post("/x", { email: HR_EMAIL }, { origin: "https://elsewhere.test" }))).status).toBe(403);
    expect(fake.jar.has("wk_hr")).toBe(false);
  });

  it("answers an unknown email, someone not on the list and an inactive account the same way, and logs each as gagal", async () => {
    fake.jar.set("wk_admin", adminToken());
    const answers = [];
    for (const email of ["tidak.ada@contoh.test", OTHER_EMAIL, "sari@contoh.test"]) answers.push(await json(await routes.unlock.POST(post("/x", { email }))));
    for (const answer of answers) {
      expect(answer.status).toBe(403);
      expect(answer.body.message).toMatch(NO_ACCESS);
      expect(answer.body.message).toBe(answers[0].body.message);
    }
    expect(fake.jar.has("wk_hr")).toBe(false);
    // Under the person when the email is an employee's, so HR sees whose email was tried.
    expect(logRows().map(row => [row.action, row.actor_employee_id])).toEqual([["gagal", null], ["gagal", OTHER], ["gagal", ASLEEP]]);
  });

  it("opens for a person on the list (any case, spaces around), with a cookie naming them, and logs buka under them", async () => {
    fake.jar.set("wk_admin", adminToken());
    const { status, body } = await json(await routes.unlock.POST(post("/x", { email: "  HR.Satu@Contoh.TEST " }, { "user-agent": "Vitest" })));
    expect(status).toBe(200);
    expect(body.data).toEqual({ expiresAt: expect.any(String), name: "Dewi HR" });
    expect(fake.jar.get("wk_hr")).toMatch(new RegExp(`^v2\\.\\d+\\.${HR}\\.[0-9a-f]{64}$`));
    expect(logRows()).toEqual([expect.objectContaining({ action: "buka", actor_employee_id: HR, user_agent: "Vitest" })]);
    expect((await routes.log.GET(get("/x"))).status).toBe(200);
    // Signing in again (a new admin cookie) ends the named unlock; the data stays open to the admin.
    fake.jar.set("wk_admin", adminToken("super"));
    expect((await lock.hrUnlocked())?.actor).toEqual({ id: null, name: "Super admin" });
    expect((await routes.log.GET(get("/x"))).status).toBe(200);
  });

  it("logs every read and the lock under the person who opened it", async () => {
    await unlockAsHr();
    expect((await routes.person.GET(get("/x"), { params: Promise.resolve({ employeeId: OTHER }) })).status).toBe(200);
    expect((await routes.lock.POST(post("/x"))).status).toBe(200);
    expect(fake.jar.has("wk_hr")).toBe(false);
    expect(logRows().map(row => [row.action, row.actor_employee_id, row.subject_employee_id ?? null]))
      .toEqual([["buka", HR, null], ["lihat", HR, OTHER], ["kunci", HR, null]]);
    // Locked again, the admin still reads (open for every admin).
    expect((await routes.people.GET(get("/x"))).status).toBe(200);
  });

  it("shows who did what in the log", async () => {
    await unlockAsHr();
    const { body } = await json(await routes.log.GET(get("/x")));
    expect(body.data).toEqual([expect.objectContaining({ action: "buka", actor: "Dewi HR", subject: null })]);
  });
});

describe("rate limit and lockout", () => {
  it("counts every try against the network and against the email", async () => {
    fake.jar.set("wk_admin", adminToken());
    await routes.unlock.POST(post("/x", { email: OTHER_EMAIL }));
    expect(fake.state.rpc).toHaveLength(2);
    expect(new Set(fake.state.rpc).size).toBe(2);
  });

  it("stops at the rate limit before looking at the email", async () => {
    fake.jar.set("wk_admin", adminToken());
    fake.state.allowRate = false;
    const { status } = await json(await routes.unlock.POST(post("/x", { email: HR_EMAIL })));
    expect(status).toBe(429);
    expect(fake.jar.has("wk_hr")).toBe(false);
    expect(logRows()).toEqual([]);
  });

  it("locks a network after five failed tries, even for an email that has access", async () => {
    fake.jar.set("wk_admin", adminToken());
    const same = { "x-forwarded-for": "10.9.9.9" };
    const left = [];
    for (let i = 0; i < 5; i++) left.push(await json(await routes.unlock.POST(post("/x", { email: `tebakan${i}@contoh.test` }, same))));
    expect(left.slice(0, 4).map(answer => answer.body.message.match(/Sisa (\d)/)?.[1])).toEqual(["4", "3", "2", "1"]);
    expect(left[4].status).toBe(429);
    const { status, body } = await json(await routes.unlock.POST(post("/x", { email: HR_EMAIL }, same)));
    expect(status).toBe(429);
    expect(body.message).toMatch(/dikunci sementara/);
    expect(fake.jar.has("wk_hr")).toBe(false);
    // Another network still opens.
    expect((await routes.unlock.POST(post("/x", { email: HR_EMAIL }))).status).toBe(200);
  });

  it("locks an employee's email after five failed tries from different networks", async () => {
    fake.jar.set("wk_admin", adminToken());
    for (let i = 0; i < 5; i++) await routes.unlock.POST(post("/x", { email: OTHER_EMAIL }));
    const { status, body } = await json(await routes.unlock.POST(post("/x", { email: OTHER_EMAIL })));
    expect(status).toBe(429);
    expect(body.message).toMatch(/dikunci sementara/);
  });
});

describe("the access list", () => {
  it("is changed by the super admin only", async () => {
    fake.jar.set("wk_admin", adminToken());
    expect((await routes.access.POST(post("/x", { employeeId: OTHER }))).status).toBe(403);
    expect((await routes.accessPerson.DELETE(del("/x"), { params: Promise.resolve({ employeeId: HR }) })).status).toBe(403);
    expect(fake.tables.cq_forms[0].hr_access).toEqual([HR, ASLEEP]);
    expect(logRows()).toEqual([]);
  });

  it("adds and removes people for the super admin, logged as ubah_akses with no actor", async () => {
    fake.jar.set("wk_admin", adminToken("super"));
    const added = await json(await routes.access.POST(post("/x", { employeeId: OTHER })));
    expect(added.status).toBe(200);
    expect(fake.tables.cq_forms[0].hr_access).toEqual([HR, ASLEEP, OTHER]);
    expect((await routes.accessPerson.DELETE(del("/x"), { params: Promise.resolve({ employeeId: ASLEEP }) })).status).toBe(200);
    expect(fake.tables.cq_forms[0].hr_access).toEqual([HR, OTHER]);
    expect(logRows().map(row => [row.action, row.subject_employee_id, row.actor_employee_id])).toEqual([["ubah_akses", OTHER, null], ["ubah_akses", ASLEEP, null]]);
  });

  it("refuses someone without an active WAM account", async () => {
    fake.jar.set("wk_admin", adminToken("super"));
    fake.tables.cq_forms[0].hr_access = [HR];
    const { status } = await json(await routes.access.POST(post("/x", { employeeId: ASLEEP })));
    expect(status).toBe(422);
    expect(fake.tables.cq_forms[0].hr_access).toEqual([HR]);
  });

  it("stops naming a person who is taken off it, while the data stays open to the admin", async () => {
    await unlockAsHr();
    expect((await routes.people.GET(get("/x"))).status).toBe(200);
    fake.jar.set("wk_admin", adminToken("super"));
    const superCookie = fake.jar.get("wk_admin")!;
    await routes.unlock.POST(post("/x", { email: HR_EMAIL }));
    expect((await routes.people.GET(get("/x"))).status).toBe(200);
    await routes.accessPerson.DELETE(del("/x"), { params: Promise.resolve({ employeeId: HR }) });
    expect(fake.jar.get("wk_admin")).toBe(superCookie);
    expect((await lock.hrUnlocked())?.actor.id).toBeNull();
    expect((await routes.people.GET(get("/x"))).status).toBe(200);
  });
});
