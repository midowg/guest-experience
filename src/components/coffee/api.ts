import type { Ice, Sugar, Temperature } from "@/lib/coffee/menu";
import type { CoffeePushInfo } from "@/lib/coffee/notify";
import type { CoffeeMe, MyOrder, MyState } from "@/lib/coffee/types";
import { coffeeApi, coffeePath, praWamApi } from "@/lib/routes";
import { browserDevice, type PushApi, type PushPort } from "./usePush";

/*
 * What the employee app asks the server (the F0 APIs under /api/coffee). The screens take this as
 * a prop, so the preview (/dev-preview/coffee/nyata) and the tests run the real components on a
 * make-believe one.
 */

export class CoffeeApiError extends Error {
  /** `status` is missing when no answer came back at all (no network, or the wait ran out: `timeout`). */
  constructor(message: string, public status?: number, public fieldErrors?: Record<string, string[]>, public timeout = false) {
    super(message);
    this.name = "CoffeeApiError";
  }
}

/** What the person picked in the sheet. The key that makes two sendings one claim is added by useCoffee. */
export type ClaimChoice = { slug: string; temperature: Temperature | null; sugar: Sugar | null; ice: Ice | null };
export type ClaimBody = ClaimChoice & { key: string };
export type ClaimDone = { order: MyOrder; me: CoffeeMe; message: string };

export type CoffeeApi = {
  state(): Promise<MyState>;
  /** One claim; the same key sent twice is one claim. 409 when the quota is full. */
  claim(body: ClaimBody): Promise<ClaimDone>;
  /** The person cancels their own claim while it still waits. 409 when it was processed meanwhile. */
  cancel(id: string): Promise<ClaimDone>;
  /** Ends the session and leaves for the sign-in page. Throws when the server could not be told (the session then still lives). */
  signOut(): Promise<void>;
};

/** How long one request may take. A phone on bad office wifi hangs rather than fails: after this the app says so and lets go. */
export const REQUEST_TIMEOUT_MS = 15_000;
export const TIMEOUT_TEXT = "Server terlalu lama menjawab. Periksa jaringan lalu coba lagi.";
export const OFFLINE_TEXT = "Tidak dapat terhubung. Periksa jaringan lalu coba lagi.";

/** The promise, or a refusal once `ms` have passed (the make-believe servers and a hung read are let go of the same way). */
export function within<T>(promise: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CoffeeApiError(TIMEOUT_TEXT, undefined, undefined, true)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, problem => { clearTimeout(timer); reject(problem); });
  });
}

/** One call to a Coffee API: the answer, or a CoffeeApiError with the server’s own words. Also used by the GA tablet (ga/api.ts). */
export async function request<T>(url: string, init: RequestInit = {}): Promise<{ data: T; message: string }> {
  // A request that hangs is given up after REQUEST_TIMEOUT_MS (the connection is let go too).
  const stop = typeof AbortController === "undefined" ? null : new AbortController();
  let late = false;
  const timer = setTimeout(() => { late = true; stop?.abort(); }, REQUEST_TIMEOUT_MS);
  let response: Response;
  let result: { ok: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]> };
  try {
    try {
      response = await fetch(url, { ...init, signal: stop?.signal, credentials: "same-origin", cache: "no-store", headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers } });
    } catch {
      throw late ? new CoffeeApiError(TIMEOUT_TEXT, undefined, undefined, true) : new CoffeeApiError(OFFLINE_TEXT);
    }
    try { result = await response.json(); }
    catch {
      if (late) throw new CoffeeApiError(TIMEOUT_TEXT, undefined, undefined, true);
      throw new CoffeeApiError("Server belum dapat memberikan jawaban. Coba lagi sebentar.", response.status);
    }
  } finally {
    clearTimeout(timer);
  }
  // The session ended: back to Coffee's own sign-in, and here again afterwards.
  if (response.status === 401 && typeof window !== "undefined") window.location.assign(coffeePath.login(`${window.location.pathname}${window.location.search}`));
  if (!response.ok || !result?.ok) throw new CoffeeApiError(result?.message || "Permintaan gagal. Coba lagi.", response.status, result?.fieldErrors);
  return { data: result.data as T, message: result.message ?? "" };
}

