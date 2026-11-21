import { z } from "zod";
import { MAIN_WAM_PATH } from "@/lib/routes";
import type { CeklisBlock } from "../ceklis/ceklis";
import { clock, t, type Lang } from "../i18n";
import { checkInState, checkInWindow, dayWord, wibDate, wibTime } from "../rundown";
import type { MwSession } from "../types";

/*
 * Absen QR in Main WAM (A01–A05; aturan-wam §7): a session marked "pakai absen" takes check-ins by
 * its printed QR from 30 minutes before its start to 30 minutes after its end (checkInWindow,
 * fondasi rundown.ts). BOD do not check in. The QR holds mainWamPath.checkIn(token): the phone's own
 * camera opens it, the in-app scanner reads it. Pure: the server and the screens share these.
 */

/** The migration of agen D (Silent Meeting's send, the approval's rule). */
export const MODUL_MIGRATION = "202611200401_main_wam_modul.sql";

/** A session's QR token (mw_sessions.qr_token): 20–64 URL-safe characters, as newQrToken makes them. */
export const QR_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
export const isQrToken = (value: string) => QR_TOKEN.test(value);

/**
 * The token of a scanned text, when it is a Main WAM check-in address of this site; null for any
 * other QR (another site, Pra WAM's, a plain text), so a stray QR never sends the person elsewhere.
 */
