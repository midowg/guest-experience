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

/** What a scan did, for the page that answers it. */
export type CheckInResult =
  | { kind: "tercatat" | "sudah"; checkedInAt: string }
  | { kind: "belum" | "tutup"; window: CheckInWindow }
  | { kind: "bukan-peserta" | "belum-terbit" | "tidak-dikenal" };

export type AttendanceRow = { employeeId: string; name: string; department: string; checkedInAt: string | null; method: "qr" | "manual" | null };

/** A random token for a session's QR: 24 URL-safe characters. */
export function newQrToken(random: (size: number) => Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return [...random(24)].map(byte => alphabet[byte & 63]).join("");
}
