import { addToQueue, readQueue, SCAN_QUEUE_KEY, type CheckInOutcome, type QueuedScan } from "@/lib/main-wam/modul/absen";
import { mainWamApi } from "@/lib/routes";
import { errorText, ModulError, modulRequest } from "../request";

/*
 * Scans kept on the phone while there is no signal (A01 offline, A02 "Absen tersimpan"), in
 * localStorage, and sent with the time they were scanned once there is signal (audit T1):
 * - a scan leaves the phone only when the server answered it for good: a result (ok, any outcome),
 *   or a refusal of ours that will not change (404 QR or module gone, 422 not valid, …);
 * - anything else keeps it to try again: no signal, signed out (401: sign in, then it goes), too
 *   many (429), the server busy (5xx), or an answer that is not ours (a hotel Wi-Fi's login page).
 */

export function loadQueue(): QueuedScan[] {
  try { return readQueue(window.localStorage.getItem(SCAN_QUEUE_KEY)); } catch { return []; }
}
function saveQueue(queue: QueuedScan[]) {
  try {
    if (queue.length) window.localStorage.setItem(SCAN_QUEUE_KEY, JSON.stringify(queue));
    else window.localStorage.removeItem(SCAN_QUEUE_KEY);
  } catch { /* private mode: the scan is shown as saved but lives only on this screen */ }
}
export function enqueueScan(scan: QueuedScan) {
  saveQueue(addToQueue(loadQueue(), scan));
}
const drop = (token: string) => saveQueue(loadQueue().filter(item => item.token !== token));

/** Our refusals that will not change by trying again: the scan is dropped (and the person told). */
const FINAL_STATUSES = [400, 403, 404, 409, 410, 413, 415, 422];
export const finalFailure = (error: unknown) => error instanceof ModulError && error.answered && FINAL_STATUSES.includes(error.status);
/** Worth keeping the scan and trying again (no signal, signed out, busy, or not our answer). */
export const retryable = (error: unknown) => !finalFailure(error);

/** One check-in now. Throws ModulError: `offline` without a connection; an answer that is not a result is not ours. */
export async function sendScan(token: string, scannedAt?: string, options: { reloadOnSignOut?: boolean } = {}): Promise<CheckInOutcome> {
  const { data } = await modulRequest<CheckInOutcome>(mainWamApi.checkIn(token), { method: "POST", json: scannedAt ? { scannedAt } : {}, ...options });
  if (!data || typeof (data as { kind?: unknown }).kind !== "string") throw new ModulError("Belum berhasil. Coba lagi sebentar.", 200);
  return data;
}

export type FlushResult = {
  /** Answered: the outcome of each (tercatat, sudah, or why not). */
  sent: { scan: QueuedScan; outcome: CheckInOutcome }[];
  /** Refused for good (the QR is gone, …): dropped, with the server's words. */
  dropped: { scan: QueuedScan; message: string }[];
  /** Still on the phone, to try again. */
  kept: number;
  /** Kept because the person is signed out: ask them to sign in. */
  login: boolean;
};

let flushing: Promise<FlushResult> | null = null;
/** Sends what is queued, in order, until one cannot go now. Never runs twice at once (callers share the result). */
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const result: FlushResult = { sent: [], dropped: [], kept: 0, login: false };
    for (const scan of loadQueue()) {
      try {
        const outcome = await sendScan(scan.token, scan.scannedAt, { reloadOnSignOut: false });
        drop(scan.token);
        result.sent.push({ scan, outcome });
      } catch (error) {
        if (finalFailure(error)) { drop(scan.token); result.dropped.push({ scan, message: errorText(error) }); continue; }
        // No signal, signed out, busy, or not our answer: the rest wait too (and the server is not hammered).
        result.login = error instanceof ModulError && error.status === 401;
        break;
      }
    }
    result.kept = loadQueue().length;
    return result;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** When to try again after `attempt` failed rounds in a row: 15 s, 30 s, 1, 2, then every 5 minutes. */
export const retryDelay = (attempt: number) => [15_000, 30_000, 60_000, 120_000][attempt] ?? 300_000;
