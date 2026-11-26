import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coffeeApi, coffeePath, praWamApi } from "@/lib/routes";
import { CoffeeApiError, OFFLINE_TEXT, REQUEST_TIMEOUT_MS, TIMEOUT_TEXT, answerUnknown, coffeeClient, newKey, request, signedOut, within } from "./api";

/*
 * The employee app's client (after the F2 audit, 26 Nov 2026): a request that hangs is given up,
 * an ended session leads to the sign-in page and back, signing out only leaves when the server
 * was told, and the key of a claim is a uuid also where the browser has no randomUUID.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const assign = vi.fn(), replace = vi.fn();

beforeEach(() => {
  assign.mockClear(); replace.mockClear();
  vi.stubGlobal("location", { ...window.location, assign, replace, pathname: coffeePath.orders, search: "" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("answers with the data and the server's words", async () => {
  const fetcher = vi.fn(async () => json(200, { ok: true, data: { n: 1 }, message: "Pengajuan terkirim." }));
  vi.stubGlobal("fetch", fetcher);
  expect(await request<{ n: number }>(coffeeApi.claims, { method: "POST", body: "{}" })).toEqual({ data: { n: 1 }, message: "Pengajuan terkirim." });
  const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" } });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

it("gives up a request that hangs after the limit, lets the connection go, and says so", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal ?? undefined;
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  const asked = request(coffeeApi.state).catch((problem: unknown) => problem);
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const problem = await asked as CoffeeApiError;
  expect(signal?.aborted).toBe(true);
  expect(problem).toBeInstanceOf(CoffeeApiError);
  expect(problem).toMatchObject({ message: TIMEOUT_TEXT, timeout: true, status: undefined });
  // No answer at all: the claim may or may not have arrived.
  expect(answerUnknown(problem)).toBe(true);
});

it("tells a lost network, a server that failed and a refusal apart", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const lost = await request(coffeeApi.state).catch((problem: unknown) => problem) as CoffeeApiError;
  expect(lost).toMatchObject({ message: OFFLINE_TEXT, timeout: false });
  expect(answerUnknown(lost)).toBe(true);

  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>502</html>", { status: 502 })));
  const broken = await request(coffeeApi.state).catch((problem: unknown) => problem) as CoffeeApiError;
  expect(broken).toMatchObject({ message: "Server belum dapat memberikan jawaban. Coba lagi sebentar.", status: 502 });
  expect(answerUnknown(broken)).toBe(true);

  vi.stubGlobal("fetch", vi.fn(async () => json(409, { ok: false, message: "Jatah bulan ini sudah habis." })));
  const refused = await request(coffeeApi.claims, { method: "POST", body: "{}" }).catch((problem: unknown) => problem) as CoffeeApiError;
  expect(refused).toMatchObject({ message: "Jatah bulan ini sudah habis.", status: 409 });
  expect(answerUnknown(refused)).toBe(false);
  expect(answerUnknown(new Error("x"))).toBe(true);
});

it("goes to Coffee's sign-in, and back here afterwards, when the session ended", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(401, { ok: false, message: "Sesi berakhir. Masuk lagi." })));
  const problem = await request(coffeeApi.state).catch((error: unknown) => error);
  expect(signedOut(problem)).toBe(true);
  expect(assign).toHaveBeenCalledWith(coffeePath.login(coffeePath.orders));
});

it("signs out: tells the server, then replaces the page with the sign-in page", async () => {
  const fetcher = vi.fn(async () => json(200, { ok: true, data: null }));
  vi.stubGlobal("fetch", fetcher);
  await coffeeClient.signOut();
  expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(praWamApi.logout);
  // replace: the page with the person's data is not left behind the sign-in page.
  expect(replace).toHaveBeenCalledWith(coffeePath.login());
  expect(assign).not.toHaveBeenCalled();
});

it("does not pretend to have signed out when the server could not be told", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  await expect(coffeeClient.signOut()).rejects.toMatchObject({ message: "Belum bisa keluar. Periksa jaringan lalu coba lagi." });
  expect(replace).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn(async () => json(500, { ok: false, message: "Galat." })));
  await expect(coffeeClient.signOut()).rejects.toBeInstanceOf(CoffeeApiError);
  expect(replace).not.toHaveBeenCalled();
});

it("lets a promise go after the limit and passes an answer or a refusal through", async () => {
  vi.useFakeTimers();
  const hung = within(new Promise(() => undefined), 100).catch((problem: unknown) => problem);
  await vi.advanceTimersByTimeAsync(100);
  expect(await hung).toMatchObject({ message: TIMEOUT_TEXT, timeout: true });
  await expect(within(Promise.resolve(7), 100)).resolves.toBe(7);
  await expect(within(Promise.reject(new CoffeeApiError("tidak", 409)), 100)).rejects.toMatchObject({ status: 409 });
  expect(vi.getTimerCount()).toBe(0);
});

it("draws a uuid as the key, also on plain http where randomUUID is missing", () => {
  expect(newKey()).toMatch(UUID);
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => { for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 37 + Math.floor(Math.random() * 256)) % 256; return bytes; } });
  const keys = new Set(Array.from({ length: 50 }, newKey));
  for (const key of keys) expect(key).toMatch(UUID);
  expect(keys.size).toBe(50);
  vi.stubGlobal("crypto", undefined);
  expect(newKey()).toMatch(UUID);
});
