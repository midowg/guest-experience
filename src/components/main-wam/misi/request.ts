/*
 * JSON to and from the Misi APIs. An ended session reloads the screen (its gate sends the person to the
 * right sign-in page and back); no connection is told apart (`offline`). The server writes Indonesian;
 * the texts the dictionary knows are said in the language on screen.
 */

import { activeLang, t, translateKnown } from "@/lib/main-wam/i18n";

export class MisiError extends Error {
  constructor(message: string, public status = 0, public offline = false) {
    super(message);
    this.name = "MisiError";
  }
}

export async function misiRequest<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<{ data: T; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new MisiError(t(activeLang(), "srv.noSignal"), 0, true);
  }
  let result: { ok?: unknown; data?: T; message?: unknown } = {};
  try { result = await response.json(); } catch { /* not JSON */ }
  const answered = !!result && typeof result === "object" && typeof result.ok === "boolean";
  const message = answered && typeof result.message === "string" ? translateKnown(activeLang(), result.message) : "";
  if (response.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!response.ok || result.ok !== true) throw new MisiError(message || t(activeLang(), "srv.notDoneSoon"), response.status);
  return { data: result.data as T, message };
}

/** A direct upload of one JPEG to its signed storage address (never through this server). */
export async function putJpeg(url: string, blob: Blob): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
  } catch {
    throw new MisiError(t(activeLang(), "srv.noSignal"), 0, true);
  }
  if (!response.ok) throw new MisiError(t(activeLang(), "srv.momen.storageRefused"), response.status);
}

export const errorText = (error: unknown) => (error instanceof MisiError ? error.message : t(activeLang(), "srv.notDoneSoon"));
export const isDoneAlready = (error: unknown) => error instanceof MisiError && error.status === 409;
