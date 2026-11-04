import { z } from "zod";

/*
 * "Lupa password" as a request to the admin WAM, who resets the account to the shared first
 * password. The asker always gets the same answer, whether or not the email has an account, so
 * the form cannot be used to find out who works here.
 */

export type ResetRequestStatus = "menunggu" | "selesai" | "ditolak";
export const resetStatusLabels: Record<ResetRequestStatus, string> = { menunggu: "Menunggu", selesai: "Direset", ditolak: "Ditolak" };

export const RESET_NOTE_MAX = 300;
/** An unknown email is ignored while the same one is already open from the last 24 hours. */
export const UNKNOWN_REPEAT_MS = 24 * 60 * 60 * 1000;
/** At most this many open requests for unknown emails from the last 24 hours, so the list cannot be flooded. */
export const UNKNOWN_OPEN_CAP = 30;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Isi email kantor yang valid.").max(200, "Email terlalu panjang.")),
  note: z.string().trim().max(RESET_NOTE_MAX, `Catatan paling banyak ${RESET_NOTE_MAX} karakter.`).default(""),
});
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;

export const resetActionSchema = z.object({ action: z.enum(["reset", "tolak"]) });

/** The one answer to every request that was taken in, known email or not. */
export const RESET_REQUEST_SENT = "Permintaan tercatat. Bila email ini terdaftar, admin WAM akan mengatur ulang password-mu ke password awal.";
/** Before migration 202611040010 nothing can be recorded; still the same for every email. */
export const RESET_REQUEST_OFFLINE = "Permintaan belum dapat dicatat otomatis. Hubungi admin WAM langsung untuk mengatur ulang password-mu.";

export type OpenRequest = { employeeId: string | null; email: string; createdAt: string };

/**
 * Whether to record a new request. A known account keeps one open request (the database also
 * refuses a second); an unknown email is dropped while the same one is open from the last day,
 * or once too many unknown emails are open.
 */
export function shouldRecord(request: { employeeId: string | null; email: string }, open: OpenRequest[], now = Date.now()): boolean {
  if (request.employeeId) return !open.some(row => row.employeeId === request.employeeId);
  const recent = open.filter(row => !row.employeeId && now - Date.parse(row.createdAt) < UNKNOWN_REPEAT_MS);
  if (recent.some(row => normalizeEmail(row.email) === normalizeEmail(request.email))) return false;
  return recent.length < UNKNOWN_OPEN_CAP;
}

/** What the asker is told; deliberately the same however the request was handled. */
export function resetRequestAnswer(result: { migrated: boolean }): { sent: boolean; message: string } {
  return result.migrated ? { sent: true, message: RESET_REQUEST_SENT } : { sent: false, message: RESET_REQUEST_OFFLINE };
}

/** Escapes LIKE wildcards so an address is matched as written. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

/** The person matching an address, ignoring case and stray spaces; an active one first. */
export function matchEmployee<T extends { id: string; email: string | null; active?: boolean }>(people: T[], email: string): T | null {
  const address = normalizeEmail(email);
  const matches = people.filter(person => normalizeEmail(person.email ?? "") === address);
  return matches.find(person => person.active !== false) ?? matches[0] ?? null;
}
