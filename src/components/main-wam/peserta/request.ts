import { activeLang, t, translateKnown } from "@/lib/main-wam/i18n";
import { mainWamPath, praWamApi } from "@/lib/routes";

/*
 * JSON in and out for Main WAM's screens (as Pra WAM's praWamRequest, with Main WAM's own sign-in
 * when the session has ended). The words of a failure are always for people: no codes.
 */

export class MwRequestError extends Error {
  constructor(message: string, public status = 0, public fieldErrors?: Record<string, string[]>, public offline = false) {
    super(message);
    this.name = "MwRequestError";
  }
}

/** Signing in and changing a password answer 401 for a wrong password, not for an ended session. */
const SIGNING_IN = [praWamApi.login, praWamApi.password, praWamApi.forgot];

export async function mwRequest<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ data: T; message: string }> {
  const { json, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest, credentials: "same-origin", cache: "no-store",
      ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...rest.headers } } : {}),
    });
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new MwRequestError(t(activeLang(), offline ? "err.offline" : "err.noConnection"), 0, undefined, true);
  }
  let result: { ok?: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]> };
  try { result = await response.json(); } catch { throw new MwRequestError(t(activeLang(), "err.serverSilent"), response.status); }
  if (response.status === 401 && !SIGNING_IN.includes(url) && typeof window !== "undefined") {
    window.location.assign(mainWamPath.login(`${window.location.pathname}${window.location.search}`));
  }
  if (!response.ok || !result.ok) throw new MwRequestError(translateKnown(activeLang(), result.message || t(activeLang(), "err.notDone")), response.status, result.fieldErrors);
  return { data: result.data as T, message: result.message ?? "" };
}

/** The words of any failure. */
export const failText = (error: unknown) => (error instanceof MwRequestError ? error.message : t(activeLang(), "err.generic"));
