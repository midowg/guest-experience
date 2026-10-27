import type { EventRecord } from "./types";

/** Of several Friday Sharing events, the one /friday-sharing opens: dated latest, else made latest. */
export function latestFridaySharing<T extends Pick<EventRecord, "starts_at" | "created_at">>(events: T[]): T | null {
  const when = (event: T) => Date.parse(event.starts_at || "") || Date.parse(event.created_at || "") || 0;
  return [...events].sort((a, b) => when(b) - when(a))[0] ?? null;
}
