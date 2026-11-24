"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * "Tandai lokasi" in the Momen camera (docs/main-wam/KONTRAK.md §13): whether the position of this phone goes with the photo, only to match missions.
 *   mati      the default when the browser has not been allowed to share the location yet: nothing is read
 *   aktif     on: the position is followed while the camera is open, and the last fix goes with each photo
 *   ditolak   the browser refuses (permission blocked): the photo goes without a position
 * When the permission is already there the camera starts "aktif" (the chip says so, and one tap turns it off). A choice made
 * by tapping is remembered on this phone. The position is read only while this hook is mounted and "aktif".
 */

export type ShareMode = "mati" | "aktif" | "ditolak";
export type SharedFix = { latitude: number; longitude: number; accuracy: number };
const KEY = "mw-momen-lokasi";
/** A fix older than this is not "where the photo was taken". */
const FRESH_MS = 2 * 60_000;

function remembered(value?: ShareMode): string | null {
  try {
    if (value === undefined) return window.localStorage.getItem(KEY);
    window.localStorage.setItem(KEY, value);
  } catch { /* private window or blocked storage: not remembered */ }
  return null;
}

export function useShareLocation(available: boolean, preview?: ShareMode) {
  const [mode, setMode] = useState<ShareMode>(preview ?? "mati");
  const fix = useRef<(SharedFix & { at: number }) | null>(null);
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current !== null && typeof navigator !== "undefined") navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    fix.current = null;
  }, []);
  const begin = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMode("ditolak"); return; }
    if (watch.current !== null) return;
    watch.current = navigator.geolocation.watchPosition(
      position => { fix.current = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, at: Date.now() }; },
      error => { if (error.code === error.PERMISSION_DENIED) { stop(); setMode("ditolak"); } },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  }, [stop]);

  useEffect(() => {
    if (!available || preview) return;
    let gone = false;
    void (async () => {
      let state: PermissionState | "unknown" = "unknown";
      try { state = (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state; } catch { /* not supported */ }
      if (gone) return;
      if (state === "denied") { setMode("ditolak"); return; }
      if (state === "granted" && remembered() !== "mati") { setMode("aktif"); begin(); }
    })();
    return () => { gone = true; stop(); };
  }, [available, preview, begin, stop]);

  /** One tap: off → on (the browser may ask now, from this tap), on → off. */
  const toggle = useCallback(() => {
    if (mode === "aktif") { stop(); setMode("mati"); remembered("mati"); return; }
    remembered("aktif");
    setMode("aktif");
    begin();
  }, [mode, begin, stop]);

  /** The position for a photo taken now, or null (off, blocked, none read yet, or too old). */
  const fixNow = useCallback((): SharedFix | null => {
    const last = fix.current;
    if (mode !== "aktif" || !last || Date.now() - last.at > FRESH_MS) return null;
    return { latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracy };
  }, [mode]);

  return { mode, toggle, fixNow };
}
