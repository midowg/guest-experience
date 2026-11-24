
/*
 * The phone's queue of photos to send (RISET §3, U02–U04): a photo is saved on the phone first and
 * then sent, so no photo is lost without a signal. Each has the phone's own id (clientId): sending
 * it twice keeps it once on the server. The rules here are pure (tested); the store (IndexedDB) and
 * the sender live in the component (src/components/main-wam/momen/upload/).
 */

export type QueueState =
  /** Waiting to be sent (or to be tried again at nextAt). */
  | "antre"
  /** The server refused it for good (too large, not a photo): Coba lagi or Hapus in Fotoku. */
  | "gagal"
  /** The session ended: waiting until the person signs in again. */
  | "masuk";

export type QueueItem = {
  clientId: string;
  /** Photos picked together (U04) share a batch: one toast for all. */
  batch: string;
  sessionId: string | null;
  takenAt: string;
  createdAt: number;
  width: number;
  height: number;
  /** JPEG bytes (ArrayBuffer, not Blob: WebKit has lost Blobs kept in IndexedDB). */
  besar: ArrayBuffer;
  kecil: ArrayBuffer;
  ubin: ArrayBuffer;
  state: QueueState;
  attempts: number;
  /** Not before this (ms since epoch): the backoff. */
  nextAt: number;
  /** The last failure in plain words. */
  error: string | null;
  /** The last try failed for want of a network (the camera's "Offline · 2 foto antre"). */
  offline: boolean;
  /** The photo's id once the server named it (start): Batalkan after that removes it there too. */
  photoId: string | null;
  /** Not sent at once (offline, or retried): its sending is told with "2 foto terkirim" (U03). */
  deferred: boolean;
  /** Friends tagged on the phone before sending (optional: a queue item of an older version has none). */
  tags?: string[];
  /** The coarse position when "Tandai lokasi" was on for this photo. */
  geo?: { latitude: number; longitude: number; accuracy: number } | null;
  /** Picked from the gallery. */
  gallery?: boolean;
};

/** Backoff with full jitter (AWS): random(0, min(5 minutes, 2 s × 2^attempt)). */
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_CAP_MS = 5 * 60_000;
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, Math.min(attempt, 20)));
  return Math.floor(random() * ceiling);
}

/**
 * What to do after an answer (RISET §3):
 *   ulang   no network, 5xx, 429: try again later (backoff)
 *   url     storage refused the upload address (expired, 403): ask for a new one now
 *   masuk   401: the session ended; keep the photo, send after signing in
 *   gagal   413, 415, 422, 409, 404: the server will not take it as it is
 */
export type Outcome = "ulang" | "url" | "masuk" | "gagal";
export function outcomeOf(status: number, step: "server" | "storage"): Outcome {
  if (status === 0 || status >= 500 || status === 429 || status === 408) return "ulang";
  if (step === "storage") return status === 403 || status === 400 ? "url" : "ulang";
  if (status === 401) return "masuk";
  return "gagal";
}

/** Who sends next: waiting items whose time has come, oldest first. */
export function nextDue(items: readonly QueueItem[], now: number): QueueItem | null {
  return items.filter(item => item.state === "antre" && item.nextAt <= now).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

/** When the sender should look again (the earliest waiting item), or null. */
export function nextWake(items: readonly QueueItem[]): number | null {
  const times = items.filter(item => item.state === "antre").map(item => item.nextAt);
  return times.length ? Math.min(...times) : null;
}

/** App opened, back online: everything waiting may go now (the backoff starts over). */
export function resetBackoff(items: readonly QueueItem[], now: number): QueueItem[] {
  return items.map(item => (item.state === "antre" || item.state === "masuk" ? { ...item, state: "antre", nextAt: Math.min(item.nextAt, now) } : item));
}

/** The camera's line and Fotoku's marks: how many wait, and whether it is for want of a network. */
export function queueSummary(items: readonly QueueItem[], online: boolean): { waiting: number; failed: number; offline: boolean } {
  const waiting = items.filter(item => item.state === "antre" || item.state === "masuk").length;
  return { waiting, failed: items.filter(item => item.state === "gagal").length, offline: waiting > 0 && (!online || items.some(item => item.state === "antre" && item.offline)) };
}

/** After a failed try: its new state. */
export function afterFailure(item: QueueItem, outcome: Outcome, message: string, now: number, random: () => number = Math.random, offline = false): QueueItem {
  const attempts = item.attempts + 1;
  switch (outcome) {
    // A new address at once, but not in a loop: from the third try on, with the backoff.
    case "url": return { ...item, attempts, nextAt: attempts > 2 ? now + backoffDelay(attempts, random) : now, error: message, offline: false };
    case "ulang": return { ...item, attempts, nextAt: now + backoffDelay(attempts, random), error: message, offline };
    case "masuk": return { ...item, attempts, state: "masuk", error: message, offline: false };
    case "gagal": return { ...item, attempts, state: "gagal", error: message, offline: false };
  }
}
