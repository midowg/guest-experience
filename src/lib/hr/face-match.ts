/*
 * Absen harian (20 Nov 2026): how close two faces are. The phone turns a face into an embedding
 * (SFace, 128 numbers, see src/components/pra-wam/faceEngine.ts); the server compares it with the
 * person's reference embedding, which never leaves the server. Cosine similarity: 1 is the same
 * picture, around 0 is a stranger. The thresholds start at OpenCV's published SFace value (0.363)
 * and are tuned on the team's own photos (/dev-preview/wajah). Pure: used by the phone, the admin
 * screen and the server alike.
 */

/** Which model made an embedding: embeddings of different models never compare. */
export const FACE_MODEL_VERSION = "sface-2021dec-int8";
export const EMBEDDING_SIZE = 128;

/**
 * At or above `cocok`: the same person. Between `perluCek` and `cocok`: recorded, but an admin
 * looks (an old reference photo, poor light). Below `perluCek`: not recorded.
 */
export const FACE_MATCH = { cocok: 0.363, perluCek: 0.3 } as const;
export type FaceVerdict = "cocok" | "perlu_cek" | "tidak_cocok";

export const isEmbedding = (value: unknown, size = EMBEDDING_SIZE): value is number[] =>
  Array.isArray(value) && value.length === size && value.every(item => typeof item === "number" && Number.isFinite(item));

/** The same direction with length 1 (a zero vector stays zero). */
export function normalize(vector: readonly number[]): number[] {
  const length = Math.hypot(...vector);
  return length > 0 ? vector.map(item => item / length) : vector.map(() => 0);
}

/** The mean of several embeddings of one face, normalized: steadier than any single frame. */
export function average(vectors: readonly (readonly number[])[]): number[] {
  if (!vectors.length) throw new Error("Tidak ada wajah untuk dirata-rata.");
  const size = vectors[0].length;
  const sum = new Array<number>(size).fill(0);
  for (const vector of vectors) {
    if (vector.length !== size) throw new Error("Ukuran embedding tidak sama.");
    const unit = normalize(vector);
    for (let i = 0; i < size; i += 1) sum[i] += unit[i];
  }
  return normalize(sum);
}

/** Cosine similarity, -1…1. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("Ukuran embedding tidak sama.");
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}

export function faceVerdict(score: number, thresholds: { cocok: number; perluCek: number } = FACE_MATCH): FaceVerdict {
  if (score >= thresholds.cocok) return "cocok";
  return score >= thresholds.perluCek ? "perlu_cek" : "tidak_cocok";
}

/**
 * The frames of one clock-in all show one face: every pair is a match. Stops swapping faces (a real
 * face for the challenge, a photo for the capture) halfway. Pairs, not "each close to the mean": a
 * stranger among a few frames still sits fairly close to their mean.
 */
export function sameFace(frames: readonly (readonly number[])[], min = FACE_MATCH.cocok): boolean {
  if (frames.length < 2) return frames.length === 1;
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) if (cosine(frames[i], frames[j]) < min) return false;
  }
  return true;
}

/**
 * Kecocokan as a percentage for people (21 Nov 2026, like GreatDay's): a smooth curve over the
 * cosine score, so the cocok threshold (0,363) reads about 76% and a clear match 95% and up. It is
 * a readable scale, not a probability; the decision stays on `faceVerdict`.
 */
export function matchPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(100 / (1 + Math.exp(-(score - 0.3) * 18)))));
}

/** "0,42" for admin screens. */
export const scoreLabel = (score: number) => score.toFixed(2).replace(".", ",");
