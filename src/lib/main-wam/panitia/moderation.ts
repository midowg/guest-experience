import { reportReasonLabels, type PhotoStatus, type ReportReason } from "../types";
import { dayClock } from "./format";
import { MODERATION_NOTE_MAX, type ModerationReason } from "./schemas";

/*
 * Moderasi Momen (K08): which reported photos wait for panitia, and how a card reads. A photo waits
 * while it has a report newer than panitia's last decision on it (Sembunyikan or Tampilkan lagi),
 * so a new report after "Tampilkan lagi" brings it back. Reporters are never named. Pure.
 */

export type ModerationReport = { photoId: string; reason: ReportReason; note: string; createdAt: string };
export type ModerationDecision = { photoId: string; actedAt: string };

/** The photos with a report newer than the last decision on them. */
export function waitingPhotos(reports: readonly ModerationReport[], decisions: readonly ModerationDecision[]): Set<string> {
  const decided = new Map<string, number>();
  for (const decision of decisions) decided.set(decision.photoId, Math.max(decided.get(decision.photoId) ?? 0, Date.parse(decision.actedAt)));
  const waiting = new Set<string>();
  for (const report of reports) if (Date.parse(report.createdAt) > (decided.get(report.photoId) ?? 0)) waiting.add(report.photoId);
  return waiting;
}

/** "Saya ada di foto ini dan tidak setuju · 2", most first; without the count when there is one report. */
export function reasonLines(reports: readonly Pick<ModerationReport, "reason">[]): string[] {
  const counts = new Map<ReportReason, number>();
  for (const report of reports) counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  const many = reports.length > 1;
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => (many ? `${reportReasonLabels[reason]} · ${count}` : reportReasonLabels[reason]));
}

/** The reporters' notes, newest first, at most `max` (never who wrote them). */
export function reportNotes(reports: readonly ModerationReport[], max = 2): string[] {
  return [...reports].filter(report => report.note.trim()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, max).map(report => report.note.trim());
}

/** A card of the queue (K08). */
export type ModerationCard = {
  id: string;
  /** The uploader's nama panggilan, "Kelompok 7", when it was sent. */
  owner: string;
  group: string | null;
  createdAt: string;
  status: PhotoStatus;
  reports: number;
  reasons: string[];
  notes: string[];
  /** Short-lived storage addresses (the photo is private); null when storage is not set up. */
  thumb: string | null;
  large: string | null;
  /** Hidden by panitia: who and when (Disembunyikan tab). */
  hiddenBy: string | null;
  hiddenAt: string | null;
  /** Why, as the panitia gave it (other panitia only); "" without a reason. */
  hiddenReason?: string;
};

/** "Hana · Kelompok 7 · 09.40" (another day: "· Sen, 4 Jan · 20.15"). */
export const ownerLine = (card: Pick<ModerationCard, "owner" | "group" | "createdAt">, now: Date) => [card.owner, card.group, dayClock(card.createdAt, now)].filter(Boolean).join(" · ");

/** What panitia may do to a photo in each status. */
export type ModerationAction = "sembunyikan" | "tampilkan" | "hapus";
export function allowedActions(status: PhotoStatus, waiting: boolean): ModerationAction[] {
  if (status === "disembunyikan") return ["tampilkan", "hapus"];
  return waiting ? ["sembunyikan", "tampilkan"] : ["sembunyikan"];
}

/** The quick reasons panitia can pick for Sembunyikan and Hapus (audit L8). */
export const moderationReasonLabels: Record<ModerationReason, string> = {
  keberatan: "Ada yang keberatan",
  tidak_pantas: "Tidak pantas",
  data_pribadi: "Data pribadi",
};

/** What mw_moderation_log.reason keeps: "Tidak pantas · Ada nomor kamar", the note alone, or "" (no reason given). */
export function moderationReason(reason: ModerationReason | null | undefined, note: string | null | undefined): string {
  const text = (note ?? "").replace(/\s+/g, " ").trim().slice(0, MODERATION_NOTE_MAX);
  return [reason ? moderationReasonLabels[reason] : "", text].filter(Boolean).join(" · ");
}

/** "Disembunyikan Dimas · 09.05 · Tidak pantas" (the Disembunyikan tab). */
export function hiddenLine(card: Pick<ModerationCard, "hiddenBy" | "hiddenAt" | "hiddenReason">, now: Date): string {
  if (!card.hiddenAt) return "";
  return [card.hiddenBy ? `Disembunyikan ${card.hiddenBy}` : "Disembunyikan", dayClock(card.hiddenAt, now), card.hiddenReason || null].filter(Boolean).join(" · ");
}

/** The words the uploader receives (lonceng, and a push for a hidden photo: notePushTopic). */
export const ownerNotice: Record<ModerationAction, string> = {
  sembunyikan: "Fotomu disembunyikan panitia karena ada rekan yang keberatan.",
  tampilkan: "Fotomu tampil lagi di Momen.",
  hapus: "Fotomu dihapus panitia karena ada rekan yang keberatan.",
};
