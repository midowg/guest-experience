/*
 * "Seen" in the stack (Instagram Instants): a photo that has been in front is told to the server (POST momen/dilihat,
 * 100 at a time) and then no longer comes back in the stack. The list is kept in small batches and survives a bad
 * network: an id stays queued (and in the phone's storage, so a closed tab does not lose it) until the server has
 * answered for it. Pure apart from the storage and the send it is given.
 */

export const SEEN_KEY = "mw-momen-dilihat";
/** The server takes this many ids at once (photosSeenSchema). */
export const SEEN_BATCH = 100;
/** The queue keeps at most this many ids (a phone that stays offline for a whole event day). */
export const SEEN_MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Answers of the server that no retry will change: the ids were refused as they are (400, 404, 422). */
export const refusedForGoodStatus = (status: number) => status === 400 || status === 404 || status === 422;

/** The send: true = the server has them (or refused them for good), false = try again later. */
export type SeenSend = (ids: string[], keepalive: boolean) => Promise<boolean>;
type SeenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SeenQueue = {
  /** A photo came to the front (or was swiped): remember it. */
  add: (id: string) => void;
  /** Sent, or waiting to be sent: the stack must not show it again. */
  has: (id: string) => boolean;
  /** Ids still waiting for the server, oldest first. */
  waiting: () => string[];
  /** Sends up to one batch; one at a time (a call during a flight does nothing). Never throws. */
  flush: (keepalive?: boolean) => Promise<void>;
};

export function createSeenQueue(send: SeenSend, storage: SeenStorage | null): SeenQueue {
  const waiting = new Set<string>();
  const sending = new Set<string>();
  let busy = false;
  const save = () => {
    const all = [...sending, ...waiting];
    try { if (all.length) storage?.setItem(SEEN_KEY, JSON.stringify(all)); else storage?.removeItem(SEEN_KEY); } catch { /* storage may throw (private window): the memory queue still works */ }
  };
  try {
    const stored = JSON.parse(storage?.getItem(SEEN_KEY) ?? "[]") as unknown;
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === "string" && UUID.test(id) && waiting.size < SEEN_MAX) waiting.add(id.toLowerCase());
  } catch { /* nothing usable stored */ }
  return {
    add(id) {
      if (waiting.has(id) || sending.has(id)) return;
      waiting.add(id);
      while (waiting.size > SEEN_MAX) { const [oldest] = waiting; if (oldest === undefined) break; waiting.delete(oldest); }
      save();
    },
    has: id => waiting.has(id) || sending.has(id),
    waiting: () => [...waiting],
    async flush(keepalive = false) {
      if (busy) return;
      const ids = [...waiting].slice(0, SEEN_BATCH);
      if (!ids.length) return;
      busy = true;
      ids.forEach(id => { waiting.delete(id); sending.add(id); });
      let ok = false;
      try { ok = await send(ids, keepalive); } catch { ok = false; }
      ids.forEach(id => { sending.delete(id); if (!ok) waiting.add(id); });
      // Failed ids go back to the front of the line (they are the oldest).
      if (!ok) { const rest = [...waiting].filter(id => !ids.includes(id)); waiting.clear(); [...ids, ...rest].forEach(id => waiting.add(id)); }
      save();
      busy = false;
    },
  };
}
