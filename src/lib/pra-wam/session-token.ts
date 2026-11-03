import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * The Pra WAM sign-in cookie: one person, signed with WAM_SESSION_SECRET. The password is
 * checked by Supabase Auth; after that this cookie keeps the person signed in on the device
 * ("sekali masuk"). The account's session_version is part of it, so raising that number in
 * pw_accounts signs the person out everywhere. Pure logic, no `server-only`, so it can be tested.
 */

export const PRA_WAM_COOKIE = "wk_prawam";
export const PRA_WAM_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type PraWamSession = { employeeId: string; version: number };

/** Fail closed: without a long enough secret nobody can sign in. */
export function praWamSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.WAM_SESSION_SECRET ?? "";
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

const signature = (secret: string, body: string) => createHmac("sha256", secret).update(`prawam\0v1\0${body}`).digest("hex");

export function signPraWamSession(secret: string, session: PraWamSession, now = Date.now()): string {
  const body = `${session.employeeId}.${session.version}.${Math.floor(now / 1000) + PRA_WAM_SESSION_TTL_SECONDS}`;
  return `v1.${body}.${signature(secret, body)}`;
}

export function verifyPraWamSession(secret: string | null, token: string | undefined, now = Date.now()): PraWamSession | null {
  if (!secret || !token) return null;
  const match = /^v1\.([0-9a-f-]{36})\.(\d{1,6})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match || !UUID.test(match[1])) return null;
  const expires = Number(match[3]) * 1000;
  if (expires <= now || expires > now + PRA_WAM_SESSION_TTL_SECONDS * 1000) return null;
  const expected = signature(secret, `${match[1]}.${match[2]}.${match[3]}`);
  if (!timingSafeEqual(Buffer.from(match[4], "hex"), Buffer.from(expected, "hex"))) return null;
  return { employeeId: match[1], version: Number(match[2]) };
}

/** Only Pra WAM pages are allowed as the place to go after signing in. */
export function safePraWamNext(value: string | null | undefined): string | null {
  if (!value || !/^\/pra-wam(?:[/?#]|$)/.test(value) || /^\/pra-wam\/masuk(?:[/?#]|$)/.test(value) || /[\\\s]/.test(value)) return null;
  return value;
}
