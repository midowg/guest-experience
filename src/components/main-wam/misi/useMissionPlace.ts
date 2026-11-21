"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PositionAnswer } from "@/lib/main-wam/misi/geo";
import type { PositionInput } from "@/lib/main-wam/misi/schema";
import type { MissionKind } from "@/lib/main-wam/misi/types";
import { mainWamApi } from "@/lib/routes";
import { errorText, misiRequest } from "./request";

/*
 * Where the phone is, as far as a mission asks. The phone reads its position (navigator.geolocation,
 * high accuracy, never a cached one); the SERVER says whether it is inside the mission's area and how
 * far, so the mission's coordinates never reach the phone. A person who has not allowed the location
 * is asked with a tap (never on load, except where the browser already holds the permission).
 */

export type Place =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "unavailable" }
  | { status: "failed"; message: string }
  | { status: "ready"; fix: PositionInput; answer: PositionAnswer };

class Denied extends Error {}

/** One fresh position from the phone; rejects with Denied when the person said no. */
export function currentFix(): Promise<PositionInput> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { reject(new Error("unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy,
        // The phone's own stamp of the reading: the server refuses one that is old.
        at: new Date(Number.isFinite(position.timestamp) ? position.timestamp : Date.now()).toISOString(),
      }),
      error => reject(error.code === error.PERMISSION_DENIED ? new Denied() : new Error("unavailable")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

const RECHECK_MS = 25_000;

/** Mode demo: a made-up position inside the area (nothing is read, nothing is asked of the server, nothing is saved). */
const demoPlace = (hasPlace: boolean, radiusM: number): Place => ({
  status: "ready", fix: { latitude: 0, longitude: 0, accuracy: 12, at: new Date().toISOString() },
  answer: { inside: true, reason: null, radiusM, accuracyM: 12, hasPlace },
});

export function useMissionPlace(missionId: string, kind: MissionKind, { demo = false, hasPlace = false, radiusM = 50 }: { demo?: boolean; hasPlace?: boolean; radiusM?: number } = {}) {
  const [place, setPlace] = useState<Place>(() => (demo ? demoPlace(hasPlace, radiusM) : { status: "idle" }));
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /** Read the position and ask the server about it. The last answer stays on screen while the next one is asked. */
  const check = useCallback(async () => {
    if (demo || busy.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setPlace({ status: "unsupported" }); return; }
    busy.current = true;
    setPlace(previous => (previous.status === "ready" ? previous : { status: "reading" }));
    try {
      const fix = await currentFix();
      const { data } = await misiRequest<PositionAnswer>(mainWamApi.missionCheck(missionId), { method: "POST", json: { kind, position: fix } });
      if (alive.current) setPlace({ status: "ready", fix, answer: data });
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof Denied) setPlace({ status: "denied" });
      else if (error instanceof Error && error.message === "unavailable") setPlace({ status: "unavailable" });
      else if (error instanceof Error && error.message === "unsupported") setPlace({ status: "unsupported" });
      else setPlace(previous => (previous.status === "ready" ? previous : { status: "failed", message: errorText(error) }));
    } finally { busy.current = false; }
  }, [missionId, kind, demo]);

  // A browser that already holds the permission is read at once; one that refused is told so; others wait for the tap.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      if (cancelled) return;
      if (state === "granted") void check();
      else if (state === "denied") setPlace({ status: "denied" });
    };
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then(result => {
        status = result;
        apply(result.state);
        result.onchange = () => apply(result.state);
      }).catch(() => undefined);
    }
    return () => { cancelled = true; if (status) status.onchange = null; };
  }, [check, demo]);

  // While the screen is open and the position is known, look again now and then (someone walking to the place).
  const ready = place.status === "ready";
  useEffect(() => {
    if (!ready || demo) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [ready, check, demo]);

  return { place, check };
}
