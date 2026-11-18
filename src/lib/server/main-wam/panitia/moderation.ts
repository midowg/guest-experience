import "server-only";
import { moderationReason, reasonLines, reportNotes, waitingPhotos, ownerNotice, type ModerationCard, type ModerationDecision, type ModerationReport } from "@/lib/main-wam/panitia/moderation";
import type { ModerateInput } from "@/lib/main-wam/panitia/schemas";
import { REPORT_REASONS, type PhotoStatus, type ReportReason } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { databaseError } from "../../http";
import { isR2Configured, presignDownload, removeObjects } from "../../r2";
import { sampleOnlyFor } from "@/lib/main-wam/demo";
import { demoModeration } from "../demo-panitia";
import { demoOn } from "../demo";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import type { MainWamViewer } from "@/lib/main-wam/types";
import { trySendMainWamNote } from "../notes";
import { mainWamPeople } from "../people";
import { db } from "./common";
import { waitingUpdate } from "./rundown";

/*
 * Moderasi Momen (K08) on the server. Momen (area B) files reports and hides a photo for everyone at
 * its third reporter (status ditinjau); panitia decide here: Sembunyikan, Tampilkan lagi, and Hapus
 * once hidden. Each decision goes through mw_moderate_photo (migration 202611200301): one step with
 * the photo's status, logged (siapa, kapan, apa, and the optional reason the panitia gave: audit L8),
 * refused when another panitia decided first. The uploader is told in fixed words (ownerNotice), never
 * the panitia's reason; reporters are never named. Photos are private: the cards carry short-lived
 * storage addresses made here.
 */

const LINK_SECONDS = 10 * 60;

type ReportRow = { photo_id: string; reason: string; note: string; created_at: string };
type PhotoRow = { id: string; owner_id: string; created_at: string; status: PhotoStatus; file_key: string; thumb_key: string | null; hidden_by: string | null; hidden_at: string | null; hidden_reason: string | null };
const asReport = (row: ReportRow): ModerationReport => ({
  photoId: row.photo_id, reason: (REPORT_REASONS as readonly string[]).includes(row.reason) ? row.reason as ReportReason : "lainnya", note: row.note ?? "", createdAt: row.created_at,
});

/** Reports on photos still shown or waiting (the queue's source), and panitia's last decisions on them. */
async function queueSource(): Promise<{ reports: ModerationReport[]; decisions: ModerationDecision[]; migrated: boolean }> {
  const { data, error } = await db().from("mw_photo_reports").select("photo_id,reason,note,created_at,mw_photos!inner(status)").in("mw_photos.status", ["tampil", "ditinjau"]).limit(2000);
  if (error) { if (mwMissing(error)) return { reports: [], decisions: [], migrated: false }; databaseError(error); }
  const reports = ((data ?? []) as unknown as ReportRow[]).map(asReport);
  const ids = [...new Set(reports.map(report => report.photoId))];
  if (!ids.length) return { reports, decisions: [], migrated: true };
  const { data: log, error: logError } = await db().from("mw_moderation_log").select("photo_id,acted_at").in("photo_id", ids).in("action", ["sembunyikan", "tampilkan"]).limit(5000);
  if (logError) { if (mwMissing(logError)) return { reports, decisions: [], migrated: false }; databaseError(logError); }
  return { reports, decisions: (log ?? []).map(row => ({ photoId: row.photo_id as string, actedAt: row.acted_at as string })), migrated: true };
}

/** How many photos wait for panitia (K01's badge and Perlu perhatian). Never throws. */
export async function waitingCount(viewer?: Pick<MainWamViewer, "demo">): Promise<number> {
  // Mode demo: the sample's two waiting photos, in place of the real queue for a role the account is not, or while the queue is empty.
  if (viewer && sampleOnlyFor(viewer, "kelola")) return demoModeration().reported.length;
  try {
    const { reports, decisions } = await queueSource();
    const count = waitingPhotos(reports, decisions).size;
    return count || !(await demoOn()) ? count : demoModeration().reported.length;
  } catch { return 0; }
}

export type ModerationData = { migrated: boolean; reported: ModerationCard[]; hidden: ModerationCard[]; now: string };

/** Both tabs of Moderasi Momen: Dilaporkan (waiting, newest report first) and Disembunyikan (newest first). */
export async function moderationData(now = new Date(), viewer?: Pick<MainWamViewer, "demo">): Promise<ModerationData> {
  const sample = () => ({ migrated: true, ...demoModeration(now), now: now.toISOString() });
  if (viewer && sampleOnlyFor(viewer, "kelola")) return sample();
  const real = await realModeration(now);
  return real.reported.length || real.hidden.length || !(await demoOn()) ? real : sample();
}

