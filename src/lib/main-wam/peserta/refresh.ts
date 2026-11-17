/*
 * When an open Beranda refreshes for a change it knows is coming (nextChangeAt in home.ts): on the
 * server's clock, a little late at random. Its own file, so the client bundle does not carry
 * Beranda's rules. Pure.
 */

/** Refreshes are spread over this long after a change, so ±100 phones do not ask in the same second (audit S6). */
export const REFRESH_JITTER_MS = 20_000;
/** A change further off than this is left to the next visit. */
const REFRESH_HORIZON_MS = 12 * 3_600_000;

/**
 * How long an open Beranda waits before refreshing for the change at `at`: counted on the server's
 * clock (`offsetMs` = server − phone, so a phone that runs fast or slow still refreshes when the
 * session really starts), one second after it, plus `jitterMs` (0 to REFRESH_JITTER_MS, random per
 * phone). Null when there is nothing to wait for: no change, already passed, or over 12 hours away.
 */
export function refreshDelay(at: string | null, offsetMs: number, phoneNow: number, jitterMs: number): number | null {
  if (!at) return null;
  const due = Date.parse(at) + 1_000 - (phoneNow + (Number.isFinite(offsetMs) ? offsetMs : 0));
  if (!(due > 0) || due > REFRESH_HORIZON_MS) return null;
  return due + Math.min(Math.max(jitterMs, 0), REFRESH_JITTER_MS);
}
