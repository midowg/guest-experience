import { z } from "zod";

/*
 * When a session's QR signs people in: from 30 minutes before the start to 30 minutes after the
 * end (decided 3 Nov 2026). The QR itself never changes when the session moves; the window
 * follows the session's current time.
 */

export const CHECK_IN_MARGIN_MINUTES = 30;

export type CheckInWindow = { opens: string; closes: string };
export type WindowState = "belum" | "buka" | "tutup";

export function checkInWindow(startsAt: string, endsAt: string): CheckInWindow {
  const margin = CHECK_IN_MARGIN_MINUTES * 60_000;
  return { opens: new Date(new Date(startsAt).getTime() - margin).toISOString(), closes: new Date(new Date(endsAt).getTime() + margin).toISOString() };
}

export function windowState(window: CheckInWindow, now: Date): WindowState {
  if (now < new Date(window.opens)) return "belum";
  return now <= new Date(window.closes) ? "buka" : "tutup";
}

/**
 * What "Saya hadir" in Aksi cepat is for right now: the first of the person's sessions whose
 * check-in window is open and that is not recorded yet; null when there is none.
 */
export function checkInNow<T extends { kind: string; startsAt: string; endsAt: string; checkedInAt: string | null }>(items: readonly T[], now: Date): T | null {
  return items.find(item => item.kind === "sesi" && !item.checkedInAt && windowState(checkInWindow(item.startsAt, item.endsAt), now) === "buka") ?? null;
}

/*
 * How a session takes attendance (decided 5 Nov 2026): a session made from a room booking
 * (appraisal, a meeting) only with "Saya hadir"; a session the panitia made (forum, pleno…) only
 * with its printed QR. The server holds to it; the screens show only the one way.
 */
export type CheckInWay = "tombol" | "qr";
export const checkInWay = (session: { booking?: unknown }): CheckInWay => (session.booking ? "tombol" : "qr");

/**
 * What a scan or "Saya hadir" did, for the page that answers it. "pakai-tombol": a QR scanned for
 * a booking's session; "pakai-qr": "Saya hadir" for a panitia's session.
 */
export type CheckInResult =
  | { kind: "tercatat" | "sudah"; checkedInAt: string }
  | { kind: "belum" | "tutup"; window: CheckInWindow }
  | { kind: "bukan-peserta" | "belum-terbit" | "tidak-dikenal" | "pakai-tombol" | "pakai-qr" };

/**
 * How someone was signed in: qr (scanned the printed QR), manual (panitia marked them), offline
 * ("Saya hadir" at the office) and online ("Saya hadir" through Zoom, with a screenshot). The last
 * two need migration 202611050003.
 */
export type AttendanceMethod = "qr" | "manual" | "offline" | "online";
export const attendanceMethods = ["qr", "manual", "offline", "online"] as const satisfies readonly AttendanceMethod[];

/** For panitia and BOD, next to the time in Daftar hadir: always which way, so QR and "Saya hadir" read apart. */
export const methodLabels: Record<AttendanceMethod, string> = { offline: "Saya hadir · di kantor", online: "Saya hadir · online", qr: "Scan QR", manual: "Dicatat panitia/notulis" };
/** For the participant, after "Hadir 09.42 · ". */
export const ownMethodLabels: Record<AttendanceMethod, string> = { offline: "di kantor", online: "online (Zoom)", qr: "scan QR", manual: "dicatat panitia/notulis" };

export const asMethod = (value: unknown): AttendanceMethod | null => attendanceMethods.includes(value as AttendanceMethod) ? value as AttendanceMethod : null;

export type AttendanceRow = {
  employeeId: string; name: string; department: string; checkedInAt: string | null; method: AttendanceMethod | null;
  /** An online check-in's Zoom screenshot is kept (panitia and BOD may open it). */
  hasProof: boolean;
};

/** How many are present by each way, for the head of Daftar hadir. */
export function methodCounts(rows: Pick<AttendanceRow, "checkedInAt" | "method">[]): Record<AttendanceMethod, number> {
  const counts: Record<AttendanceMethod, number> = { offline: 0, online: 0, qr: 0, manual: 0 };
  for (const row of rows) if (row.checkedInAt && row.method) counts[row.method] += 1;
  return counts;
}

/** A random token for a session's QR: 24 URL-safe characters. */
export function newQrToken(random: (size: number) => Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return [...random(24)].map(byte => alphabet[byte & 63]).join("");
}

/*
 * "Saya hadir" (migration 202611050003): the participant signs themselves in while the window is
 * open, at the office with one tap, or online with a screenshot of the Zoom meeting. The browser
 * makes the screenshot at most 2000 px on its longer side and at most 1.5 MB, as WebP (JPEG where
 * the browser cannot write WebP); the server agrees the type and size, the browser puts it in
 * private storage, and the server checks its first bytes before keeping the check-in.
 */

