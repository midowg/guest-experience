"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * A small value remembered on this device (the collapsed sidebar, Kartu or Tabel per page). Storage
 * can be missing or blocked (a private window, cleared site data); then the value lives for this
 * visit only. The server and the first render use `fallback`, so hydration never differs.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | undefined {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch { /* storage blocked: memory only */ }
  return memory.get(key);
}

function write(key: string, value: string) {
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked: memory only */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

/** [value, set]: a string kept under `key` in localStorage, `fallback` until one is set. */
export function useStoredValue<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => undefined);
  const value = raw !== undefined && (!allowed || allowed.includes(raw as T)) ? raw as T : fallback;
  const set = useCallback((next: T) => write(key, next), [key]);
  return [value, set];
}

/** Kartu or Tabel, remembered per page (`page` names it, e.g. "admin-wam-akun"). */
export function useViewPreference(page: string, fallback: "kartu" | "tabel" = "kartu") {
  return useStoredValue(`console-view:${page}`, fallback, ["kartu", "tabel"] as const);
}
