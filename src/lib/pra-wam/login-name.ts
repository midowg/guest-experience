/*
 * Masuk dengan nama panggilan (13 Nov 2026, migration 202611130007): everyone may sign in with
 * their email or with a login name made from their nama panggilan ("dewi"; a second Dewi is
 * "dewi2"). Someone without an email (an intern, a daily worker) still gets a sign-in: Supabase Auth
 * needs an address, so theirs is one that can never receive mail (the reserved .invalid domain).
 * Pure, so it is tested without a server.
 */

export const LOGIN_NAME_MIGRATION = "202611130007_pw_login_name.sql";
/** Letters and digits, a dot inside, 2 to 40 characters, lowercase. */
export const LOGIN_NAME = /^[a-z0-9][a-z0-9.]{1,39}$/;
/** The sign-in address of someone without an email: never delivered to (RFC 2606 .invalid). */
export const NO_EMAIL_DOMAIN = "tanpa-email.wam.invalid";
export const noEmailAddress = (loginName: string) => `${loginName}@${NO_EMAIL_DOMAIN}`;
export const isNoEmailAddress = (address: string | null | undefined) => !!address && address.toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);

/** What was typed in the sign-in box is an email (has an @), else a login name. */
export const isEmailLike = (typed: string) => typed.includes("@");

/** "Dewi Lestari" with nickname "Dewi" → "dewi"; accents dropped, letters and digits only, at least two characters. */
export function loginSlug(nickname: string, fullName: string): string {
  const source = nickname.trim() || fullName.trim().split(/\s+/)[0] || "";
  const plain = source.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
  return (plain || "pengguna").padEnd(2, "x");
}

/** The slug itself when free, else the slug with the first free number from 2: "dewi", "dewi2", "dewi3". */
export function nextLoginName(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}${n}`)) return `${slug}${n}`;
}

/** What was typed as a login name, made comparable: trimmed, lowercase. */
export const normalizeLoginName = (typed: string) => typed.trim().toLowerCase();