export function tokenFromScan(text: string, origin: string): string | null {
  let url: URL;
  try { url = new URL(text.trim(), origin); } catch { return null; }
  if (url.origin !== origin) return null;
  const prefix = `${MAIN_WAM_PATH}/absen/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const token = decodeURIComponent(url.pathname.slice(prefix.length).replace(/\/+$/, ""));
  return isQrToken(token) ? token : null;
}

/**
 * A scan queued while offline keeps the time it was scanned ("Dikirim otomatis dengan jam scan
 * 07.52") only when that time is inside the session's check-in window AND at most 30 minutes before
 * the server's time (audit M5: a photo of the printed QR, sent hours later with a time inside the
 * session, is refused), and not ahead of the server (2 minutes for a phone's clock). Otherwise the
 * server's time counts, and the window is checked against it.
 */
export const SCAN_FUTURE_MS = 2 * 60_000;
export const SCAN_MAX_AGE_MS = 30 * 60_000;
export function acceptedScanTime(scannedAt: string | null | undefined, now: Date, session: Pick<MwSession, "startsAt" | "endsAt">): Date {
  const at = scannedAt ? Date.parse(scannedAt) : NaN;
  if (!Number.isFinite(at)) return now;
  if (at > now.getTime() + SCAN_FUTURE_MS || at < now.getTime() - SCAN_MAX_AGE_MS) return now;
  const claimed = new Date(Math.min(at, now.getTime()));
  return checkInState(session, claimed) === "buka" ? claimed : now;
}

/** POST body of a check-in: nothing, or the time of a scan that was queued offline. */
export const checkInBodySchema = z.object({ scannedAt: z.iso.datetime({ offset: true, message: "Jam scan tidak dikenali." }).optional() }).strict();

/** What a scan did (A02 tercatat/sudah, A03 belum, A04 tutup, and the rest). */
export type CheckInSession = Pick<MwSession, "id" | "title" | "place">;
export type CheckInOutcome =
  | { kind: "tercatat" | "sudah"; session: CheckInSession; checkedInAt: string }
  | { kind: "belum"; session: CheckInSession; opens: string; closes: string }
  | { kind: "tutup"; session: CheckInSession; closes: string }
  /** Not a session that takes check-ins (draft, cancelled, not "pakai absen"). */
  | { kind: "tanpa-absen"; session: CheckInSession }
  /** BOD do not check in (aturan-wam §7). */
  | { kind: "bod" }
  /** No session has this QR (an old QR replaced by "Buat QR baru", or a mistyped address). */
  | { kind: "tidak-dikenal" }
  /** Module Ceklis: an agenda's checklist (the one that asks "lengkap sebelum absen") is not finished yet; the scan is not recorded. */
  | { kind: "ceklis"; session: CheckInSession; block: CeklisBlock };

/** The window of a session as the outcome tells it. */
export function windowOutcome(session: MwSession, at: Date): CheckInOutcome | null {
  const state = checkInState(session, at);
  const { opens, closes } = checkInWindow(session);
  const named = { id: session.id, title: session.title, place: session.place };
  if (state === "belum") return { kind: "belum", session: named, opens, closes };
  if (state === "tutup") return { kind: "tutup", session: named, closes };
  return null;
}

/** "07.52" today, "Sel, 5 Jan · 12.30" another day. */
export function clockWhen(iso: string, now: Date, lang: Lang = "id"): string {
  const time = clock(lang, wibTime(iso));
  const date = wibDate(iso);
  return date === wibDate(now.toISOString()) ? time : `${dayWord(date, wibDate(now.toISOString()), lang)} · ${time}`;
}

export type OutcomeText = { tone: "success" | "warning" | "error" | "neutral"; icon: "check" | "clock" | "timer-off" | "info" | "qr" | "list"; title: string; sub: string; body: string };

/** The words of A02–A04 and the other outcomes (SPEC revisi: one sentence, no pill). */
export function outcomeText(outcome: CheckInOutcome, now: Date, lang: Lang = "id"): OutcomeText {
  const say = (key: Parameters<typeof t>[1], vars?: Parameters<typeof t>[2]) => t(lang, key, vars);
  const when = (iso: string) => clockWhen(iso, now, lang);
  switch (outcome.kind) {
    case "tercatat": return { tone: "success", icon: "check", title: say("absen.recorded"), sub: `${outcome.session.title} · ${when(outcome.checkedInAt)}`, body: "" };
    case "sudah": return { tone: "success", icon: "check", title: say("absen.already"), sub: `${outcome.session.title} · ${when(outcome.checkedInAt)}`, body: "" };
    case "belum": return { tone: "warning", icon: "clock", title: say("absen.notOpen"), sub: outcome.session.title, body: say("absen.opensLater", { when: when(outcome.opens) }) };
    case "tutup": return { tone: "error", icon: "timer-off", title: say("absen.closed"), sub: outcome.session.title, body: say("absen.closedAt", { when: when(outcome.closes) }) };
    case "tanpa-absen": return { tone: "neutral", icon: "info", title: say("absen.noAttendance"), sub: outcome.session.title, body: say("absen.noScan") };
    case "bod": return { tone: "neutral", icon: "info", title: say("absen.notNeeded"), sub: "", body: say("absen.bodNoCheckIn") };
    case "ceklis": return { tone: "warning", icon: "list", title: say("absen.ceklisFirst"), sub: outcome.session.title, body: say("absen.ceklisBody", { title: outcome.block.title, done: outcome.block.done, total: outcome.block.total }) };
    case "tidak-dikenal": return { tone: "neutral", icon: "qr", title: say("absen.unknownQr"), sub: "", body: say("absen.askNewQr") };
  }
}

/** A scan kept on the phone while offline (localStorage), sent when there is signal. */
export const queuedScanSchema = z.object({
  token: z.string().regex(QR_TOKEN),
  scannedAt: z.iso.datetime({ offset: true }),
  /** The session the scanner showed as now ("Pemaparan departemen"), for A02 offline. */
  title: z.string().max(150).default(""),
});
export type QueuedScan = z.infer<typeof queuedScanSchema>;
export const SCAN_QUEUE_KEY = "mw-absen-antre";

/** The queue as stored: unknown or broken entries are dropped, the same token once (the first scan). */
export function readQueue(raw: string | null): QueuedScan[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: QueuedScan[] = [];
  for (const item of parsed) {
    const result = queuedScanSchema.safeParse(item);
    if (!result.success || seen.has(result.data.token)) continue;
    seen.add(result.data.token);
    out.push(result.data);
  }
  return out.slice(0, 20);
}
export function addToQueue(queue: readonly QueuedScan[], scan: QueuedScan): QueuedScan[] {
  return queue.some(item => item.token === scan.token) ? [...queue] : [...queue, scan].slice(-20);
}

/**
 * The Absen card of Detail sesi (slot SessionAbsen, P04 + P04__status) for a participant:
 * open → the Absen button; present → "Hadir 07.52"; missed → "Tidak tercatat hadir"; before the
 * window → nothing. Cancelled sessions and sessions without absen show nothing.
 */
export type AbsenCard =
  | { kind: "none" }
  | { kind: "buka"; closes: string }
  | { kind: "hadir"; at: string }
  | { kind: "terlewat" };
export function absenCard(session: Pick<MwSession, "status" | "usesAttendance" | "startsAt" | "endsAt">, checkedInAt: string | null, now: Date): AbsenCard {
  if (session.status !== "terbit" || !session.usesAttendance) return { kind: "none" };
  if (checkedInAt) return { kind: "hadir", at: checkedInAt };
  const state = checkInState(session, now);
  if (state === "buka") return { kind: "buka", closes: checkInWindow(session).closes };
  if (state === "tutup") return { kind: "terlewat" };
  return { kind: "none" };
}

/** "Hadir 07.52". */
export const presentLabel = (at: string, lang: Lang = "id") => t(lang, "absen.present", { time: clock(lang, wibTime(at)) });
