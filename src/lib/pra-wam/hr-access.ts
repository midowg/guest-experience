/*
 * Data HR access, the parts the admin pages and the server share. Data HR opens with the WAM email
 * of a person on the form's HR access list (cq_forms.hr_access, kept by the super admin), so the
 * log shows who opened what. Pure, so the browser can use it; the checks live in
 * src/lib/server/pra-wam/hr-lock.ts.
 */

export const HR_ACCESS_MIGRATION = "202611040012_wam_hr_access.sql";
/** At most this many people on the list (the database checks it too). */
export const HR_ACCESS_MAX = 20;
/** How long one unlock lasts on a device. */
export const HR_UNLOCK_MINUTES = 30;
/** Failed tries before unlocking pauses (per network and per email), and for how long. */
export const HR_MAX_FAILURES = 5;
export const HR_LOCKOUT_MINUTES = 15;
export const HR_EMAIL_MAX = 254;

/** One answer for an unknown email and for a person not on the list, so it does not tell who has access. */
export const HR_NO_ACCESS = "Email ini tidak punya akses Data HR.";

/** The email as compared: trimmed, lower case. */
export const normalEmail = (email: string) => email.trim().toLowerCase();
