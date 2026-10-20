import { describe, expect, it } from "vitest";
import { adminAuthConfig, isDeviceId, passwordMatches, safeNext, SESSION_TTL_SECONDS, signSession, verifySession } from "./admin-token";

const env = { ADMIN_PASSWORD: "correct horse battery", ADMIN_SESSION_SECRET: "s".repeat(32) };
const config = adminAuthConfig(env)!;
const now = Date.UTC(2026, 9, 20, 3, 0, 0);

describe("adminAuthConfig", () => {
  it("fails closed when the password or secret is missing or short", () => {
    expect(adminAuthConfig({})).toBeNull();
    expect(adminAuthConfig({ ...env, ADMIN_PASSWORD: "short" })).toBeNull();
    expect(adminAuthConfig({ ...env, ADMIN_SESSION_SECRET: "s".repeat(31) })).toBeNull();
    expect(config).toEqual({ password: env.ADMIN_PASSWORD, secret: env.ADMIN_SESSION_SECRET });
  });
});

describe("passwordMatches", () => {
  it("accepts only the exact password", () => {
    expect(passwordMatches(config, env.ADMIN_PASSWORD)).toBe(true);
    expect(passwordMatches(config, `${env.ADMIN_PASSWORD} `)).toBe(false);
    expect(passwordMatches(config, "")).toBe(false);
  });
});

describe("session tokens", () => {
  it("verifies a fresh token until it expires", () => {
    const token = signSession(config, now);
    expect(verifySession(config, token, now)).toBe(true);
    expect(verifySession(config, token, now + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
    expect(verifySession(config, token, now + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });

  it("rejects tampering, other secrets, and a changed password", () => {
    const token = signSession(config, now);
    const [version, expires, mac] = token.split(".");
    expect(verifySession(config, `${version}.${Number(expires) + 3600}.${mac}`, now)).toBe(false);
    expect(verifySession(config, `${version}.${expires}.${mac.replace(/^./, c => (c === "0" ? "1" : "0"))}`, now)).toBe(false);
    expect(verifySession({ ...config, secret: "t".repeat(32) }, token, now)).toBe(false);
    expect(verifySession({ ...config, password: "another password!" }, token, now)).toBe(false);
    expect(verifySession(null, token, now)).toBe(false);
    expect(verifySession(config, undefined, now)).toBe(false);
    expect(verifySession(config, "garbage", now)).toBe(false);
  });
});

describe("helpers", () => {
  it("recognises random v4 device ids only", () => {
    expect(isDeviceId("0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11")).toBe(true);
    expect(isDeviceId("not-a-uuid")).toBe(false);
    expect(isDeviceId(undefined)).toBe(false);
  });

  it("only returns to admin paths after login", () => {
    expect(safeNext("/admin/events/abc?x=1")).toBe("/admin/events/abc?x=1");
    expect(safeNext("/admin")).toBe("/admin");
    for (const bad of ["https://evil.example/admin", "//evil.example", "/e/acara", "/administrator", "/admin/login", "/admin\\..", null, undefined]) {
      expect(safeNext(bad)).toBe("/admin");
    }
  });
});
