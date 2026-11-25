import { z } from "zod";
import { cosine, EMBEDDING_SIZE, FACE_MATCH } from "@/lib/hr/face-match";
import { SCAN_MAX_AGE_MS } from "../modul/absen";
import type { AttendeeRow } from "./attendance";

/*
 * Absen mode tablet (KONTRAK §9 #39): panitia's tablet follows several faces at once, turns each one
 * into SFace's 128 numbers IN THE BROWSER, and sends only those numbers (never a picture) to the
 * server, which finds who it is among the event's people who enrolled their face in WG People.
 * This file is what the tablet and the server share, and it is pure: the one-to-many matching with
 * its stricter rule, the shapes of the request and the answer, the quality gates for a face, the
 * face tracking helpers and the offline queue's reader.
 *
 * Why stricter than WG People's own check. WG People compares a face with ONE person (1:1): a score
 * of 0,363 is enough (FACE_MATCH.cocok). Here the face is compared with the whole event (about 120
 * people, 1:N), so the chance that a stranger scores high against SOMEONE grows with the number of
 * people. The rule below asks for more (TABLET_MATCH.min), and asks that nobody else is close
 * (TABLET_MATCH.margin). There is no liveness check in this mode (several faces at once, nobody is
 * asked to blink): a photo of a face held to the tablet could pass. Panitia stands by the tablet.
 */

/**
 * The rule that says "this face is that person". Both numbers are cosine scores (1 = the same
 * picture, about 0 = a stranger), starting values to be tuned on the team's own faces:
 * - `min` 0,45: the best score must reach this. WG People's 1:1 `cocok` is 0,363; 0,45 leaves more
 *   room for the 120 comparisons.
 * - `margin` 0,08: the best score must beat the runner-up by this much. Two people who look alike
 *   (or one poor picture) give two close scores: that is "ragu" (not sure), never a name.
 */
export const TABLET_MATCH = { min: 0.45, margin: 0.08 } as const;
export type TabletRule = { min: number; margin: number };

/**
 * Only a face profile in this WG People status is compared: `aktif` (in use, the person's or the
 * admin's approval is done). `siap` (waits for the person's consent) and `menunggu` (self-enrolled,
 * waits for an admin) are left out, `impor` and `ditolak` have no usable numbers.
 */
export const TABLET_FACE_STATUSES = ["aktif"] as const;

/** One face of the picture, and so one comparison, at most this many per request. */
export const TABLET_MAX_FACES = 6;

/** Someone enrolled: the numbers of their reference face. These never leave the server. */
export type GalleryEntry = { employeeId: string; embedding: readonly number[] };

export type TabletVerdict =
  | { kind: "dikenali"; employeeId: string; score: number; runnerUp: number }
  /** Two people close in score, or the same person already given to a better face of the picture. */
  | { kind: "ragu" }
  | { kind: "tidak-dikenali" };

/** Who a face is: the best score reaches `min` and beats the runner-up by `margin`. */
export function matchFace(embedding: readonly number[], gallery: readonly GalleryEntry[], rule: TabletRule = TABLET_MATCH): TabletVerdict {
  let best: { employeeId: string; score: number } | null = null;
  let runnerUp = -1;
  for (const entry of gallery) {
    if (entry.embedding.length !== embedding.length) continue;
    const score = cosine(embedding, entry.embedding);
    if (!best || score > best.score) {
      if (best) runnerUp = Math.max(runnerUp, best.score);
      best = { employeeId: entry.employeeId, score };
    } else if (score > runnerUp) runnerUp = score;
  }
  if (!best || best.score < rule.min) return { kind: "tidak-dikenali" };
  if (runnerUp >= 0 && best.score - runnerUp < rule.margin) return { kind: "ragu" };
  return { kind: "dikenali", employeeId: best.employeeId, score: best.score, runnerUp: Math.max(runnerUp, 0) };
}

/**
 * Every face of one picture. A person cannot be in the picture twice: when two faces both come out
 * as the same person, the better score keeps the name and the other is "ragu" (a second face of
 * the same person is a reflection, a photo, or a mistake: it is never recorded twice).
 */
