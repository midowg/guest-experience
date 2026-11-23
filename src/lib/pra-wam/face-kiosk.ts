import { z } from "zod";
import { MAX_SELFIE_BYTES } from "@/lib/hr/attendance";
import { faceVerdict } from "@/lib/hr/face-match";
import { LIVENESS } from "@/lib/hr/liveness";
import { faceEmbedding, faceSignal, faceUploadToken, proofKeyPattern, proofMimes } from "./attendance";

/*
 * Mode tablet (23 Nov 2026): absen wajah like the gates at a KAI station. A panitia's tablet, held
 * by panitia or standing at the room's door, follows faces by itself; one that looks at it is read
 * into SFace's numbers on the tablet, and the server finds who it is among the session's
 * participants with a WG People face (the faces never leave the server). A clear match is recorded
 * at once, as "wajah" like the phone's own check-in; a close call asks panitia on the tablet
 * ("Benar ini Budi?"), and a yes is recorded as disahkan by that panitia. No new columns: the rows
 * are the same as the phone's (migration 202611290001).
 */

/** Two people this close in score are a close call, not a match. */
export const KIOSK_MARGIN = 0.06;
/** At most this many names are offered in a close call. */
export const KIOSK_CANDIDATES = 2;

/** One participant's score against the face at the tablet. */
export type KioskScore = { employeeId: string; score: number; present: boolean; consented: boolean };
export type KioskPick =
  | { kind: "tidak-dikenali" }
  | { kind: "sudah"; employeeId: string; score: number }
  | { kind: "belum-setuju"; employeeId: string; score: number }
  | { kind: "cocok"; employeeId: string; score: number }
  | { kind: "konfirmasi"; candidates: { employeeId: string; score: number }[] };

/**
 * Who the face is: nobody under perlu cek; one clear cocok (no one else within the margin) is that
 * person (already in, without consent, or a match); anything closer is for panitia to pick from the
 * nearest who may still be recorded.
 */
export function pickFace(scores: readonly KioskScore[]): KioskPick {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || faceVerdict(best.score) === "tidak_cocok") return { kind: "tidak-dikenali" };
  const near = sorted.filter(item => faceVerdict(item.score) !== "tidak_cocok" && best.score - item.score < KIOSK_MARGIN);
  const settled = (): KioskPick | null => best.present ? { kind: "sudah", employeeId: best.employeeId, score: best.score }
    : !best.consented ? { kind: "belum-setuju", employeeId: best.employeeId, score: best.score } : null;
  if (near.length === 1 && faceVerdict(best.score) === "cocok") return settled() ?? { kind: "cocok", employeeId: best.employeeId, score: best.score };
  const open = near.filter(item => !item.present && item.consented).slice(0, KIOSK_CANDIDATES);
  if (open.length) return { kind: "konfirmasi", candidates: open.map(({ employeeId, score }) => ({ employeeId, score })) };
  return settled() ?? { kind: "tidak-dikenali" };
}

/** What the tablet sends for one face: its numbers, the frames they came from, and the photo's type and size. */
export const kioskIdentifySchema = z.object({
  embedding: faceEmbedding,
  frameEmbeddings: z.array(faceEmbedding).min(2).max(6),
  signals: z.array(faceSignal).min(1).max(LIVENESS.maxFrames),
  mime: z.enum(proofMimes, { message: "Foto harus WebP atau JPEG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_SELFIE_BYTES, "Foto lebih dari 120 KB."),
});
export type KioskIdentify = z.infer<typeof kioskIdentifySchema>;

export const kioskToken = z.string().regex(/^[A-Za-z0-9_-]{20,600}\.[0-9a-f]{64}$/, "Absen tidak dikenali. Hadapkan wajah lagi.");
/** Recording one person the server named: its signed answer and the photo uploaded for them. */
export const kioskRecordSchema = z.object({
  token: kioskToken,
  photo: z.object({
    key: z.string().regex(proofKeyPattern, "Unggahan tidak dikenali. Hadapkan wajah lagi."),
    mime: z.enum(proofMimes),
    size: z.number().int().min(1).max(MAX_SELFIE_BYTES),
    token: faceUploadToken,
  }),
});
export type KioskRecord = z.infer<typeof kioskRecordSchema>;

export type KioskPerson = { employeeId: string; name: string; department: string; percent: number };
/** Someone the server named, ready to be recorded: the photo's upload slot and the signed answer. */
export type KioskCandidate = KioskPerson & { referenceUrl: string | null; token: string; upload: { key: string; uploadUrl: string; token: string } };
export type KioskAnswer =
  | { kind: "tidak-dikenali" }
  | { kind: "sudah"; person: KioskPerson; checkedInAt: string }
  | { kind: "belum-setuju"; person: KioskPerson }
  | { kind: "cocok"; candidate: KioskCandidate }
  | { kind: "konfirmasi"; candidates: KioskCandidate[] };
export type KioskRecorded = { kind: "tercatat" | "sudah"; person: KioskPerson; checkedInAt: string; present: number };

/** What the tablet's page starts with. */
export type KioskOverview = { total: number; withFace: number; present: number; opens: string | null; closes: string | null };
