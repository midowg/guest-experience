import { describe, expect, it } from "vitest";
import { adminAuthConfig, isDeviceId, passwordRole, safeNext, SESSION_TTL_SECONDS, signSession, verifySession } from "./admin-token";

const env = { ADMIN_PASSWORD: "correct horse battery", ADMIN_SESSION_SECRET: "s".repeat(32), SUPER_ADMIN_PASSWORD: "super secret owner" };
const config = adminAuthConfig(env)!;
const now = Date.UTC(2026, 9, 20, 3, 0, 0);

describe("adminAuthConfig", () => {
  it("fails closed when the password or secret is missing or short", () => {
    expect(adminAuthConfig({})).toBeNull();
    expect(adminAuthConfig({ ...env, ADMIN_PASSWORD: "1234567" })).toBeNull();
    expect(adminAuthConfig({ ...env, ADMIN_PASSWORD: "12345678" })).not.toBeNull();
    expect(adminAuthConfig({ ...env, ADMIN_SESSION_SECRET: "s".repeat(31) })).toBeNull();
    expect(config).toEqual({ password: env.ADMIN_PASSWORD, secret: env.ADMIN_SESSION_SECRET, superPassword: env.SUPER_ADMIN_PASSWORD });
  });
  it("has no super admin when its password is missing, short, or the same as the admin one", () => {
    expect(adminAuthConfig({ ...env, SUPER_ADMIN_PASSWORD: undefined })!.superPassword).toBeNull();
    expect(adminAuthConfig({ ...env, SUPER_ADMIN_PASSWORD: "short" })!.superPassword).toBeNull();
    expect(adminAuthConfig({ ...env, SUPER_ADMIN_PASSWORD: env.ADMIN_PASSWORD })!.superPassword).toBeNull();
  });
});

describe("passwordRole", () => {
  it("opens the role of the exact password only", () => {
    expect(passwordRole(config, env.ADMIN_PASSWORD)).toBe("admin");
    expect(passwordRole(config, env.SUPER_ADMIN_PASSWORD)).toBe("super");
    expect(passwordRole(config, `${env.ADMIN_PASSWORD} `)).toBeNull();
    expect(passwordRole(config, "")).toBeNull();
    expect(passwordRole({ ...config, superPassword: null }, env.SUPER_ADMIN_PASSWORD)).toBeNull();
  });
});

describe("session tokens", () => {
  it("carries the role and stays valid until it expires", () => {
    const admin = signSession(config, "admin", now);
    const owner = signSession(config, "super", now);
    expect(verifySession(config, admin, now)).toBe("admin");
    expect(verifySession(config, owner, now)).toBe("super");
    expect(verifySession(config, admin, now + (SESSION_TTL_SECONDS - 1) * 1000)).toBe("admin");
    expect(verifySession(config, admin, now + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  it("rejects tampering, a raised role, other secrets, and changed passwords", () => {
    const token = signSession(config, "admin", now);
    const [version, role, expires, mac] = token.split(".");
    expect(role).toBe("a");
    expect(verifySession(config, `${version}.s.${expires}.${mac}`, now)).toBeNull();
    expect(verifySession(config, `${version}.${role}.${Number(expires) + 3600}.${mac}`, now)).toBeNull();
    expect(verifySession(config, `${version}.${role}.${expires}.${mac.replace(/^./, c => (c === "0" ? "1" : "0"))}`, now)).toBeNull();
    expect(verifySession({ ...config, secret: "t".repeat(32) }, token, now)).toBeNull();
    expect(verifySession({ ...config, password: "another password!" }, token, now)).toBeNull();
    expect(verifySession(null, token, now)).toBeNull();
    expect(verifySession(config, undefined, now)).toBeNull();
    expect(verifySession(config, "garbage", now)).toBeNull();
  });

  it("ends super sessions when the super password changes or is removed, without touching admins", () => {
    const owner = signSession(config, "super", now);
    const admin = signSession(config, "admin", now);
    expect(verifySession({ ...config, superPassword: "a new owner pass" }, owner, now)).toBeNull();
    expect(verifySession({ ...config, superPassword: null }, owner, now)).toBeNull();
    expect(verifySession({ ...config, superPassword: "a new owner pass" }, admin, now)).toBe("admin");
  });

  it("no longer accepts tokens from before roles", () => {
    expect(verifySession(config, `v1.${Math.floor(now / 1000) + 60}.${"a".repeat(64)}`, now)).toBeNull();
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
