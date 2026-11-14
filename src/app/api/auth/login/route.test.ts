import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The admin sign-in's rate limits (14 Nov 2026): the office shares one network, so tries count per
 * account typed (5 per 10 minutes), and the network as a whole gets 30.
 */
const limits = vi.hoisted(() => ({ calls: [] as [string, number][], blocked: new Set<string>() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/server/access-log", () => ({ recordAccess: vi.fn(async () => true), isKnownDevice: async () => true }));
vi.mock("@/lib/server/admin-actor", () => ({
  grantsMigrated: async () => true,
  signInPersonAdmin: vi.fn(async () => ({ employeeId: "0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", version: 1, name: "Dewi" })),
}));
vi.mock("@/lib/server/http", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/server/http")>()),
  checkOrigin: () => undefined,
  enforceRateLimit: vi.fn(async (_request: Request, scope: string, limit: number) => {
    limits.calls.push([scope, limit]);
    const { ServiceError } = await import("@/lib/server/config");
    if (limits.blocked.has(scope)) throw new ServiceError(429, "Terlalu banyak permintaan. Tunggu sepuluh menit sebelum mencoba kembali.");
  }),
}));

const { POST } = await import("./route");
const login = (body: object) => POST(new Request("https://journey.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", "correct horse battery");
  vi.stubEnv("ADMIN_SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("SUPER_ADMIN_PASSWORD", "super secret owner");
  limits.calls = []; limits.blocked.clear();
});

describe("admin sign-in limits", () => {
  it("counts the network (30) and the account typed (5), in lower case", async () => {
    expect((await login({ identifier: "Dewi", password: "pw" })).status).toBe(200);
    expect(limits.calls).toEqual([["admin-login", 30], ["admin-login:dewi", 5]]);
  });

  it("counts the password alone as one account of its own", async () => {
    await login({ password: "super secret owner" });
    expect(limits.calls).toEqual([["admin-login", 30], ["admin-login:", 5]]);
  });

  it("blocks one account that tried too often without blocking another on the same network", async () => {
    limits.blocked.add("admin-login:dewi");
    expect((await login({ identifier: "dewi", password: "pw" })).status).toBe(429);
    expect((await login({ identifier: "tyo", password: "pw" })).status).toBe(200);
  });
});
