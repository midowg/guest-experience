import type { Answers } from "@/lib/pra-wam/questionnaire";

/*
 * What this device keeps for the questionnaire, per form:
 * - the anonymous section's draft, which never reaches the server until it is sent in one piece;
 * - named answers not saved yet (offline, or a failed save), so a reload does not lose them.
 * Storage may be blocked (private mode); then nothing is kept and the page still works.
 */

export const anonymousDraftKey = (formId: string) => `wam-cq-anon:${formId}`;
export const pendingKey = (formId: string) => `wam-cq-pending:${formId}`;

export function readAnswers(key: string): Answers {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Answers : {};
  } catch { return {}; }
}

export function writeAnswers(key: string, answers: Answers) {
  try {
    if (Object.keys(answers).length) window.localStorage.setItem(key, JSON.stringify(answers));
    else window.localStorage.removeItem(key);
  } catch { /* storage blocked: kept in memory only */ }
}

export function forget(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* storage blocked */ }
}
