import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/lib/main-wam/momen/queue";
import { mainWamApi } from "@/lib/routes";
import { MomenQueue, type QueueEvent } from "./sender";
import { memoryStore } from "./store";

/*
 * The phone's queue of photos (U02–U04): saved first, then sent in three safe steps; without a
 * signal it waits (backoff) and is not lost; Batalkan never lets a waiting photo leave the phone and
 * removes one already sent; a photo the server already has (a lost answer) is not sent again.
 */

const item = (n: number, over: Partial<QueueItem> = {}): QueueItem => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`, batch: "b", sessionId: null, takenAt: "2027-01-05T08:20:00.000Z", createdAt: n,
  width: 1280, height: 1600, besar: new ArrayBuffer(10), kecil: new ArrayBuffer(5), ubin: new ArrayBuffer(2), state: "antre", attempts: 0, nextAt: 0,
  error: null, offline: false, photoId: null, deferred: false, ...over,
});

type Call = { url: string; method: string; body?: unknown };
let calls: Call[];
let online = true;
let startKind: "unggah" | "selesai" = "unggah";
let putStatus = 200;

function fakeFetch(url: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  calls.push({ url, method, body });
  if (!online) return Promise.reject(new TypeError("Failed to fetch"));
  const reply = (status: number, data: unknown) => Promise.resolve(new Response(JSON.stringify({ ok: status < 300, data, message: "" }), { status }));
  if (url === mainWamApi.photoStart) return reply(200, startKind === "selesai"
    ? { kind: "selesai", id: "p-1", visibleAt: "x" }
    : { kind: "unggah", id: "p-1", token: "t", uploads: { besar: "https://r2/b", kecil: "https://r2/k", ubin: "https://r2/u" } });
  if (url.startsWith("https://r2/")) return Promise.resolve(new Response(null, { status: putStatus }));
  if (url === mainWamApi.photoConfirm) return reply(200, { id: "p-1", visibleAt: "x" });
  if (url === mainWamApi.photo("p-1")) return reply(200, { id: "p-1" });
  return reply(404, null);
}

beforeEach(() => {
  calls = []; online = true; startKind = "unggah"; putStatus = 200;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const events = (queue: MomenQueue) => { const seen: QueueEvent[] = []; queue.onEvent(event => seen.push(event)); return seen; };

describe("the photo queue", () => {
  it("sends a photo in three steps (start, three uploads, confirm) and forgets it", async () => {
    const queue = new MomenQueue(memoryStore(), () => 1000);
    const seen = events(queue);
    await queue.add([item(1)]);
    await queue.flush();
    expect(calls.map(call => `${call.method} ${call.url}`)).toEqual([
      `POST ${mainWamApi.photoStart}`, "PUT https://r2/b", "PUT https://r2/k", "PUT https://r2/u", `POST ${mainWamApi.photoConfirm}`,
    ]);
    expect(calls[0].body).toMatchObject({ clientId: item(1).clientId, size: 10, thumbSize: 5, tileSize: 2 });
    expect(calls[4].body).toMatchObject({ token: "t" });
    expect(queue.snapshot().items).toEqual([]);
    expect(seen).toEqual([expect.objectContaining({ type: "sent", photoId: "p-1" })]);
  });

  it("keeps a photo without a signal, with a backoff, then sends it when back online (told as waited)", async () => {
    let now = 1000;
    const queue = new MomenQueue(memoryStore(), () => now);
    const seen = events(queue);
    online = false;
    await queue.add([item(1)]);
    await queue.flush();
    const waiting = queue.snapshot().items[0];
    expect(waiting).toMatchObject({ state: "antre", attempts: 1, offline: true, deferred: true });
    expect(waiting.nextAt).toBeGreaterThanOrEqual(1000);
    expect(queue.snapshot().summary).toMatchObject({ waiting: 1, offline: true });
    online = true; now = 2000;
    await queue.wake();
    await queue.flush();
    expect(queue.snapshot().items).toEqual([]);
    expect(seen.at(-1)).toMatchObject({ type: "sent", item: { deferred: true } });
  });

  it("does not send again a photo the server already kept (a lost answer)", async () => {
    startKind = "selesai";
    const queue = new MomenQueue(memoryStore(), () => 1000);
    await queue.add([item(1)]);
    await queue.flush();
    expect(calls.map(call => call.url)).toEqual([mainWamApi.photoStart]);
    expect(queue.snapshot().items).toEqual([]);
  });

  it("Batalkan: a waiting photo never leaves the phone; a sent one is removed on the server", async () => {
    online = false;
    const queue = new MomenQueue(memoryStore(), () => 1000);
    await queue.add([item(1)]);
    await queue.flush();
    calls = [];
    await queue.cancel(item(1).clientId);
    expect(queue.snapshot().items).toEqual([]);
    expect(calls).toEqual([]);
    online = true;
    await queue.add([item(2)]);
    await queue.flush();
    calls = [];
    await queue.cancel(item(2).clientId);
    expect(calls).toEqual([{ url: mainWamApi.photo("p-1"), method: "DELETE", body: { clientId: item(2).clientId } }]);
  });

  it("stops on a refusal (gagal, Coba lagi) and asks for a new address when storage refuses it", async () => {
    putStatus = 403;
    const queue = new MomenQueue(memoryStore(), () => 1000);
    await queue.add([item(1)]);
    await queue.flush();
    expect(queue.snapshot().items[0]).toMatchObject({ state: "antre", attempts: expect.any(Number) });
    expect(calls.filter(call => call.url === mainWamApi.photoStart).length).toBeGreaterThan(1);
    putStatus = 200;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (url === mainWamApi.photoStart
      ? Promise.resolve(new Response(JSON.stringify({ ok: false, message: "Isi berkas bukan foto JPEG." }), { status: 422 }))
      : fakeFetch(url, init))));
    const refused = new MomenQueue(memoryStore(), () => 1000);
    const seen = events(refused);
    await refused.add([item(3)]);
    await refused.flush();
    expect(refused.snapshot().items[0]).toMatchObject({ state: "gagal", error: "Isi berkas bukan foto JPEG." });
    expect(seen).toEqual([expect.objectContaining({ type: "failed" })]);
    // Coba lagi: tried again at once (refused again here, one more attempt counted).
    await refused.retry(item(3).clientId);
    await refused.flush();
    expect(refused.snapshot().items[0]).toMatchObject({ state: "gagal", attempts: 2 });
  });
});
