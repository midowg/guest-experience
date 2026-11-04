import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The HR APIs refuse without the admin session, and the data routes refuse without the HR unlock
 * cookie for this very session and this very password. Cookies and the database are fakes; the
 * session, hashing and cookie checks are the real ones. Obvious fake passwords only.
 */

const fake = vi.hoisted(() => {
  const jar = new Map<string, string>();
  const state = { form: null as { id: string; hr_password_hash: string | null } | null, inserts: [] as { table: string; row: unknown }[], reads: [] as string[] };
  return { jar, state };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (fake.jar.has(name) ? { name, value: fake.jar.get(name)! } : undefined),
    set: (name: string, value: string) => { fake.jar.set(name, value); },
    delete: (name: string) => { fake.jar.delete(name); },
  }),
}));

vi.mock("@/lib/server/supabase/admin", () => {
  function query(table: string) {
    const result = () => {
      if (table === "cq_forms") return { data: fake.state.form, error: null };
      if (table !== "cq_hr_access_log") fake.state.reads.push(table);
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "eq", "in", "gte", "is", "range", "update"]) chain[method] = () => chain;
    chain.insert = (row: unknown) => { fake.state.inserts.push({ table, row }); return chain; };
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result());
    return chain;
  }
  return { createPrivilegedClient: () => ({ from: query, rpc: async () => ({ data: true, error: null }) }) };
});

