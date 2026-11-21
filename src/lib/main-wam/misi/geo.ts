/*
 * Where a person is, and whether that is where a mission wants them (check-in and photo missions).
 * The phone sends its coordinates; the server judges them here, never the browser. Pure.
 *
 * What this can and cannot do: it stops a person who is not there from tapping "Check-in" and a
 * photo or fix that is stale or too coarse. It cannot tell a spoofed GPS (a mock-location app) from a
 * real one; a mission worth cheating for should use `review` (an admin looks at the photo) or sesi.
 */

export type LatLng = { latitude: number; longitude: number };
/** A position from the phone: its accuracy radius in metres, and when it was read (ISO, optional). */
export type Fix = LatLng & { accuracy: number | null; at?: string | null };

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const validLatLng = (point: Partial<LatLng> | null | undefined): point is LatLng =>
  !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude as number) <= 90 && Math.abs(point.longitude as number) <= 180;

/** A fix older than this (by the phone's own stamp) is not "now". */
export const FIX_MAX_AGE_MS = 5 * 60_000;

export type PositionRefusal = "tidak-valid" | "kedaluwarsa" | "tidak-akurat" | "terlalu-jauh";
export type PositionVerdict = { ok: true; distanceM: number | null } | { ok: false; reason: PositionRefusal; distanceM: number | null };

/**
 * Is this fix good enough, and inside the mission's circle? Without a `target` (a photo mission with
 * no place) any usable fix passes and nothing is measured. The circle is judged by the fix's centre:
 * `maxAccuracyM` is what keeps a fix of a few hundred metres from passing by luck.
 */
export function judgePosition({ fix, target, radiusM, maxAccuracyM, now }: {
  fix: Fix;
  target: LatLng | null;
  radiusM: number;
  maxAccuracyM: number;
  now: Date;
}): PositionVerdict {
  if (!validLatLng(fix)) return { ok: false, reason: "tidak-valid", distanceM: null };
  if (fix.at) {
    const at = Date.parse(fix.at);
    if (!Number.isFinite(at) || Math.abs(now.getTime() - at) > FIX_MAX_AGE_MS) return { ok: false, reason: "kedaluwarsa", distanceM: null };
  }
  const distanceM = target ? Math.round(distanceMeters(fix, target)) : null;
  if (fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > maxAccuracyM) return { ok: false, reason: "tidak-akurat", distanceM };
  if (target && distanceM !== null && distanceM > radiusM) return { ok: false, reason: "terlalu-jauh", distanceM };
  return { ok: true, distanceM };
}

/**
 * What the server tells the phone about a position (POST …/cek): the verdict and why not, never how far.
 * A distance would let anyone find the mission's point from three positions (trilateration).
 */
export type PositionAnswer = { inside: boolean; reason: PositionRefusal | null; radiusM: number; accuracyM: number; hasPlace: boolean };