export const SELF_CHECK_IN_MIGRATION = "202611050003_pra_wam_self_check_in.sql";
export const MAX_PROOF_BYTES = Math.round(1.5 * 1024 * 1024);
/** Long enough to read names and the meeting title on a laptop screenshot. */
export const PROOF_SIDE = 2000;
export const proofTypes = {
  "image/webp": { ext: "webp", steps: [0.86, 0.78, 0.7, 0.62, 0.54, 0.46] },
  "image/jpeg": { ext: "jpg", steps: [0.88, 0.8, 0.72, 0.64, 0.56, 0.48] },
} as const;
export type ProofMime = keyof typeof proofTypes;
const proofMimes = Object.keys(proofTypes) as [ProofMime, ...ProofMime[]];

/** The size to draw a picture at: its longer side at most `side`, never larger than it was. */
export function fitWithin(width: number, height: number, side = PROOF_SIDE): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Where a screenshot lives: the migration's check allows only this shape. */
export const proofKeyPattern = new RegExp(`^pra-wam/absen/${uuid}/${uuid}/${uuid}\\.(webp|jpg)$`);
export const proofKeyFor = (sessionId: string, employeeId: string, id: string, mime: ProofMime) => `pra-wam/absen/${sessionId}/${employeeId}/${id}.${proofTypes[mime].ext}`;
/** The key is this person's, for this session, of the agreed type: nobody confirms into another folder. */
export const isOwnProofKey = (key: string, sessionId: string, employeeId: string, mime: ProofMime) =>
  proofKeyPattern.test(key) && key.startsWith(`pra-wam/absen/${sessionId}/${employeeId}/`) && key.endsWith(`.${proofTypes[mime].ext}`);

export const proofStartSchema = z.object({
  mime: z.enum(proofMimes, { message: "Gambar harus WebP atau JPEG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_PROOF_BYTES, "Gambar lebih dari 1,5 MB."),
});
export type ProofStart = z.infer<typeof proofStartSchema>;
export const proofSchema = proofStartSchema.extend({
  key: z.string().regex(proofKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});
export type Proof = z.infer<typeof proofSchema>;
export const selfCheckInSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("offline") }),
  z.object({ mode: z.literal("online"), proof: proofSchema }),
], { message: "Pilih hadir di kantor atau online." });
export type SelfCheckIn = z.infer<typeof selfCheckInSchema>;

/** What the server answers after "Saya hadir". */
export type SelfCheckInAnswer = { kind: "tercatat" | "sudah"; checkedInAt: string; method: AttendanceMethod | null };

/** Why "Saya hadir" cannot be recorded, in the same words as the QR page; null when it can. */
export function selfCheckInRefusal(result: CheckInResult, clock: (iso: string) => string): string | null {
  switch (result.kind) {
    case "belum": return `Absen belum dibuka. Absen sesi ini berlaku ${clock(result.window.opens)}–${clock(result.window.closes)}.`;
    case "tutup": return `Absen sudah ditutup ${clock(result.window.closes)}. Bila kamu hadir, minta panitia mencatat secara manual.`;
    case "bukan-peserta": return "Kamu bukan peserta sesi ini. Bila seharusnya ikut, minta panitia menambahkanmu atau mencatat kehadiranmu.";
    case "belum-terbit": return "Sesi ini belum diterbitkan panitia, jadi absen belum bisa dicatat.";
    case "tidak-dikenal": return "Sesi tidak ditemukan.";
    case "pakai-qr": return "Absen sesi ini dengan scan QR yang ditempel di ruang.";
    case "pakai-tombol": return "Sesi ini dari booking ruang. Absen dengan tombol Saya hadir di aplikasi, tanpa QR.";
    default: return null;
  }
}

/**
 * Tries WebP at each quality step, then JPEG if the browser wrote something else (a canvas that
 * cannot make WebP quietly answers PNG), until one is within 1.5 MB. `encode` is the canvas.
 */
export async function encodeProof(encode: (mime: ProofMime, quality: number) => Promise<Blob | null>, limit = MAX_PROOF_BYTES): Promise<{ blob: Blob; mime: ProofMime }> {
  for (const mime of proofMimes) {
    for (const quality of proofTypes[mime].steps) {
      const blob = await encode(mime, quality);
      if (!blob || blob.type !== mime) break;
      if (blob.size <= limit) return { blob, mime };
    }
  }
  throw new Error("Gambar belum dapat diperkecil sampai 1,5 MB. Coba tangkapan layar lain.");
}
