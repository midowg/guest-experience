import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { ServiceError } from "../../config";

/*
 * A limit per person kept in this server instance's memory only, never written anywhere (Silent
 * Meeting, audit H1: a row in the database next to a feedback, even a rate-limit counter, would
 * date it and tie it to its sender). Best effort: each instance counts on its own and forgets on
 * restart. Keys are hashed with a random key made at start, so even a memory dump shows no ids.
 */

const KEY = randomBytes(32);
const MAX_KEYS = 5_000;
type Hit = { count: number; resetAt: number };
const hits = new Map<string, Hit>();

const keyOf = (scope: string, id: string) => createHmac("sha256", KEY).update(`${scope}\0${id}`).digest("base64url");

function sweep(now: number) {
  if (hits.size < MAX_KEYS) return;
  for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key);
  // Still full (a flood): forget the oldest, never grow without bound.
  for (const key of hits.keys()) { if (hits.size < MAX_KEYS) break; hits.delete(key); }
}

/** Counts one more for (scope, id); 429 past `limit` in `windowMs`. Returns how many are left. */
export function limitInMemory(scope: string, id: string, limit: number, windowMs: number, now = Date.now()): { remaining: number } {
  sweep(now);
  const key = keyOf(scope, id);
  const hit = hits.get(key);
  const current = hit && hit.resetAt > now ? hit : { count: 0, resetAt: now + windowMs };
  if (current.count >= limit) throw new ServiceError(429, "Terlalu sering. Tunggu beberapa menit lalu coba lagi.");
  current.count += 1;
  hits.set(key, current);
  return { remaining: limit - current.count };
}

/** How many are left for (scope, id) without counting one. */
export function remainingInMemory(scope: string, id: string, limit: number, now = Date.now()): number {
  const hit = hits.get(keyOf(scope, id));
  return hit && hit.resetAt > now ? Math.max(0, limit - hit.count) : limit;
}

/** Tests only. */
export function resetMemoryLimits() { hits.clear(); }
