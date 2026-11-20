/*
 * Absen harian (20 Nov 2026): is the phone inside an office point? The browser gives a position
 * and how sure it is (accuracy, metres); the server decides with these rules, never the browser.
 * A reading less sure than MAX_ACCURACY_M counts as outside (with a reason), because indoors a
 * phone may guess hundreds of metres off, and fake-GPS apps cannot be seen from the web. Pure.
 */

export type GeoPoint = { lat: number; lng: number };
export type OfficePoint = GeoPoint & { id: string; name: string; radiusM: number };
export type Reading = GeoPoint & { accuracyM: number };

/** A reading less sure than this is not trusted as "inside", however close it says it is. */
export const MAX_ACCURACY_M = 100;
const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine): good to well under a metre at office scale. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The closest office point and how far it is; null when there are none. */
export function nearestOffice<T extends OfficePoint>(at: GeoPoint, offices: readonly T[]): { office: T; distanceM: number } | null {
  let best: { office: T; distanceM: number } | null = null;
  for (const office of offices) {
    const distanceM = distanceMeters(at, office);
    if (!best || distanceM < best.distanceM) best = { office, distanceM };
  }
  return best;
}

export type LocationVerdict<T extends OfficePoint = OfficePoint> =
  | { kind: "di_dalam"; office: T; distanceM: number }
  /** Outside every point, or not sure enough. `nearest` is for "2,3 km dari Kantor X". */
  | { kind: "di_luar"; nearest: { office: T; distanceM: number } | null; why: "jauh" | "tidak_akurat" | "tanpa_kantor" };

/**
 * Inside when the closest point is within its radius and the reading is sure enough. When two
 * points overlap, the closest one counts.
 */
export function locationVerdict<T extends OfficePoint>(reading: Reading, offices: readonly T[]): LocationVerdict<T> {
  const nearest = nearestOffice(reading, offices);
  if (!nearest) return { kind: "di_luar", nearest: null, why: "tanpa_kantor" };
  if (nearest.distanceM > nearest.office.radiusM) return { kind: "di_luar", nearest, why: "jauh" };
  if (!(reading.accuracyM <= MAX_ACCURACY_M)) return { kind: "di_luar", nearest, why: "tidak_akurat" };
  return { kind: "di_dalam", office: nearest.office, distanceM: nearest.distanceM };
}

/** "35 m", "850 m", "2,3 km", "120 km". */
export function distanceLabel(metres: number): string {
  if (metres < 1000) return `${Math.max(0, Math.round(metres))} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

/** Speed between two readings that would be impossible by road (km/h), for a "lokasi melompat" flag. */
export const IMPOSSIBLE_KMH = 300;
export function impossibleJump(a: GeoPoint & { at: string }, b: GeoPoint & { at: string }): boolean {
  const hours = Math.abs(new Date(b.at).getTime() - new Date(a.at).getTime()) / 3_600_000;
  const km = distanceMeters(a, b) / 1000;
  if (km < 5) return false;
  return hours === 0 || km / hours > IMPOSSIBLE_KMH;
}

/**
 * "lat, lng" as pasted from Google Maps ("-7.7828, 110.3671", "-7.7828,110.3671", or a maps link
 * with "@-7.7828,110.3671,17z" or "?q=-7.7828,110.3671"). Null when no pair is found.
 */
export function parseLatLng(text: string): GeoPoint | null {
  const trimmed = text.trim();
  const at = /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(trimmed)
    ?? /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(trimmed)
    ?? /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(trimmed);
  if (!at) return null;
  const lat = Number(at[1]);
  const lng = Number(at[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A Google Maps link to a point, for "Lihat di Maps". */
export const mapsLink = (point: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