async function realModeration(now: Date): Promise<ModerationData> {
  const source = await queueSource();
  if (!source.migrated) return { migrated: false, reported: [], hidden: [], now: now.toISOString() };
  const waiting = waitingPhotos(source.reports, source.decisions);
  const { data: hiddenRows, error: hiddenError } = await db().from("mw_photos").select("id").eq("status", "disembunyikan").order("hidden_at", { ascending: false }).limit(100);
  if (hiddenError) databaseError(hiddenError);
  const ids = [...new Set([...waiting, ...(hiddenRows ?? []).map(row => row.id as string)])];
  if (!ids.length) return { migrated: true, reported: [], hidden: [], now: now.toISOString() };

  const [{ data: photos, error }, { data: allReports, error: reportsError }, people] = await Promise.all([
    db().from("mw_photos").select("id,owner_id,created_at,status,file_key,thumb_key,hidden_by,hidden_at,hidden_reason").in("id", ids),
    db().from("mw_photo_reports").select("photo_id,reason,note,created_at").in("photo_id", ids).limit(5000),
    mainWamPeople(),
  ]);
  if (error) databaseError(error);
  if (reportsError) databaseError(reportsError);
  const reportsOf = new Map<string, ModerationReport[]>();
  for (const report of ((allReports ?? []) as ReportRow[]).map(asReport)) reportsOf.set(report.photoId, [...(reportsOf.get(report.photoId) ?? []), report]);
  const signed = isR2Configured();
  const link = async (key: string | null) => (signed && key ? presignDownload(key, { seconds: LINK_SECONDS }).catch(() => null) : null);

  const cards = await Promise.all(((photos ?? []) as PhotoRow[]).map(async (photo): Promise<ModerationCard & { latest: number }> => {
    const reports = reportsOf.get(photo.id) ?? [];
    const [thumb, large] = await Promise.all([link(photo.thumb_key ?? photo.file_key), link(photo.file_key)]);
    return {
      id: photo.id, owner: people.get(photo.owner_id)?.name ?? "Tanpa nama", createdAt: photo.created_at, status: photo.status,
      reports: reports.length, reasons: reasonLines(reports), notes: reportNotes(reports), thumb, large,
      hiddenBy: photo.status === "disembunyikan" && photo.hidden_by ? people.get(photo.hidden_by)?.name ?? null : null, hiddenAt: photo.status === "disembunyikan" ? photo.hidden_at : null,
      hiddenReason: photo.status === "disembunyikan" ? photo.hidden_reason ?? "" : "",
      latest: Math.max(0, ...reports.map(report => Date.parse(report.createdAt))),
    };
  }));
  const strip = ({ latest: _latest, ...card }: ModerationCard & { latest: number }) => { void _latest; return card; };
  return {
    migrated: true, now: now.toISOString(),
    reported: cards.filter(card => card.status !== "disembunyikan" && waiting.has(card.id)).sort((a, b) => b.latest - a.latest).map(strip),
    hidden: cards.filter(card => card.status === "disembunyikan").sort((a, b) => Date.parse(b.hiddenAt ?? "") - Date.parse(a.hiddenAt ?? "")).map(strip),
  };
}

/** A panitia's decision on one photo, with the reason they gave (Sembunyikan, Hapus); the uploader is told. */
export async function moderatePhoto(context: MainWamContext, id: string, input: ModerateInput): Promise<void> {
  const reason = input.action === "tampilkan" ? "" : moderationReason(input.reason, input.note);
  const { data, error } = await db().rpc("mw_moderate_photo", { p_photo: id, p_action: input.action, p_from: input.from, p_by: context.viewer.id, p_reason: reason });
  if (error) {
    if (mwMissing(error)) throw waitingUpdate();
    if (error.message === "PHOTO_GONE") throw new ServiceError(404, "Foto ini sudah tidak ada.");
    if (error.message === "PHOTO_HANDLED") throw new ServiceError(409, "Foto ini baru saja ditangani panitia lain. Daftar dimuat ulang.");
    if (error.message === "PHOTO_INVALID") throw new ServiceError(422, "Tindakan ini tidak bisa untuk foto ini.");
    databaseError(error);
  }
  const result = ((data ?? []) as { out_owner: string | null; out_row: Record<string, unknown> | null }[])[0];
  if (input.action === "hapus" && result?.out_row && isR2Configured()) {
    const keys = Object.entries(result.out_row).filter(([column, value]) => column.endsWith("_key") && typeof value === "string" && value.startsWith("main-wam/momen/")).map(([, value]) => value as string);
    if (keys.length) await removeObjects(keys).catch(() => undefined);
  }
  // Tampilkan lagi for a photo that was never hidden: nothing changed for the uploader.
  if (!result?.out_owner || (input.action === "tampilkan" && input.from === "tampil")) return;
  await trySendMainWamNote({
    kind: "momen", title: "Momen", body: ownerNotice[input.action], to: { people: [result.out_owner], label: "Pengunggah" },
    link: input.action === "tampilkan" ? mainWamPath.moments({ foto: id }) : mainWamPath.gallery({ lihat: "saya" }), by: context.viewer.id, photoHidden: input.action !== "tampilkan",
  });
}
