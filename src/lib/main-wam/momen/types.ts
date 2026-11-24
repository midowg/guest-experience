import type { PhotoAudience, PhotoStatus } from "../types";
import type { ReactionCount } from "./reactions";

/*
 * Momen's own types (area B, docs/main-wam/KONTRAK.md §6): what the stack (M01–M03), the gallery
 * (M05), the camera's queue (U01–U04) and the Mozaik (M06) exchange with the server. Shared types
 * (MwPhoto, PhotoAudience, ReportReason) stay in ../types.ts.
 */

/** The views of Momen: Semua and (gallery only) Fotoku. (Kelompokku is gone: every photo is for everyone.) */
export const FEED_VIEWS = ["semua", "saya"] as const;
export type FeedView = (typeof FEED_VIEWS)[number];

/** One session's id, "umum" (photos without a session), or null (every session). */
export type SessionFilter = string | null;
export const UMUM = "umum";

/** A photo as the stack and the gallery show it. */
export type FeedPhoto = {
  id: string;
  owner: { id: string; name: string; photo: string | null };
  /** Always "semua" for a photo sent now; an earlier version could send "kelompok" (then only its kelompok sees it). */
  audience: PhotoAudience;
  sessionId: string | null;
  width: number;
  height: number;
  /** Taken on the phone (a queued photo keeps its own time): the time shown. */
  takenAt: string;
  /** Shown to others from here; the order of the lists. */
  visibleAt: string;
  status: PhotoStatus;
  /** The reactions on it, most first, and which one is the viewer's. */
  reactions: ReactionCount[];
  /** The last few people who reacted (at most 3, newest first, never the viewer), for the avatars on the photo; absent before the server sends them. */
  reactors?: { id: string; name: string; photo: string | null }[];
  seen: boolean;
  mine: boolean;
  /** Short-lived storage addresses: the small copy (grid, stack under it) and the large one. */
  src: { kecil: string | null; besar: string | null };
};

/** One person's reaction to a photo, for the list "who reacted with what" (the person's own marked). */
export type Reactor = { person: { id: string; name: string; photo: string | null; /** "Finance"; the app shows its short form. Absent before the server sends it. */ department?: string }; emoji: string; mine: boolean; at: string };

/** One page of a view; `next` continues it (null at the end); `total` on the first page. */
export type FeedPage = { items: FeedPhoto[]; next: string | null; total: number | null };
/** "Saring sesi": photos per session in a view (null = Umum). */
export type SessionCount = { sessionId: string | null; photos: number };
/** What GET photos answers. */
export type FeedAnswer = FeedPage & { sessions: SessionCount[] | null; migrated: boolean };

/** Step one of an upload: where to put the three files, or the photo already kept (a retry). */
export type UploadStart =
  | { kind: "unggah"; id: string; token: string; uploads: { besar: string; kecil: string; ubin: string } }
  | { kind: "selesai"; id: string; visibleAt: string };
/** Step two: the photo is kept. */
export type UploadDone = { id: string; visibleAt: string };

/** One tile of the Mozaik. */
export type MosaicTile = { cell: number; id: string; src: string | null; mine: boolean };
/**
 * The Mozaik as the app (and later the venue TV) draws it. `cells` has one character per cell, row
 * by row: the letter it belongs to ("W", "2"), "#" inside a picture mask, "." outside the letters.
 */
export type MosaicManifest = {
  version: string;
  columns: number;
  rows: number;
  cells: string;
  tiles: MosaicTile[];
  filled: number;
  total: number;
  /** How many people's photos are in it. */
  people: number;
  mine: number;
  updatedAt: string;
  complete: boolean;
  migrated: boolean;
};

/** What GET photo answers for the viewer (a Mozaik tile has only its small picture): who took it, when, in which session. */
export type PhotoDetail = {
  id: string;
  /** The name Momen shows on the photo (nama panggilan). */
  owner: { name: string };
  mine: boolean;
  sessionTitle: string | null;
  takenAt: string;
};