/**
 * Keluar: the employee session ends on the server, then the browser goes to a sign-in page (`to`:
 * the employee app's, or the tablet's own). Throws when the server could not be told.
 */
export async function endSession(to: string): Promise<void> {
  try { await request(praWamApi.logout, { method: "POST" }); }
  catch (problem) {
    // No answer, or the server failed: the session still lives, so the app must not pretend it ended.
    // Any other refusal (the session is already gone) leaves for the sign-in page all the same.
    if (!(problem instanceof CoffeeApiError) || answerUnknown(problem)) throw new CoffeeApiError("Belum bisa keluar. Periksa jaringan lalu coba lagi.");
  }
  // replace, not assign: the page with the person's data does not stay behind the sign-in page.
  window.location.replace(to);
}

export const coffeeClient: CoffeeApi = {
  state: async () => (await request<MyState>(coffeeApi.state)).data,
  async claim(body) {
    const result = await request<{ order: MyOrder; me: CoffeeMe }>(coffeeApi.claims, { method: "POST", body: JSON.stringify(body) });
    return { ...result.data, message: result.message };
  },
  async cancel(id) {
    const result = await request<{ order: MyOrder; me: CoffeeMe }>(coffeeApi.claim(id), { method: "DELETE" });
    return { ...result.data, message: result.message };
  },
  async signOut() {
    await endSession(coffeePath.login());
  },
};

/** Web push for the signed-in employee (F4), also what GA's tablet uses: the device belongs to whoever is signed in. */
export const coffeePushApi: PushApi = {
  info: async () => (await request<CoffeePushInfo>(coffeeApi.push)).data,
  async save(subscription, device) { await request(coffeeApi.push, { method: "POST", body: JSON.stringify({ subscription, device }) }); },
  async remove(endpoint) { await request(coffeeApi.push, { method: "DELETE", body: JSON.stringify({ endpoint }) }); },
  test: async () => (await request(coffeeApi.pushTest, { method: "POST" })).message,
};
/** The real thing: Coffee's push APIs and this browser. */
export const coffeePush: PushPort = { api: coffeePushApi, device: browserDevice };

export const errorText = (error: unknown): string => error instanceof CoffeeApiError ? error.message : "Terjadi kesalahan. Muat ulang lalu coba lagi.";
/** No definite answer came back (no network, the wait ran out, the server failed): the request may or may not have been carried out. */
export const answerUnknown = (error: unknown): boolean => !(error instanceof CoffeeApiError) || error.status === undefined || error.status >= 500;
/** The session ended (the app is already on its way to the sign-in page). */
export const signedOut = (error: unknown): boolean => error instanceof CoffeeApiError && error.status === 401;
/** The server refused because what the screen shows is out of date (quota filled, claim already processed). */
export const outOfDate = (error: unknown): boolean => error instanceof CoffeeApiError && (error.status === 409 || error.status === 404);

/** One key per claim: sending the same claim twice answers with the first one (useCoffee keeps it until a definite answer). randomUUID is missing on plain http, so the key is then drawn by hand. */
export function newKey(): string {
  const source = (typeof crypto === "undefined" ? undefined : crypto) as Partial<Crypto> | undefined;
  if (source?.randomUUID) return source.randomUUID();
  const drawn = source?.getRandomValues ? [...source.getRandomValues(new Uint8Array(32))] : null;
  const hex = Array.from({ length: 32 }, (_, index) => (drawn ? drawn[index] % 16 : Math.floor(Math.random() * 16)).toString(16));
  hex[12] = "4";
  hex[16] = "89ab"[Math.floor(Math.random() * 4)];
  const text = hex.join("");
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
