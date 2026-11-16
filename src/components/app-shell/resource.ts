"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/*
 * App feel for Journey's client apps (16 Nov 2026, brain/aturan/desain-ui.md "Perilaku aplikasi"):
 * data is kept per key in memory. A screen opened before shows its data at once and refreshes it
 * in the background (stale-while-revalidate); only a screen with nothing yet shows a skeleton.
 * After a change, `revalidate(prefix)` refreshes every screen that shows that data.
 */

type Entry = { data?: unknown; error?: string; loading: boolean; updatedAt: number; promise?: Promise<unknown> };
const EMPTY: Entry = { loading: false, updatedAt: 0 };
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const fetchers = new Map<string, () => Promise<unknown>>();

const message = (error: unknown) => error instanceof Error && error.message ? error.message : "Terjadi kesalahan. Coba lagi.";
function patch(key: string, change: Partial<Entry>) {
  entries.set(key, { ...(entries.get(key) ?? EMPTY), ...change });
  listeners.get(key)?.forEach(listener => listener());
}

// Keys asked to refresh while a load was already running: one more load follows it, so an answer
// started before a change (a save) never has the last word.
const again = new Set<string>();

/** Fetch `key` (once at a time); keeps the old data while loading, and on failure. */
export function load<T>(key: string, fetcher: () => Promise<T>): Promise<T | undefined> {
  fetchers.set(key, fetcher);
  const running = entries.get(key)?.promise;
  if (running) return running as Promise<T | undefined>;
  const settle = () => {
    if (!again.delete(key)) return;
    const latest = fetchers.get(key);
    if (latest) void load(key, latest);
  };
  const promise = fetcher().then(
    data => { patch(key, { data, error: undefined, loading: false, updatedAt: Date.now(), promise: undefined }); settle(); return data; },
    error => { patch(key, { error: message(error), loading: false, promise: undefined }); settle(); return undefined; },
  );
  patch(key, { loading: true, promise });
  return promise;
}

/** Load `key` now; if a load is running, load once more right after it. */
function refresh(key: string, fetcher: () => Promise<unknown>) {
  if (entries.get(key)?.promise) { fetchers.set(key, fetcher); again.add(key); return; }
  void load(key, fetcher);
}

/** Start fetching before the screen opens (a finger or pointer on its menu item). */
export function prefetch<T>(key: string, fetcher: () => Promise<T>) {
  const entry = entries.get(key);
  if (!entry || (!entry.data && !entry.loading)) void load(key, fetcher);
}

/** Refresh every key starting with `prefix` that a screen shows; the others refresh when opened. */
export function revalidate(prefix: string) {
  for (const [key, fetcher] of fetchers) if (key.startsWith(prefix) && (listeners.get(key)?.size ?? 0) > 0) refresh(key, fetcher);
}

/** Change the kept data at once (optimistic), before the server answers. */
export function setResource<T>(key: string, update: (current: T | undefined) => T | undefined) {
  const entry = entries.get(key);
  patch(key, { data: update(entry?.data as T | undefined) });
}

/** Forget every key starting with `prefix` (signing out, or a fresh start in tests). */
export function clearResources(prefix: string) {
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) { entries.delete(key); listeners.get(key)?.forEach(listener => listener()); }
  for (const key of [...fetchers.keys()]) if (key.startsWith(prefix)) { fetchers.delete(key); again.delete(key); }
}

export type Resource<T> = {
  data: T | undefined;
  error: string | undefined;
  /** The last refresh failed while old data is still on screen (show it quietly, with Coba lagi). */
  refreshError: string | undefined;
  /** Nothing to show yet: show a skeleton. */
  pending: boolean;
  /** Old data on screen while new data loads. */
  refreshing: boolean;
  reload: () => Promise<T | undefined>;
};

/** The data under `key`, fetched when the screen opens (and refreshed if it was there before). */
export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const latest = useRef(fetcher);
  useEffect(() => { latest.current = fetcher; });
  const subscribe = useCallback((listener: () => void) => {
    if (!key) return () => {};
    let set = listeners.get(key);
    if (!set) listeners.set(key, set = new Set());
    set.add(listener);
    return () => { set.delete(listener); };
  }, [key]);
  const entry = useSyncExternalStore(subscribe, () => (key ? entries.get(key) : undefined) ?? EMPTY, () => EMPTY);
  useEffect(() => { if (key) void load(key, () => latest.current()); }, [key]);
  const reload = useCallback(() => key ? load(key, () => latest.current()) : Promise.resolve(undefined), [key]);
  return {
    data: entry.data as T | undefined,
    error: entry.data === undefined ? entry.error : undefined,
    refreshError: entry.data !== undefined && !entry.loading ? entry.error : undefined,
    pending: entry.data === undefined && !entry.error,
    refreshing: entry.loading && entry.data !== undefined,
    reload,
  };
}
