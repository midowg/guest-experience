import { describe, expect, it, vi } from "vitest";
import { createSeenQueue, refusedForGoodStatus, SEEN_BATCH, SEEN_KEY, SEEN_MAX } from "./seen";

/* The queue of "seen" marks (Instagram Instants): kept through a bad network and a closed tab. */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[SEEN_KEY, initial]] : []);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key), data };
}

describe("the seen queue", () => {
  it("sends what was added in one batch and forgets it once the server has it", async () => {
    const send = vi.fn(async () => true);
    const storage = memoryStorage();
    const queue = createSeenQueue(send, storage);
    queue.add(id(1)); queue.add(id(2)); queue.add(id(1));
    expect(queue.waiting()).toEqual([id(1), id(2)]);
    expect(JSON.parse(storage.data.get(SEEN_KEY)!)).toEqual([id(1), id(2)]);
    await queue.flush();
    expect(send).toHaveBeenCalledWith([id(1), id(2)], false);
    expect(queue.waiting()).toEqual([]);
    expect(queue.has(id(1))).toBe(false);
    expect(storage.data.has(SEEN_KEY)).toBe(false);
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the marks (in memory and in the phone's storage) when the network fails, and sends them again", async () => {
    const send = vi.fn<(ids: string[], keepalive: boolean) => Promise<boolean>>().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const storage = memoryStorage();
    const queue = createSeenQueue(send, storage);
    queue.add(id(1)); queue.add(id(2));
    await queue.flush();
    expect(queue.waiting()).toEqual([id(1), id(2)]);
    expect(queue.has(id(2))).toBe(true);
    expect(JSON.parse(storage.data.get(SEEN_KEY)!)).toEqual([id(1), id(2)]);
    queue.add(id(3));
    await queue.flush();
    expect(queue.waiting()).toEqual([id(1), id(2), id(3)]);
    await queue.flush();
    expect(send).toHaveBeenLastCalledWith([id(1), id(2), id(3)], false);
    expect(queue.waiting()).toEqual([]);
  });

  it("a closed tab does not lose the marks: the next queue starts with what the last one left", async () => {
    const storage = memoryStorage(JSON.stringify([id(5), "not-an-id", 7, id(6)]));
    const queue = createSeenQueue(async () => true, storage);
    expect(queue.waiting()).toEqual([id(5), id(6)]);
    expect(queue.has(id(5))).toBe(true);
  });

  it("works without storage (blocked, a private window) and with storage that throws", async () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    for (const storage of [null, throwing]) {
      const send = vi.fn(async () => true);
      const queue = createSeenQueue(send, storage);
      queue.add(id(1));
      await queue.flush();
      expect(send).toHaveBeenCalledWith([id(1)], false);
    }
  });

  it("sends at most one batch of 100 at a time, one flight at a time, and a mark added during a flight waits for the next", async () => {
    let release: (ok: boolean) => void = () => undefined;
    const send = vi.fn<(ids: string[]) => Promise<boolean>>(() => new Promise<boolean>(resolve => { release = resolve; }));
    const queue = createSeenQueue(send, null);
    for (let n = 1; n <= SEEN_BATCH + 5; n++) queue.add(id(n));
    const first = queue.flush();
    await queue.flush(); // during the flight: nothing
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(SEEN_BATCH);
    queue.add(id(900));
    expect(queue.has(id(1))).toBe(true); // in flight still counts as seen
    release(true);
    await first;
    expect(queue.waiting()).toEqual([id(101), id(102), id(103), id(104), id(105), id(900)]);
  });

  it("keeps a closing flush (keepalive) as the page goes away", async () => {
    const send = vi.fn(async () => true);
    const queue = createSeenQueue(send, null);
    queue.add(id(1));
    await queue.flush(true);
    expect(send).toHaveBeenCalledWith([id(1)], true);
  });

  it("holds at most SEEN_MAX marks (the oldest give way)", () => {
    const queue = createSeenQueue(async () => true, null);
    for (let n = 1; n <= SEEN_MAX + 3; n++) queue.add(id(n));
    expect(queue.waiting()).toHaveLength(SEEN_MAX);
    expect(queue.has(id(1))).toBe(false);
    expect(queue.has(id(SEEN_MAX + 3))).toBe(true);
  });

  it("a refusal that no retry changes (400, 404, 422) counts as answered; network, 5xx, 429 and 401 are tried again", () => {
    expect([400, 404, 422].every(refusedForGoodStatus)).toBe(true);
    expect([401, 403, 408, 429, 500, 503].some(refusedForGoodStatus)).toBe(false);
  });
});
