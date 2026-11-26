import type { Ice, Sugar, Temperature } from "@/lib/coffee/menu";
import type { CoffeeMe, MyOrder, MyState } from "@/lib/coffee/types";
import { coffeeApi, coffeePath, praWamApi } from "@/lib/routes";

/*
 * What the employee app asks the server (the F0 APIs under /api/coffee). The screens take this as
 * a prop, so the preview (/dev-preview/coffee/nyata) and the tests run the real components on a
 * make-believe one.
 */

export class CoffeeApiError extends Error {
  constructor(message: string, public status?: number, public fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "CoffeeApiError";
  }
}

export type ClaimBody = { slug: string; temperature: Temperature; sugar: Sugar; ice: Ice; key: string };
export type ClaimDone = { order: MyOrder; me: CoffeeMe; message: string };

export type CoffeeApi = {
  state(): Promise<MyState>;
  /** One claim; the same key sent twice is one claim. 409 when the quota is full. */
  claim(body: ClaimBody): Promise<ClaimDone>;
  /** The person cancels their own claim while it still waits. 409 when it was processed meanwhile. */
  cancel(id: string): Promise<ClaimDone>;
  signOut(): Promise<void>;
};

/** One call to a Coffee API: the answer, or a CoffeeApiError with the server’s own words. Also used by the GA tablet (ga/api.ts). */
export async function request<T>(url: string, init: RequestInit = {}): Promise<{ data: T; message: string }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch {
    throw new CoffeeApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  }
  let result: { ok: boolean; data?: T; message?: string; fieldErrors?: Record<string, string[]> };
  try { result = await response.json(); }
  catch { throw new CoffeeApiError("Server belum dapat memberikan jawaban. Coba lagi sebentar.", response.status); }
  // The session ended: back to Coffee's own sign-in, and here again afterwards.
  if (response.status === 401 && typeof window !== "undefined") window.location.assign(coffeePath.login(`${window.location.pathname}${window.location.search}`));
  if (!response.ok || !result?.ok) throw new CoffeeApiError(result?.message || "Permintaan gagal. Coba lagi.", response.status, result?.fieldErrors);
  return { data: result.data as T, message: result.message ?? "" };
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
    try { await request(praWamApi.logout, { method: "POST" }); } catch { /* the cookie may already be gone */ }
    window.location.assign(coffeePath.login());
  },
};

export const errorText = (error: unknown): string => error instanceof CoffeeApiError ? error.message : "Terjadi kesalahan. Muat ulang lalu coba lagi.";
/** The server refused because what the screen shows is out of date (quota filled, claim already processed). */
export const outOfDate = (error: unknown): boolean => error instanceof CoffeeApiError && (error.status === 409 || error.status === 404);

/** One key per opened sheet: sending the same claim twice answers with the first one. randomUUID is missing on plain http, so the key is then drawn by hand. */
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
