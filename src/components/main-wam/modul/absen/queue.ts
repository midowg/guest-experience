import { addToQueue, readQueue, SCAN_QUEUE_KEY, type CheckInOutcome, type QueuedScan } from "@/lib/main-wam/modul/absen";
import { mainWamApi } from "@/lib/routes";
import { ModulError, modulRequest } from "../request";

/*
 * Scans kept on the phone while there is no signal (A01 offline, A02 "Absen tersimpan"), in
 * localStorage, and sent with the time they were scanned once there is signal. A QR the server
 * answers (any answer) leaves the queue; only a missing connection keeps it.
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

/** One check-in now (online), or null when there is no connection. */
export async function sendScan(token: string, scannedAt?: string): Promise<CheckInOutcome> {
  const { data } = await modulRequest<CheckInOutcome>(mainWamApi.checkIn(token), { method: "POST", json: scannedAt ? { scannedAt } : {} });
  return data;
}

let flushing: Promise<{ scan: QueuedScan; outcome: CheckInOutcome }[]> | null = null;
/** Sends what is queued; returns what the server said for each sent scan. Never runs twice at once. */
export function flushQueue(): Promise<{ scan: QueuedScan; outcome: CheckInOutcome }[]> {
  if (flushing) return flushing;
  flushing = (async () => {
    const done: { scan: QueuedScan; outcome: CheckInOutcome }[] = [];
    for (const scan of loadQueue()) {
      try {
        done.push({ scan, outcome: await sendScan(scan.token, scan.scannedAt) });
      } catch (error) {
        if (error instanceof ModulError && error.offline) break;
      }
      saveQueue(loadQueue().filter(item => item.token !== scan.token));
    }
    return done;
  })().finally(() => { flushing = null; });
  return flushing;
}
