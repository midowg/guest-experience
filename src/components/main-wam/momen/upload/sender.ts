import { activeLang, t } from "@/lib/main-wam/i18n";
import type { PhotoStart } from "@/lib/main-wam/momen/filters";
import { afterFailure, nextDue, nextWake, outcomeOf, queueSummary, resetBackoff, type QueueItem } from "@/lib/main-wam/momen/queue";
import type { UploadDone, UploadStart } from "@/lib/main-wam/momen/types";
import { mainWamApi } from "@/lib/routes";
import { phoneStore, type QueueStore } from "./store";

/*
 * The sender of queued photos (RISET §3): one per tab, one photo at a time (two would fight for a
 * weak mobile signal), each in three steps that are safe to repeat (start → three PUTs straight to
 * storage → confirm), a new upload address on every try. It runs when the app opens, comes back to
 * the front, gets its signal back, after each photo, and on a timer while the app is open (iPhone has
 * no Background Sync). Between tabs a Web Lock keeps one sender at work.
 */

export type Answer<T> = { status: number; data: T | null; message: string };

/** JSON to a Momen API, without leaving the page on 401 (the queue keeps the photo instead). */
export async function momenFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<Answer<T>> {
  const { json, ...rest } = init;
  try {
    const response = await fetch(url, {
      ...rest, credentials: "same-origin", cache: "no-store",
      ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...rest.headers } } : {}),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; data?: T; message?: string } | null;
    return { status: response.status, data: response.ok && body?.ok ? (body.data ?? null) : null, message: body?.message ?? "" };
  } catch {
    return { status: 0, data: null, message: t(activeLang(), "srv.momen.noSignal") };
  }
}

async function put(url: string, bytes: ArrayBuffer): Promise<number> {
  try {
    const response = await fetch(url, { method: "PUT", body: new Blob([bytes], { type: "image/jpeg" }), headers: { "Content-Type": "image/jpeg" } });
    return response.status;
  } catch {
    return 0;
  }
}

export type QueueEvent =
  | { type: "sent"; item: QueueItem; photoId: string }
  | { type: "failed"; item: QueueItem }
  | { type: "masuk"; item: QueueItem };

type Listener = () => void;
export type QueueSnapshot = { items: QueueItem[]; sending: string | null; summary: ReturnType<typeof queueSummary>; lasting: boolean };
type EventListener = (event: QueueEvent) => void;

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

export class MomenQueue {
  private items: QueueItem[] = [];
  private loaded: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private current: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: string | null = null;
  private cancelled = new Set<string>();
  /** Sent in this visit: Batalkan still reaches them. */
  private sent = new Map<string, string>();
  private persisted = false;

  constructor(private store: QueueStore = phoneStore(), private now: () => number = () => Date.now()) {}

  private cached: QueueSnapshot | null = null;
  /** The items as stored (for the UI: counts, Fotoku's marks); the same object until something changes. */
  snapshot = (): QueueSnapshot => {
    this.cached ??= { items: this.items, sending: this.sending, summary: queueSummary(this.items, isOnline()), lasting: this.store.lasting };
    return this.cached;
  };

  subscribe = (listener: Listener): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  onEvent(listener: EventListener): () => void { this.eventListeners.add(listener); return () => { this.eventListeners.delete(listener); }; }
  /**
   * The server's id of a photo of this visit once it has it (the upload is confirmed), waiting at most `ms`; null
   * when it does not come in time (no signal, a slow upload): "Lihat" then opens Fotoku, where the queue shows it.
   */
  sentId(clientId: string, ms: number): Promise<string | null> {
    const known = this.sent.get(clientId);
    if (known) return Promise.resolve(known);
    return new Promise(resolve => {
      const done = (id: string | null) => { clearTimeout(timer); off(); resolve(id); };
      const off = this.onEvent(event => { if (event.type === "sent" && event.item.clientId === clientId) done(event.photoId); });
      const timer = setTimeout(() => done(this.sent.get(clientId) ?? null), ms);
    });
  }
  /** Online or offline changed: the summary says so. */
  refresh() { this.changed(); }
  private changed() { this.cached = null; this.listeners.forEach(listener => listener()); }
  private emit(event: QueueEvent) { this.eventListeners.forEach(listener => listener(event)); }

  private async reload(): Promise<void> {
    this.items = (await this.store.all().catch(() => this.items)).filter(item => !this.cancelled.has(item.clientId));
    this.changed();
  }
  load(): Promise<void> {
    if (!this.loaded) this.loaded = this.reload();
    return this.loaded;
  }

  /** New photos (saved first, then sent). */
  async add(items: QueueItem[]): Promise<void> {
    await this.load();
    for (const item of items) await this.store.put(item);
    this.items = [...this.items.filter(item => !items.some(added => added.clientId === item.clientId)), ...items];
    this.changed();
    if (!this.persisted && typeof navigator !== "undefined" && navigator.storage?.persist) { this.persisted = true; navigator.storage.persist().catch(() => undefined); }
    void this.flush();
  }

  /** App opened, back online: what waits may go now. */
  async wake(): Promise<void> {
    await this.load();
    const woken = resetBackoff(this.items, this.now());
    for (const item of woken) if (item !== this.items.find(other => other.clientId === item.clientId)) await this.store.put(item);
    this.items = woken;
    this.changed();
    void this.flush();
  }

