import { clock, shortDateOfInstant, t, type Lang } from "../i18n";
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
export function photoTime(iso: string, now: Date, lang: Lang = "id"): string {
  const time = clock(lang, wibTime(iso));
  const day = wibDate(iso), today = wibDate(now.toISOString());
  if (day === today) return time;
  const yesterday = wibDate(new Date(now.getTime() - 24 * 60 * 60_000).toISOString());
  if (day === yesterday) return `${t(lang, "fmt.yesterday")} · ${time}`;
  const date = shortDateOfInstant(lang, new Date(iso));
  return `${date} · ${time}`;
}

/** The line under the name on a card: "Kelompok 2 · Kawi · 10.02". */
export const photoMeta = (photo: Pick<FeedPhoto, "ownerGroup" | "takenAt">, now: Date, lang: Lang = "id") => [photo.ownerGroup, photoTime(photo.takenAt, now, lang)].filter(Boolean).join(" · ");

/** What a screen reader says for a photo: "Foto oleh Dimas, Kelompok 2 · Kawi, 10.02". */
export function photoAlt(photo: Pick<FeedPhoto, "owner" | "ownerGroup" | "takenAt" | "mine">, now: Date, lang: Lang = "id"): string {
  const who = photo.mine ? t(lang, "momen.altMine") : t(lang, "momen.altBy", { name: photo.owner.name });
  return [who, photo.ownerGroup, photoTime(photo.takenAt, now, lang)].filter(Boolean).join(", ");
}

/** "Kelompok 4 · Arjuno" for a viewer's kelompok. */
export const groupLabel = (group: { number: number; name: string }, lang: Lang = "id") => t(lang, "peserta.group.title", { number: group.number, name: group.name });

/** The stack's line under the cards. */
export type StackMode = "baru" | "sesi" | "galeri";
export function stackCount(mode: StackMode, index: number, total: number, sessionTitle?: string, lang: Lang = "id"): string {
  if (mode === "sesi") return t(lang, "momen.count.session", { title: sessionTitle ?? t(lang, "momen.sessionWord"), total });
  if (mode === "galeri") return t(lang, "momen.count.gallery", { n: Math.min(index + 1, total), total });
  return t(lang, "momen.count.new", { n: Math.min(index + 1, total), total });
}
/** Spoken: "Foto ke-3 dari 24 foto baru". */
export function stackCountSpoken(mode: StackMode, index: number, total: number, lang: Lang = "id"): string {
  return t(lang, mode === "baru" ? "momen.countSpokenNew" : "momen.countSpoken", { n: Math.min(index + 1, total), total });
}

/* ── Sent, queued, cancelled (U02–U04) ────────────────────────────────────────────────────────── */

/** Who a photo went to, as the toasts say it: "semua peserta" / "Kelompok 4". */
export function audienceWords(audience: PhotoAudience, group: MainWamViewer["group"] | null | undefined, many = false, lang: Lang = "id"): string {
  if (audience === "kelompok") return group ? t(lang, "momen.aud.group", { n: group.number }) : t(lang, "momen.aud.yourGroup");
  return t(lang, many ? "momen.aud.everyone" : "momen.aud.allParticipants");
}

/** U02 "Terkirim ke semua peserta", U04 "3 foto terkirim ke semua". */
export function sentText(count: number, audience: PhotoAudience, group: MainWamViewer["group"] | null | undefined, lang: Lang = "id"): string {
  return count > 1 ? t(lang, "momen.sentMany", { count, to: audienceWords(audience, group, true, lang) }) : t(lang, "momen.sentOne", { to: audienceWords(audience, group, false, lang) });
}

/** U03 toast after the signal comes back: "2 foto terkirim". */
export const flushedText = (count: number, lang: Lang = "id") => (count > 1 ? t(lang, "momen.flushedMany", { count }) : t(lang, "momen.flushedOne"));

/** U03 pill on the viewfinder: "Offline · 2 foto antre", or just the queue while it retries. */
export const queuedPill = (count: number, offline: boolean, lang: Lang = "id") => t(lang, offline ? "momen.queuedOffline" : "momen.queued", { count });

/** "12 foto baru" on Beranda's card. */
export function newPhotosText(unseen: number, total: number, lang: Lang = "id"): string {
  if (unseen > 0) return t(lang, "momen.newPhotos", { n: unseen });
  return t(lang, total > 0 ? "momen.seenAll" : "momen.noneYet");
}