export function matchFaces(embeddings: readonly (readonly number[])[], gallery: readonly GalleryEntry[], rule: TabletRule = TABLET_MATCH): TabletVerdict[] {
  const verdicts = embeddings.map(embedding => matchFace(embedding, gallery, rule));
  const keeper = new Map<string, number>();
  verdicts.forEach((verdict, index) => {
    if (verdict.kind !== "dikenali") return;
    const current = keeper.get(verdict.employeeId);
    if (current === undefined || (verdicts[current] as { score: number }).score < verdict.score) keeper.set(verdict.employeeId, index);
  });
  return verdicts.map((verdict, index) => (verdict.kind === "dikenali" && keeper.get(verdict.employeeId) !== index ? { kind: "ragu" } : verdict));
}

/* ── What the tablet sends and what it gets back ────────────────────────────────────────────── */

/** A normalised SFace embedding (a unit vector, a little room for rounding). A picture is never in the request. */
export const faceEmbedding = z.array(z.number().min(-2).max(2)).length(EMBEDDING_SIZE)
  .refine(values => { const length = Math.hypot(...values); return length > 0.9 && length < 1.1; }, "Data wajah tidak dikenali.");

/** POST mainWamApi.attendanceFace: the faces in view now (or queued while offline, with their time). */
export const tabletRequestSchema = z.object({
  sessionId: z.uuid("Data tidak dikenali. Muat ulang halaman."),
  faces: z.array(z.object({
    embedding: faceEmbedding,
    /** Only a face queued while offline carries the time it was seen (the server keeps it only inside the window and at most 30 minutes old). */
    seenAt: z.iso.datetime({ offset: true }).optional(),
  }).strict()).min(1, "Tidak ada wajah.").max(TABLET_MAX_FACES, `Paling banyak ${TABLET_MAX_FACES} wajah sekali kirim.`),
}).strict();
export type TabletRequest = z.infer<typeof tabletRequestSchema>;

export type TabletRole = "peserta" | "panitia" | "bod";
export type TabletPerson = { employeeId: string; name: string; department: string; photo: string | null; role: TabletRole };
export type TabletFaceAnswer =
  /** `recorded`: this call wrote the check-in; `already`: it was there before (never twice). BOD are named, never recorded. */
  | { kind: "dikenali"; person: TabletPerson; already: boolean; recorded: boolean; checkedInAt: string | null }
  | { kind: "ragu" }
  | { kind: "tidak-dikenali" }
  /** Nobody of this event has an enrolled face (so no face can be found). */
  | { kind: "belum-terdaftar" }
  /** The check-in window of the session is not open at the time of this face. */
  | { kind: "di-luar-jam"; window: "belum" | "tutup"; opens: string; closes: string };
export type TabletAnswer = { faces: TabletFaceAnswer[]; present: number; total: number };

/* ── The page's data ────────────────────────────────────────────────────────────────────────── */

export type TabletSession = { id: string; title: string; time: string; day: string; required: boolean; opens: string; closes: string };
export type TabletData = {
  migrated: boolean;
  sessions: TabletSession[];
  /** The session the page opens on (null when none takes attendance). */
  sessionId: string | null;
  /** Everyone expected at that session, with their check-in (the Catat manual list and the counter). */
  rows: AttendeeRow[];
  /** How many of the expected people have a face that can be found. */
  enrolled: number;
  /** The server's clock, to keep the window right on a tablet whose own clock is off. */
  now: string;
};

export type WindowState = "belum" | "buka" | "tutup";
export function windowOf(session: Pick<TabletSession, "opens" | "closes">, now: Date): WindowState {
  return now.getTime() < Date.parse(session.opens) ? "belum" : now.getTime() <= Date.parse(session.closes) ? "buka" : "tutup";
}

/* ── Which faces are read, and which box is which ───────────────────────────────────────────── */

export type FaceQuality = { minEyePx: number; minSharpness: number; maxYaw: number };
/** What the engine says about a face (FaceReading of src/components/hr/faceEngine.ts, the parts that matter). */
export type LookLike = { closeness: number; signal: { yaw: number } | null };

/** Why a face is not read yet, said on its box; null when it can be read. The sharpness is judged on the embedding. */
export function faceProblem(look: LookLike, shorterSide: number, quality: Pick<FaceQuality, "minEyePx" | "maxYaw">): "dekat" | "hadap" | null {
  if (look.closeness * shorterSide < quality.minEyePx) return "dekat";
  if (!look.signal || Math.abs(look.signal.yaw) > quality.maxYaw) return "hadap";
  return null;
}

