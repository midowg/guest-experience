import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Pure session-token logic, shared by src/proxy.ts and the server helpers. No `server-only`
// import here: proxy is not compiled under the react-server condition.

export const SESSION_COOKIE = "wk_admin";
export const DEVICE_COOKIE = "wk_device";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const DEVICE_TTL_SECONDS = 2 * 365 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_SECRET_LENGTH = 32;

export type AdminRole = "admin" | "super";
/** `superPassword` is null when SUPER_ADMIN_PASSWORD is unset, short, or equal to ADMIN_PASSWORD. */
export type AdminAuthConfig = { password: string; superPassword: string | null; secret: string };
type Env = Record<string, string | undefined>;

/** Fail closed: a missing or short password/secret means nobody can sign in. */
export function adminAuthConfig(env: Env = process.env): AdminAuthConfig | null {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (password.length < MIN_PASSWORD_LENGTH || secret.length < MIN_SECRET_LENGTH) return null;
  const superPassword = env.SUPER_ADMIN_PASSWORD ?? "";
  return { password, secret, superPassword: superPassword.length >= MIN_PASSWORD_LENGTH && superPassword !== password ? superPassword : null };
}

function digest(value: string) { return createHash("sha256").update(value, "utf8").digest(); }

/**
 * Which role a typed password opens. Both comparisons always run, on equal-length digests, so
 * timing says nothing about which password (if any) was close.
 */
export function passwordRole(config: AdminAuthConfig, input: string): AdminRole | null {
  const typed = digest(input);
  const isAdmin = timingSafeEqual(typed, digest(config.password));
  const isSuper = timingSafeEqual(typed, digest(config.superPassword ?? `${config.password}\0none`));
  return config.superPassword && isSuper ? "super" : isAdmin ? "admin" : null;
}

// Each role's password is part of its key: changing ADMIN_PASSWORD signs admins out, changing
// SUPER_ADMIN_PASSWORD signs super admins out, and removing it ends every super session.
function signature(config: AdminAuthConfig, role: AdminRole, expires: number) {
  const password = role === "super" ? config.superPassword : config.password;
  return createHmac("sha256", `${config.secret}\0${role}\0${password}`).update(`admin\0v2\0${role}\0${expires}`).digest("hex");
}

export function signSession(config: AdminAuthConfig, role: AdminRole = "admin", now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `v2.${role === "super" ? "s" : "a"}.${expires}.${signature(config, role, expires)}`;
}

/** The role a valid session cookie carries, or null. */
export function verifySession(config: AdminAuthConfig | null, token: string | undefined, now = Date.now()): AdminRole | null {
  if (!config || !token) return null;
  const match = /^v2\.([as])\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return null;
  const role: AdminRole = match[1] === "s" ? "super" : "admin";
  if (role === "super" && !config.superPassword) return null;
  const expires = Number(match[2]);
  if (expires * 1000 <= now || expires * 1000 > now + SESSION_TTL_SECONDS * 1000) return null;
  return timingSafeEqual(Buffer.from(match[3], "hex"), Buffer.from(signature(config, role, expires), "hex")) ? role : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isDeviceId(value: string | undefined): value is string { return !!value && UUID.test(value); }

/** Only same-site admin paths are allowed as a post-login destination. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !/^\/admin(?:[/?#]|$)/.test(value) || /^\/admin\/login(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return "/admin";
  return value;
}