  /**
   * Batalkan: a photo still waiting never leaves the phone; one being sent is removed as soon as the
   * server has it; one already sent is removed there (it shows to nobody within its 5 seconds).
   */
  async cancel(clientId: string): Promise<void> {
    this.cancelled.add(clientId);
    const item = this.items.find(entry => entry.clientId === clientId);
    const sentId = this.sent.get(clientId);
    this.items = this.items.filter(entry => entry.clientId !== clientId);
    await this.store.remove(clientId);
    this.changed();
    if (this.sending === clientId) return; // the sender finishes the cancel
    const photoId = sentId ?? item?.photoId ?? null;
    if (photoId) await this.removeOnServer(photoId, clientId);
  }

  private async removeOnServer(photoId: string, clientId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = await momenFetch(mainWamApi.photo(photoId), { method: "DELETE", json: { clientId } });
      if (answer.status === 200 || answer.status === 404) return;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }

  /** A failed photo: try again (Coba lagi) or drop it (Hapus). */
  async retry(clientId: string): Promise<void> {
    const item = this.items.find(entry => entry.clientId === clientId);
    if (!item) return;
    const again: QueueItem = { ...item, state: "antre", nextAt: this.now(), error: null, deferred: true };
    await this.store.put(again);
    this.items = this.items.map(entry => (entry.clientId === clientId ? again : entry));
    this.changed();
    void this.flush();
  }
  discard(clientId: string): Promise<void> { return this.cancel(clientId); }

  /** Sends what is due, one at a time; schedules the next look. A call while it runs joins that run (and asks for one more round). */
  flush(): Promise<void> {
    if (this.current) { this.again = true; return this.current; }
    this.current = (async () => {
      do {
        this.again = false;
        const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
        if (locks?.request) await locks.request("mw-momen-antrean", { ifAvailable: true }, async lock => { if (lock) await this.loop(); });
        else await this.loop();
      } while (this.again);
    })().finally(() => { this.current = null; this.schedule(); });
    return this.current;
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wake = nextWake(this.items);
    if (wake === null || typeof window === "undefined") return;
    this.timer = setTimeout(() => { void this.flush(); }, Math.max(1000, wake - this.now()));
  }

  private async loop(): Promise<void> {
    await this.reload();
    for (;;) {
      const item = nextDue(this.items, this.now());
      if (!item) return;
      const keepGoing = await this.send(item);
      if (!keepGoing) return;
    }
  }

  private async save(item: QueueItem) {
    if (this.cancelled.has(item.clientId)) return;
    await this.store.put(item);
    this.items = this.items.map(entry => (entry.clientId === item.clientId ? item : entry));
    this.changed();
  }

  /** One photo; false when nothing more can go now (no signal, signed out). */
  private async send(item: QueueItem): Promise<boolean> {
    this.sending = item.clientId;
    this.changed();
    try {
      const agreed: PhotoStart = {
        clientId: item.clientId, sessionId: item.sessionId, takenAt: item.takenAt, width: item.width, height: item.height,
        size: item.besar.byteLength, thumbSize: item.kecil.byteLength, tileSize: item.ubin.byteLength,
        tags: item.tags ?? [], geo: item.geo ?? null, gallery: item.gallery ?? false,
      };
      const start = await momenFetch<UploadStart>(mainWamApi.photoStart, { method: "POST", json: agreed });
      if (!start.data) return this.failed(item, start.status, "server", start.message);
      let done: { id: string } | null = null;
      if (start.data.kind === "selesai") done = { id: start.data.id };
      else {
        const { uploads, token, id } = start.data;
        if (item.photoId !== id) { item = { ...item, photoId: id }; await this.save(item); }
        const statuses = await Promise.all([put(uploads.besar, item.besar), put(uploads.kecil, item.kecil), put(uploads.ubin, item.ubin)]);
        const bad = statuses.find(status => status < 200 || status >= 300);
        if (bad !== undefined) return this.failed(item, bad, "storage", bad === 0 ? t(activeLang(), "srv.momen.noSignal") : t(activeLang(), "srv.momen.storageRefused"));
        const confirm = await momenFetch<UploadDone>(mainWamApi.photoConfirm, { method: "POST", json: { ...agreed, token } });
        if (!confirm.data) return this.failed(item, confirm.status, "server", confirm.message);
        done = { id: confirm.data.id };
      }
      await this.store.remove(item.clientId);
      this.items = this.items.filter(entry => entry.clientId !== item.clientId);
      if (this.cancelled.has(item.clientId)) { await this.removeOnServer(done.id, item.clientId); return true; }
      this.sent.set(item.clientId, done.id);
      this.emit({ type: "sent", item, photoId: done.id });
      return true;
    } finally {
      this.sending = null;
      this.changed();
    }
  }

  private async failed(item: QueueItem, status: number, step: "server" | "storage", message: string): Promise<boolean> {
    if (this.cancelled.has(item.clientId)) return true;
    const outcome = outcomeOf(status, step);
    const next = afterFailure({ ...item, deferred: true }, outcome, message || t(activeLang(), "srv.momen.notSentYet"), this.now(), Math.random, status === 0);
    await this.save(next);
    if (outcome === "gagal") this.emit({ type: "failed", item: next });
    if (outcome === "masuk") this.emit({ type: "masuk", item: next });
    // No signal or signed out: the rest waits too. A refusal of one photo does not stop the others.
    return outcome === "gagal" || outcome === "url";
  }
}

let shared: MomenQueue | null = null;
/** The tab's one queue. */
export function momenQueue(): MomenQueue {
  if (!shared) shared = new MomenQueue();
  return shared;
}
