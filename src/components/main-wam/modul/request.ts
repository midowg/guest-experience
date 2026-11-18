/*
 * JSON to and from the module APIs (agen D). An ended session reloads the screen: its gate sends the
 * person to the right sign-in page (Main WAM's or Pra WAM's) and back here (unless the caller keeps
 * the person where they are: the absen queue asks to sign in itself). No connection is told apart
 * (`offline`), and so is an answer that is not ours (`answered` false: a hotel Wi-Fi's login page, a
 * proxy's error), so a screen can keep the person's text or scan and say so.
 */

import { activeLang, t, translateKnown } from "@/lib/main-wam/i18n";

/** The words of a failure in the language on screen (the server writes Indonesian; known texts are translated). */
const say = (text: string) => translateKnown(activeLang(), text);

export class ModulError extends Error {
  constructor(message: string, public status = 0, public offline = false, public answered = false) {
    super(message);
    this.name = "ModulError";
  }
}

export async function modulRequest<T>(url: string, init: { method?: string; json?: unknown; reloadOnSignOut?: boolean } = {}): Promise<{ data: T; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new ModulError(t(activeLang(), "srv.noSignal"), 0, true);
  }
  let result: { ok?: unknown; data?: T; message?: unknown } = {};
  try { result = await response.json(); } catch { /* not JSON */ }
  // Ours: JSON with ok true or false (success/failure of src/lib/server/http.ts).
  const answered = !!result && typeof result === "object" && typeof result.ok === "boolean";
  const message = answered && typeof result.message === "string" ? result.message : "";
  if (response.status === 401 && init.reloadOnSignOut !== false && typeof window !== "undefined") window.location.reload();
  if (!response.ok || result.ok !== true) throw new ModulError(say(message) || t(activeLang(), "srv.notDoneSoon"), response.status, false, answered);
  return { data: result.data as T, message };
}

/** The words to show for any failure. */
export const errorText = (error: unknown) => (error instanceof ModulError ? error.message : t(activeLang(), "srv.notDoneSoon"));
