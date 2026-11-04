/*
 * The HR password's rules, shared by the admin forms (the strength hint) and the server (the
 * check that counts). Pure, so the browser can use it; hashing and the unlock cookie live in
 * src/lib/server/pra-wam/hr-lock.ts.
 */

export const HR_PASSWORD_MIN = 10;
export const HR_PASSWORD_MAX = 200;
/** How long one unlock lasts on a device. */
export const HR_UNLOCK_MINUTES = 30;
/** Wrong passwords in a row before unlocking pauses, and for how long. */
export const HR_MAX_FAILURES = 5;
export const HR_LOCKOUT_MINUTES = 15;

/** Why a new HR password cannot be used, or null. */
export function hrPasswordProblem(password: string): string | null {
  if (password.length < HR_PASSWORD_MIN) return `Password HR minimal ${HR_PASSWORD_MIN} karakter.`;
  if (password.length > HR_PASSWORD_MAX) return `Password HR paling panjang ${HR_PASSWORD_MAX} karakter.`;
  if (!password.trim()) return "Password HR tidak boleh hanya spasi.";
  return null;
}

export type HrPasswordStrength = { level: 0 | 1 | 2 | 3; label: string; hint: string };

/**
 * A rough hint while typing, not a rule: length counts most, then mixing kinds of characters.
 * A phrase of a few unrelated words is strong and easy to remember.
 */
export function hrPasswordStrength(password: string): HrPasswordStrength {
  if (password.length < HR_PASSWORD_MIN) return { level: 0, label: "Terlalu pendek", hint: `Minimal ${HR_PASSWORD_MIN} karakter.` };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(kind => kind.test(password)).length;
  const repeated = /^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|abcdefghij|qwertyuiop)/i.test(password);
  if (repeated) return { level: 1, label: "Lemah", hint: "Hindari huruf berulang atau urutan keyboard." };
  if (password.length >= 16 || (password.length >= 12 && kinds >= 3)) return { level: 3, label: "Kuat", hint: "Simpan di pengelola password, jangan di chat atau dokumen." };
  if (password.length >= 12 || kinds >= 3) return { level: 2, label: "Cukup", hint: "Lebih panjang lebih aman, misalnya beberapa kata acak." };
  return { level: 1, label: "Lemah", hint: "Tambah panjangnya, atau campur huruf besar, angka, dan simbol." };
}