export type Spot = { cx: number; cy: number; size: number };
export const spotOf = (box: { x: number; y: number; width: number; height: number }): Spot => ({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, size: Math.sqrt(box.width * box.height) });

/**
 * Which followed face each new look is: the nearest one, close by and about the same size, each
 * taken once (nearest pairs first); -1 for a face not seen before. This is what keeps a face's box
 * (and its answer) the same across frames.
 */
export function matchSpots(tracks: readonly Spot[], looks: readonly Spot[]): number[] {
  const pairs: { track: number; look: number; gap: number }[] = [];
  tracks.forEach((track, i) => looks.forEach((look, j) => {
    const gap = Math.hypot(track.cx - look.cx, track.cy - look.cy);
    const ratio = look.size / Math.max(track.size, 1e-6);
    if (gap < Math.max(0.06, track.size * 0.6) && ratio > 0.65 && ratio < 1.55) pairs.push({ track: i, look: j, gap });
  }));
  pairs.sort((a, b) => a.gap - b.gap);
  const result = looks.map(() => -1);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (taken.has(pair.track) || result[pair.look] !== -1) continue;
    result[pair.look] = pair.track;
    taken.add(pair.track);
  }
  return result;
}

/** Times, in milliseconds, that keep the same person from being sent again and again. */
export const TABLET_TIMING = {
  /** A face with an answer is not sent again for this long; the box keeps the answer while the face stays. */
  holdKnown: 20_000,
  /** An unknown face is tried again after this long (a better angle, a step closer). */
  holdUnknown: 5_000,
  /** The box of a face out of sight is dropped after this long. */
  lost: 700,
  /** A face with an answer is compared with the numbers it was answered as, this often: still the same person? */
  recheck: 2_000,
  /** At most one request in flight, and the next one is held back this long to gather faces together. */
  batch: 250,
} as const;
/** A face that comes back with numbers this close to someone just answered takes that answer without asking the server. */
export const SAME_PERSON = 0.55;
/** A face still this close to the numbers of its box is still the same person (below it, the box starts over). */
export const STILL_SAME = FACE_MATCH.cocok;

/** The people just answered (kept a short while): a new box with the same face takes the answer. */
export type Remembered<T> = { embedding: readonly number[]; until: number; value: T };
export function recall<T>(list: readonly Remembered<T>[], embedding: readonly number[], now: number): Remembered<T> | null {
  let best: Remembered<T> | null = null;
  let bestScore = SAME_PERSON;
  for (const item of list) {
    if (item.until <= now) continue;
    const score = cosine(item.embedding, embedding);
    if (score >= bestScore) { best = item; bestScore = score; }
  }
  return best;
}

/** The strip "Baru saja": newest first, one entry per person (a second time replaces the first), at most `max`. */
export type RecentEntry = { key: string; name: string; role: TabletRole | null; at: string; queued: boolean; photo: string | null };
export function pushRecent(list: readonly RecentEntry[], entry: RecentEntry, max = 12): RecentEntry[] {
  return [entry, ...list.filter(item => item.key !== entry.key)].slice(0, max);
}

/* ── Offline ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Faces seen while offline wait on the tablet (localStorage) as their numbers and the time, and go
 * out when there is signal: the same idea as the phone's queued QR scans (modul/absen.ts). The
 * numbers stay on this tablet until they are sent, at most 30 minutes (the server keeps a queued
 * time only that long); a picture is never kept.
 */
export const FACE_QUEUE_KEY = "mw-absen-wajah-antre";
export const FACE_QUEUE_MAX = 40;
export const queuedFaceSchema = z.object({ sessionId: z.uuid(), embedding: faceEmbedding, seenAt: z.iso.datetime({ offset: true }) });
export type QueuedFace = z.infer<typeof queuedFaceSchema>;

/** The queue as stored: broken or too old entries are dropped. */
export function readFaceQueue(raw: string | null, now: Date): QueuedFace[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: QueuedFace[] = [];
  for (const item of parsed) {
    const result = queuedFaceSchema.safeParse(item);
    if (result.success && now.getTime() - Date.parse(result.data.seenAt) <= SCAN_MAX_AGE_MS) out.push(result.data);
  }
  return out.slice(-FACE_QUEUE_MAX);
}
export const addToFaceQueue = (queue: readonly QueuedFace[], face: QueuedFace): QueuedFace[] => [...queue, face].slice(-FACE_QUEUE_MAX);
