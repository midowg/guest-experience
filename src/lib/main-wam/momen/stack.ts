import { clock, shortDateOfInstant, t, type Lang } from "../i18n";
import { wibDate, wibTime } from "../rundown";
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

/**
 * How a card behind the front photo lies in the pile (Instagram Instants): a tilt of 2 to 7 degrees either way, a small
 * shift (-5 to 5 px sideways, 8 to 13 px down) and a scale that shrinks with the tilt (so the corners stay inside the screen), all from the photo's id, so the
 * same photo lies the same way every time and the next card only straightens when it comes to the front. Pure.
 */
export type PileTilt = { angle: number; x: number; y: number; scale: number };
export const TILT_MIN = 2;
export const TILT_MAX = 7;
export function pileTilt(id: string): PileTilt {
  // FNV-1a over the id's characters, then three independent fractions out of it.
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
  const part = (shift: number) => ((hash >>> shift) & 0xff) / 255;
  const magnitude = TILT_MIN + part(0) * (TILT_MAX - TILT_MIN);
  const sign = (hash >>> 8) & 1 ? 1 : -1;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    angle: round(sign * magnitude),
    // Sideways: either way, evenly (the front card is centred, 24 from each edge: a corner must not leave the screen); down: the bottom edge peeks. The scale shrinks with the tilt so the rotated corners stay on the screen.
    x: round(-5 + part(16) * 10),
    y: round(8 + part(24) * 5),
    scale: round(1 - 0.016 * magnitude),
  };
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

/** The line under the name on a card: the time ("10.02", "Kemarin · 21.10"). */
export const photoMeta = (photo: Pick<FeedPhoto, "takenAt">, now: Date, lang: Lang = "id") => photoTime(photo.takenAt, now, lang);

/** What a screen reader says for a photo: "Foto oleh Dimas, 10.02". */
export function photoAlt(photo: Pick<FeedPhoto, "owner" | "takenAt" | "mine">, now: Date, lang: Lang = "id"): string {
  const who = photo.mine ? t(lang, "momen.altMine") : t(lang, "momen.altBy", { name: photo.owner.name });
  return [who, photoTime(photo.takenAt, now, lang)].join(", ");
}

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

/** U02 "Terkirim ke semua peserta", U04 "3 foto terkirim ke semua" (every photo is for everyone). */
export function sentText(count: number, lang: Lang = "id"): string {
  return count > 1 ? t(lang, "momen.sentMany", { count, to: t(lang, "momen.aud.everyone") }) : t(lang, "momen.sentOne", { to: t(lang, "momen.aud.allParticipants") });
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
