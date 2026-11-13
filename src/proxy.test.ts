import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { adminAuthConfig, SESSION_COOKIE, signPersonSession, signSession } from "./lib/admin-token";
import { config as proxyConfig, proxy } from "./proxy";

const env = { ADMIN_PASSWORD: "correct horse battery", ADMIN_SESSION_SECRET: "s".repeat(32) };
const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

describe("proxy", () => {
  beforeEach(() => { vi.stubEnv("ADMIN_PASSWORD", env.ADMIN_PASSWORD); vi.stubEnv("ADMIN_SESSION_SECRET", env.ADMIN_SESSION_SECRET); });
  afterEach(() => vi.unstubAllEnvs());

  it("covers admin pages and admin APIs", () => {
    expect(proxyConfig.matcher).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });

  it("redirects pages without a session to login, keeping the destination", () => {
    const response = proxy(request("/admin/events/abc?tab=1"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe("/admin/events/abc?tab=1");
    expect(new URL(proxy(request("/admin")).headers.get("location")!).search).toBe("");
  });

  it("answers APIs without a session with 401", async () => {
    const response = proxy(request("/api/admin/events"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("lets a valid session and the login page through", () => {
    const token = signSession(adminAuthConfig(env)!);
    expect(proxy(request("/admin", token)).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/admin/events", token)).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/admin/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/admin", "v1.1.bad")).status).toBe(307);
  });

  it("lets a personal admin through and passes the path on, replacing any the browser sent", () => {
    const token = signPersonSession(adminAuthConfig(env)!, "0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11", 1);
    const asked = new NextRequest("http://localhost:3000/admin/wam/akun", { headers: { cookie: `${SESSION_COOKIE}=${token}`, "x-wk-admin-path": "/admin" } });
    const response = proxy(asked);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-wk-admin-path")).toBe("/admin/wam/akun");
  });

  it("stays locked when the password is not configured", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    const token = signSession(adminAuthConfig(env)!);
    expect(proxy(request("/api/admin/events", token)).status).toBe(503);
    expect(proxy(request("/admin", token)).status).toBe(307);
  });
});
