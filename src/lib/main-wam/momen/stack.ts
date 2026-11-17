import { wibDate, wibTime } from "../rundown";
import type { MainWamViewer, PhotoAudience } from "../types";
import type { FeedPhoto } from "./types";

/*
 * The stack of Momen (M01–M03, RISET §4) and the words around it. Pure.
 */

/** A swipe goes on past a quarter of the card's width or when flicked (px per ms). */
export const SWIPE_DISTANCE = 0.25;
export const SWIPE_SPEED = 0.5;
/** Under this a press is a tap, not a drag. */
export const TAP_SLOP = 8;

/** Left = the next photo, right = the previous one; otherwise the card goes back. */
export function swipeDecision(dx: number, width: number, speed: number): "next" | "prev" | "stay" {
  const far = Math.abs(dx) > width * SWIPE_DISTANCE;
  const fast = Math.abs(speed) > SWIPE_SPEED && Math.abs(dx) > TAP_SLOP * 2;
  if (!far && !fast) return "stay";
  return dx < 0 ? "next" : "prev";
}

/** "10.02" today, "Kemarin · 21.10", "Sen, 4 Jan · 21.10" (WIB). */
export function photoTime(iso: string, now: Date): string {
  const time = wibTime(iso).replace(":", ".");
  const day = wibDate(iso), today = wibDate(now.toISOString());
  if (day === today) return time;
  const yesterday = wibDate(new Date(now.getTime() - 24 * 60 * 60_000).toISOString());
  if (day === yesterday) return `Kemarin · ${time}`;
  const date = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(/\./g, "");
  return `${date} · ${time}`;
}

/** The line under the name on a card: "Kelompok 2 · Kawi · 10.02". */
export const photoMeta = (photo: Pick<FeedPhoto, "ownerGroup" | "takenAt">, now: Date) => [photo.ownerGroup, photoTime(photo.takenAt, now)].filter(Boolean).join(" · ");

/** What a screen reader says for a photo: "Foto oleh Dimas, Kelompok 2 · Kawi, 10.02". */
export function photoAlt(photo: Pick<FeedPhoto, "owner" | "ownerGroup" | "takenAt" | "mine">, now: Date): string {
  const who = photo.mine ? "Fotomu" : `Foto oleh ${photo.owner.name}`;
  return [who, photo.ownerGroup, photoTime(photo.takenAt, now)].filter(Boolean).join(", ");
}

/** "Kelompok 4 · Arjuno" for a viewer's kelompok. */
export const groupLabel = (group: { number: number; name: string }) => `Kelompok ${group.number} · ${group.name}`;

/** The stack's line under the cards. */
export type StackMode = "baru" | "sesi" | "galeri";
export function stackCount(mode: StackMode, index: number, total: number, sessionTitle?: string): string {
  if (mode === "sesi") return `${sessionTitle ?? "Sesi"} · ${total} foto`;
  if (mode === "galeri") return `${Math.min(index + 1, total)} dari ${total}`;
  return `${Math.min(index + 1, total)} dari ${total} baru`;
}
/** Spoken: "Foto ke-3 dari 24 foto baru". */
export function stackCountSpoken(mode: StackMode, index: number, total: number): string {
  return `Foto ke-${Math.min(index + 1, total)} dari ${total} foto${mode === "baru" ? " baru" : ""}`;
}

/* ── Sent, queued, cancelled (U02–U04) ────────────────────────────────────────────────────────── */

/** Who a photo went to, as the toasts say it: "semua peserta" / "Kelompok 4". */
export function audienceWords(audience: PhotoAudience, group: MainWamViewer["group"] | null | undefined, many = false): string {
  if (audience === "kelompok") return group ? `Kelompok ${group.number}` : "kelompokmu";
  return many ? "semua" : "semua peserta";
}

/** U02 "Terkirim ke semua peserta", U04 "3 foto terkirim ke semua". */
export function sentText(count: number, audience: PhotoAudience, group: MainWamViewer["group"] | null | undefined): string {
  return count > 1 ? `${count} foto terkirim ke ${audienceWords(audience, group, true)}` : `Terkirim ke ${audienceWords(audience, group)}`;
}

/** U03 toast after the signal comes back: "2 foto terkirim". */
export const flushedText = (count: number) => (count > 1 ? `${count} foto terkirim` : "Foto terkirim");

/** U03 pill on the viewfinder: "Offline · 2 foto antre", or just the queue while it retries. */
export const queuedPill = (count: number, offline: boolean) => (offline ? `Offline · ${count} foto antre` : `${count} foto antre`);

/** "12 foto baru" on Beranda's card. */
export function newPhotosText(unseen: number, total: number): string {
  if (unseen > 0) return `${unseen} foto baru`;
  return total > 0 ? "Sudah kamu lihat semua" : "Belum ada foto";
}
