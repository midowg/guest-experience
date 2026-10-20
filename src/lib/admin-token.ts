import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Pure session-token logic, shared by src/proxy.ts and the server helpers. No `server-only`
// import here: proxy is not compiled under the react-server condition.

export const SESSION_COOKIE = "wk_admin";
export const DEVICE_COOKIE = "wk_device";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const DEVICE_TTL_SECONDS = 2 * 365 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;

export type AdminAuthConfig = { password: string; secret: string };
type Env = Record<string, string | undefined>;

/** Fail closed: a missing or short password/secret means nobody can sign in. */
export function adminAuthConfig(env: Env = process.env): AdminAuthConfig | null {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (password.length < MIN_PASSWORD_LENGTH || secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

function digest(value: string) { return createHash("sha256").update(value, "utf8").digest(); }

/** Equal-length digests keep the comparison constant-time regardless of input length. */
export function passwordMatches(config: AdminAuthConfig, input: string): boolean {
  return timingSafeEqual(digest(input), digest(config.password));
}

// The password is part of the key, so changing ADMIN_PASSWORD signs every session out.
function signature(config: AdminAuthConfig, expires: number) {
  return createHmac("sha256", `${config.secret}\0${config.password}`).update(`admin\0v1\0${expires}`).digest("hex");
}

export function signSession(config: AdminAuthConfig, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `v1.${expires}.${signature(config, expires)}`;
}

export function verifySession(config: AdminAuthConfig | null, token: string | undefined, now = Date.now()): boolean {
  if (!config || !token) return false;
  const match = /^v1\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires * 1000 <= now || expires * 1000 > now + SESSION_TTL_SECONDS * 1000) return false;
  return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(signature(config, expires), "hex"));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function isDeviceId(value: string | undefined): value is string { return !!value && UUID.test(value); }

/** Only same-site admin paths are allowed as a post-login destination. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !/^\/admin(?:[/?#]|$)/.test(value) || /^\/admin\/login(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return "/admin";
  return value;
}
