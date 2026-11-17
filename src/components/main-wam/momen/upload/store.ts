import type { QueueItem } from "@/lib/main-wam/momen/queue";

/*
 * Where queued photos wait on the phone: IndexedDB ("mw-momen", store "antrean", one row per
 * clientId), bytes as ArrayBuffer. Without IndexedDB (a private window, storage blocked, quota) the
 * queue lives in memory for this visit, so sending still works; only a closed app loses it then.
 */

export interface QueueStore {
  all(): Promise<QueueItem[]>;
  put(item: QueueItem): Promise<void>;
  remove(clientId: string): Promise<void>;
  /** False when it fell back to memory (the photo would not survive closing the app). */
  readonly lasting: boolean;
}

export function memoryStore(): QueueStore {
  const items = new Map<string, QueueItem>();
  return {
    lasting: false,
    all: async () => [...items.values()],
    put: async item => { items.set(item.clientId, item); },
    remove: async clientId => { items.delete(clientId); },
  };
}

const DB = "mw-momen", STORE = "antrean";

function request<T>(work: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { work.onsuccess = () => resolve(work.result); work.onerror = () => reject(work.error); });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB, 1);
    opening.onupgradeneeded = () => { if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE, { keyPath: "clientId" }); };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error("blocked"));
  });
}

/** A write is kept only when its transaction completes (a full disk aborts it there). */
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
}

/** The phone's queue: IndexedDB when it works, memory otherwise (and from the first failure on). */
export function phoneStore(): QueueStore {
  const memory = memoryStore();
  let database: Promise<IDBDatabase | null> | null = typeof indexedDB === "undefined" ? null : open().catch(() => null);
  let lasting = !!database;
  const fallback = () => { database = null; lasting = false; };
  const db = async () => { const found = database ? await database : null; if (!found) fallback(); return found; };
  return {
    get lasting() { return lasting; },
    all: async () => {
      const found = await db();
      let stored: QueueItem[] = [];
      if (found) {
        try { stored = await request(found.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<QueueItem[]>); } catch { fallback(); }
      }
      // Items kept in memory (after a failure) count too.
      const inMemory = await memory.all();
      return [...stored.filter(item => !inMemory.some(other => other.clientId === item.clientId)), ...inMemory];
    },
    put: async item => {
      const found = await db();
      if (found) {
        try { const transaction = found.transaction(STORE, "readwrite"); transaction.objectStore(STORE).put(item); await done(transaction); return; } catch { fallback(); }
      }
      await memory.put(item);
    },
    remove: async clientId => {
      await memory.remove(clientId);
      const found = await db();
      if (!found) return;
      try { const transaction = found.transaction(STORE, "readwrite"); transaction.objectStore(STORE).delete(clientId); await done(transaction); } catch { /* gone with memory */ }
    },
  };
}