const FAKE_HR = "contoh-password-hr-palsu";
const origin = "https://journey.test";
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`${origin}${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body ?? {}),
});
const get = (path: string) => new Request(`${origin}${path}`, { headers: { "sec-fetch-site": "same-origin" } });
const json = async (response: Response) => ({ status: response.status, body: await response.json() as { ok: boolean; message: string } });
const PERSON = "6f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";

let adminToken: (role?: "admin" | "super") => string;
let routes: {
  unlock: typeof import("./unlock/route"); lock: typeof import("./lock/route"); reset: typeof import("./reset/route"); set: typeof import("./set/route");
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
    unlock: await import("./unlock/route"), lock: await import("./lock/route"), reset: await import("./reset/route"), set: await import("./set/route"),
    people: await import("./person/route"), person: await import("./person/[employeeId]/route"), log: await import("./log/route"),
  };
  fake.state.form = { id: "f0000000-0000-4000-8000-000000000000", hr_password_hash: await lock.hashHrPassword(FAKE_HR) };
}, 20_000);

beforeEach(() => { fake.jar.clear(); fake.state.inserts.length = 0; fake.state.reads.length = 0; });

const dataRoutes = () => [
  ["daftar orang", () => routes.people.GET(get("/x"))],
  ["satu orang", () => routes.person.GET(get("/x"), { params: Promise.resolve({ employeeId: PERSON }) })],
  ["log akses", () => routes.log.GET(get("/x"))],
] as const;

describe("HR data routes", () => {
  it("answer 401 without an admin session", async () => {
    for (const [, call] of dataRoutes()) expect((await call()).status).toBe(401);
    expect(fake.state.reads).toEqual([]);
  });

  it("answer 403 for a signed-in admin who has not unlocked, and read nothing", async () => {
    fake.jar.set("wk_admin", adminToken());
    for (const [, call] of dataRoutes()) {
      const { status, body } = await json(await call());
      expect(status).toBe(403);
      expect(body.message).toMatch(/Data HR terkunci/);
    }
    expect(fake.state.reads).toEqual([]);
  });

  it("refuse an unlock cookie from another admin session or an old password", async () => {
    const config = (await import("@/lib/admin-token")).adminAuthConfig()!;
    const version = lock.passwordVersion(fake.state.form!.hr_password_hash!);
    fake.jar.set("wk_admin", adminToken());
    fake.jar.set("wk_hr", lock.signHrToken(config.secret, adminToken("super"), version));
    expect(await lock.hrUnlocked()).toBeNull();
    fake.jar.set("wk_hr", lock.signHrToken(config.secret, fake.jar.get("wk_admin")!, "0".repeat(32)));
    expect(await lock.hrUnlocked()).toBeNull();
    fake.jar.set("wk_hr", lock.signHrToken(config.secret, fake.jar.get("wk_admin")!, version));
    expect(await lock.hrUnlocked()).not.toBeNull();
  });

  it("refuse a cross-site read even when unlocked", async () => {
    fake.jar.set("wk_admin", adminToken());
    const response = await routes.log.GET(new Request(`${origin}/x`, { headers: { "sec-fetch-site": "cross-site" } }));
    expect(response.status).toBe(403);
  });
});

describe("unlocking", () => {
  it("needs the admin session and this site as origin", async () => {
    expect((await routes.unlock.POST(post("/x", { password: FAKE_HR }))).status).toBe(401);
    fake.jar.set("wk_admin", adminToken());
    expect((await routes.unlock.POST(post("/x", { password: FAKE_HR }, { origin: "https://elsewhere.test" }))).status).toBe(403);
  });

  it("logs a wrong password as gagal and sets no cookie", async () => {
    fake.jar.set("wk_admin", adminToken());
    const { status, body } = await json(await routes.unlock.POST(post("/x", { password: "salah-tetapi-panjang" })));
    expect(status).toBe(403);
    expect(body.message).toMatch(/Sisa 4 percobaan/);
    expect(fake.jar.has("wk_hr")).toBe(false);
    expect(fake.state.inserts).toEqual([{ table: "cq_hr_access_log", row: expect.objectContaining({ action: "gagal" }) }]);
  });

  it("sets a cookie bound to the session on the right password, logs buka, and opens the data routes", async () => {
    fake.jar.set("wk_admin", adminToken());
    const response = await routes.unlock.POST(post("/x", { password: FAKE_HR }, { "user-agent": "Vitest" }));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(FAKE_HR);
    expect(fake.jar.get("wk_hr")).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(fake.state.inserts).toEqual([{ table: "cq_hr_access_log", row: expect.objectContaining({ action: "buka", user_agent: "Vitest" }) }]);
    expect(JSON.stringify(fake.state.inserts)).not.toContain(FAKE_HR);
    expect((await routes.log.GET(get("/x"))).status).toBe(200);
    // Signing in again (a new admin cookie) ends the unlock.
    fake.jar.set("wk_admin", adminToken("super"));
    expect((await routes.log.GET(get("/x"))).status).toBe(403);
  });

  it("locks again on Kunci sekarang and logs kunci", async () => {
    fake.jar.set("wk_admin", adminToken());
    await routes.unlock.POST(post("/x", { password: FAKE_HR }));
    fake.state.inserts.length = 0;
    expect((await routes.lock.POST(post("/x"))).status).toBe(200);
    expect(fake.jar.has("wk_hr")).toBe(false);
    expect(fake.state.inserts).toEqual([{ table: "cq_hr_access_log", row: expect.objectContaining({ action: "kunci" }) }]);
    expect((await routes.people.GET(get("/x"))).status).toBe(403);
  });
});

describe("the password itself", () => {
  it("resets only for a super admin", async () => {
    fake.jar.set("wk_admin", adminToken());
    expect((await routes.reset.POST(post("/x"))).status).toBe(403);
    expect(fake.state.inserts).toEqual([]);
  });

  it("cannot be set a second time without the current one", async () => {
    fake.jar.set("wk_admin", adminToken());
    const { status } = await json(await routes.set.POST(post("/x", { password: "contoh-password-baru-palsu" })));
    expect(status).toBe(409);
  });

  it("must be at least 10 characters", async () => {
    fake.jar.set("wk_admin", adminToken());
    const { status, body } = await json(await routes.set.POST(post("/x", { password: "pendek" })));
    expect(status).toBe(422);
    expect(body.message).toMatch(/minimal 10/);
  });
});
