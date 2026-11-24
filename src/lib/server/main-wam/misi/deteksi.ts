import "server-only";
import { after } from "next/server";
import { moduleAllows } from "@/lib/main-wam/access";
import { actionFor, autoModeOf, detectForPhoto, type Candidate, type PhotoFacts } from "@/lib/main-wam/misi/detect";
import { canStart, missionItems, type FromPhoto, type MissionItem, type MissionStatus } from "@/lib/main-wam/misi/missions";
import { COMPLETION_COLUMNS, COMPLETION_COLUMNS_BASE, completionFromRow } from "@/lib/main-wam/misi/rows";
import { effectiveRules, type TagCandidate } from "@/lib/main-wam/misi/rules";
import { MISSIONS_DETECT_MIGRATION, type MwCompletion, type MwMission } from "@/lib/main-wam/misi/types";
import { decide, isFromMomen, reasonLine, TAKE_BACK_STATUSES, type AutoProof, type CheckResult } from "@/lib/main-wam/misi/verify";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { demoOn } from "../demo";
import { mwFail, mwMissing, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { photoRecord } from "../momen/feed";
import { trySendMainWamNote } from "../notes";
import { limitPerson } from "../modul/rate";
import { doableMission, keepCompletion } from "./actions";
import { detectionsOf, markChecked, readAutoPref, recordDetection, saveAutoPref, saveSignals, signalsOf, type DetectionRow, type PhotoSignal } from "./deteksi-store";
import { allMissions, completionsOf, missionSettings } from "./read";
import { proofAddress } from "./storage";
import { loadTagPool, savePhotoTags, tellTagged } from "./tags";
import { runVerifier, selectedProvider } from "./verifier";

/*
 * Mission detection from Momen photos, the server's side (docs/main-wam/KONTRAK.md §13). A regular Momen
 * photo that happens to meet a photo mission is recognised (src/lib/main-wam/misi/detect.ts, pure) and, by
 * the person's leave, sent for that mission from the photo that is already there: no second upload, the same
 * verifier and the same road as a shot made for the mission (dikirim, then disetujui, perlu_ditinjau or ditolak;
 * points only with disetujui). Never in the way of the photo itself: it runs after the answer
 * (`after()` of Next, which Vercel keeps alive until the work ends), and any trouble is only logged.
 *
 * What the person controls: the switch "Deteksi misi otomatis" (default on; off or not yet saved: a suggestion
 * only, never sent by itself), "Tarik" while nobody has decided, "Abaikan" and "Ajukan" on a suggestion.
 * The photo's position is read only here, for the match; it is in no answer for anyone.
 */

const db = () => createPrivilegedClient();

/** The few columns of a photo detection needs. */
export type PhotoLite = { id: string; ownerId: string; fileKey: string; takenAt: string };
export type DetectionResult = {
  photoId: string; missionId: string; title: string; points: number; status: "cocok" | "mungkin";
  outcome: "diajukan" | "saran" | "ditolak"; completionStatus: MwCompletion["status"] | null; reason?: string;
};
type Signal = Pick<PhotoSignal, "live" | "geo">;

/** The most that is checked at once: "Periksa fotoku" and the retries. */
export const CHECK_AT_ONCE = 30;
/** A photo that was just kept shows to others after 5 seconds; detection waits for that, so a photo taken back (Batalkan) is never sent. */
const VISIBLE_WAIT_MAX_MS = 8_000;

const money = (points: number) => points.toLocaleString("id-ID");

/** The people tagged on these photos (still on), by photo. */
async function taggedOn(photoIds: readonly string[], pool: ReadonlyMap<string, TagCandidate>): Promise<Map<string, TagCandidate[]>> {
  const out = new Map<string, TagCandidate[]>();
  if (!photoIds.length) return out;
  const { data, error } = await db().from("mw_photo_tags").select("photo_id,employee_id").in("photo_id", [...photoIds]).is("removed_at", null).limit(2000);
  if (error) { if (mwMissing(error as DbError)) return out; mwFail(error as DbError, MISSIONS_DETECT_MIGRATION); }
  for (const row of (data ?? []) as { photo_id: string; employee_id: string }[]) {
    const person = pool.get(row.employee_id);
    if (person) out.set(row.photo_id, [...(out.get(row.photo_id) ?? []), person]);
  }
  return out;
}

type Run = { by: "otomatis" | "peserta"; now: Date };

/**
 * Sends one photo for one mission: the same checks the mission camera makes (already passed in the candidate),
 * the verifier, then the completion made from the existing photo (photo_id, no proof file of its own).
 * null when it was not sent (the verifier said no to a photo nobody asked to send; someone else's request won).
 */
async function submit(context: MainWamContext, mission: MwMission, photo: PhotoLite, signal: Signal | undefined, candidate: Candidate, tags: TagCandidate[], run: Run): Promise<MwCompletion | null> {
  const found = await doableMission(context, mission.id, "foto", run.now);
  const rules = effectiveRules(mission, found.settings.defaultRadiusM);
  const counted = tags.filter(tag => candidate.counted.includes(tag.id));
  const verifier = await runVerifier({
    misi: { id: mission.id, title: mission.title, description: mission.description }, aturan: rules,
    foto: { key: photo.fileKey, address: () => proofAddress(photo.fileKey) },
    lokasi: signal?.geo ? { latitude: signal.geo.latitude, longitude: signal.geo.longitude, accuracyM: Math.round(signal.geo.accuracy ?? 0), distanceM: candidate.distanceM } : null,
    tag: counted.map(tag => ({ id: tag.id, name: tag.name, department: tag.department, bod: tag.bod })), waktu: photo.takenAt,
  });
  const decision = decide({ ruleReasons: [], verifier: verifier.result, review: mission.review });
  // The app sent it by itself and the verifier says it is not the mission: say nothing, the person never asked. A person who tapped Ajukan is told why.
  if (decision.status === "ditolak" && run.by === "otomatis") return null;
  const auto: AutoProof = { via: "momen", photoId: photo.id, status: candidate.status === "cocok" ? "cocok" : "mungkin", by: run.by, passed: candidate.passed, unknown: candidate.unknown, distanceM: candidate.distanceM };
  const result: CheckResult = { checks: candidate.checks, verifier, decidedAt: run.now.toISOString(), auto };
  const completion = await keepCompletion(context, found, {
    source: "foto", proof_key: null, proof_thumb_key: null, latitude: null, longitude: null, accuracy_m: null, distance_m: candidate.distanceM,
    taken_at: photo.takenAt, attempts: (found.existing?.attempts ?? 0) + 1, photo_id: photo.id, check_result: result,
    review_note: decision.status === "ditolak" ? reasonLine(decision.reasons) : "",
  }, decision.status);
  return completion;
}

/** The status the person sees for a completion. */
const stateOf = (status: MwCompletion["status"] | null): MissionStatus => {
  switch (status) {
    case "disetujui": return "done";
    case "dikirim": case "diperiksa": return "pending";
    case "perlu_ditinjau": case "menunggu": return "review";
    case "ditolak": return "rejected";
    default: return "todo";
  }
};
export const missionStateOf = stateOf;

async function note(to: string, title: string, body: string, tag: string) {
  await trySendMainWamNote({ kind: "lain", title, body, to: { people: [to], label: "Peserta misi" }, link: mainWamPath.missions, by: null, tag });
}

/**
 * Looks at photos of the viewer (their own, shown) against every photo mission that takes detection, and acts:
 * sends by itself, or only offers, as the person's switch says. `force` + `only` is the person's own "Ajukan"
 * of one suggestion. Photos are taken oldest first so an older photo gets the mission first.
 */
export async function detectPhotos(context: MainWamContext, photos: readonly PhotoLite[], options: { now?: Date; extra?: ReadonlyMap<string, Signal>; only?: string; force?: boolean } = {}): Promise<DetectionResult[]> {
  const out: DetectionResult[] = [];
  const { viewer } = context;
  if (!photos.length || !moduleAllows(viewer, "misi", context.settings.modules)) return out;
  const now = options.now ?? new Date();
  const missions = await allMissions();
  if (!missions.migrated) return out;
  const [settings, aiVerifier] = [await missionSettings(), selectedProvider() !== "manual"];
  const takers = missions.data.filter(mission => mission.active && mission.kind === "foto" && (!options.only || mission.id === options.only)
    && autoModeOf({ ...mission, rules: effectiveRules(mission, settings.defaultRadiusM) }, aiVerifier) !== "mati");
  // Nothing takes detection now: the photos stay unchecked, so "Periksa fotoku" can look at them once a mission does.
  if (!takers.length) return out;
  const ordered = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const ids = ordered.map(photo => photo.id);
  const [completions, pool, signals, before, pref] = await Promise.all([
    completionsOf(viewer.id), loadTagPool(context), signalsOf(ids).catch(() => new Map<string, PhotoSignal>()), detectionsOf(ids).catch(() => [] as DetectionRow[]), readAutoPref(viewer.id).catch(() => ({ on: false, stored: false })),
  ]);
  const tagged = await taggedOn(ids, pool).catch(() => new Map<string, TagCandidate[]>());
  const working = completions.data.map(({ missionId, status, attempts }) => ({ missionId, status, attempts }));
  const suggested: { title: string; points: number }[] = [];
  const seen = (photoId: string, missionId: string) => before.find(row => row.photoId === photoId && row.missionId === missionId)?.outcome ?? null;

  for (const photo of ordered) {
    const signal = signals.get(photo.id) ?? options.extra?.get(photo.id);
    const facts: PhotoFacts = { photoId: photo.id, takenAt: photo.takenAt, live: signal?.live ?? true, geo: signal?.geo ?? null, tags: tagged.get(photo.id) ?? [] };
    const candidates = detectForPhoto({ missions: takers, completions: working, photo: facts, submitter: { id: viewer.id, department: viewer.department }, settings, now, aiVerifier });
    for (const candidate of candidates) {
      const mission = takers.find(item => item.id === candidate.missionId);
      if (!mission) continue;
      const base = { photoId: photo.id, missionId: mission.id, title: mission.title, points: mission.points, status: candidate.status === "cocok" ? "cocok" as const : "mungkin" as const };
      const forced = !!options.force && options.only === mission.id;
      if (forced && candidate.status === "tidak") { out.push({ ...base, outcome: "ditolak", completionStatus: null, reason: candidate.reasons[0] ?? "Foto ini belum memenuhi syarat misi." }); continue; }
      const action = forced ? "ajukan" : actionFor(candidate, { personAuto: pref.on, before: seen(photo.id, mission.id) });
      if (action === "lewati") continue;
      if (action === "saran") {
        await recordDetection({ ...base, outcome: "saran", completionId: null, reasons: [...candidate.passed, ...candidate.unknown] });
        out.push({ ...base, outcome: "saran", completionStatus: null });
        if (candidate.status === "cocok") suggested.push({ title: mission.title, points: mission.points });
        continue;
      }
      try {
        const completion = await submit(context, mission, photo, signal, candidate, tagged.get(photo.id) ?? [], { by: forced ? "peserta" : "otomatis", now });
        if (!completion) continue;
        working.push({ missionId: mission.id, status: completion.status, attempts: completion.attempts });
        await recordDetection({ ...base, outcome: "diajukan", completionId: completion.id, reasons: [...candidate.passed, ...candidate.unknown] });
        out.push({ ...base, outcome: "diajukan", completionStatus: completion.status });
        if (completion.status === "disetujui") await note(viewer.id, `Misi ${mission.title} selesai`, `${money(mission.points)} poin masuk dari fotomu di Momen.`, `deteksi-${photo.id}-${mission.id}`);
        else if (completion.status !== "ditolak") await note(viewer.id, `Fotomu otomatis diajukan untuk misi ${mission.title}`, `+${money(mission.points)} poin, menunggu pemeriksaan. Tidak mau? Tarik dari halaman Misi.`, `deteksi-${photo.id}-${mission.id}`);
      } catch (error) {
        // Another request kept it first, or the mission closed meanwhile: nothing to send. A forced one tells why.
        if (forced) throw error;
        if (!(error instanceof ServiceError)) console.warn("main-wam: deteksi misi gagal mengajukan", error instanceof Error ? error.message : error);
      }
    }
  }
  await markChecked(ordered.map(photo => ({ id: photo.id, ownerId: photo.ownerId }))).catch(() => undefined);
  if (suggested.length) {
    const names = suggested.slice(0, 3).map(item => item.title).join(", ");
    await note(viewer.id, "Fotomu cocok untuk misi", `${names}${suggested.length > 3 ? " dan lainnya" : ""}. Buka halaman Misi untuk mengajukannya.`, `deteksi-saran-${ordered[ordered.length - 1].id}`);
  }
  return out;
}

export type MomenSaved = { tags: readonly string[]; geo: { latitude: number; longitude: number; accuracy: number } | null; gallery: boolean };

/**
 * After a Momen photo is kept: remember its signals, keep its tags (telling the people tagged), then look for
 * missions it meets. Waits until the photo shows to others (5 seconds), and stops if it was taken back or
 * hidden meanwhile. Never throws: the photo is already kept.
 */
export async function afterMomenSaved(context: MainWamContext, photo: { id: string; visibleAt: string }, input: MomenSaved, deps: { wait?: (ms: number) => Promise<void> } = {}): Promise<void> {
  const wait = deps.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const owner = context.viewer.id;
  try {
    const live = !input.gallery;
    const geo = live ? input.geo : null;
    await saveSignals({ photoId: photo.id, ownerId: owner, live, geo });
    let tags: TagCandidate[] = [];
    if (input.tags.length) {
      const pool = await loadTagPool(context);
      tags = [...new Set(input.tags.map(id => id.toLowerCase()))].flatMap(id => pool.get(id) ?? []);
      if (tags.length) await savePhotoTags(photo.id, owner, tags);
    }
    const hold = Math.min(VISIBLE_WAIT_MAX_MS, Date.parse(photo.visibleAt) - Date.now());
    if (hold > 0) await wait(hold + 300);
    const kept = await photoRecord(photo.id).catch(() => null);
    // Taken back (Batalkan) or hidden while it waited: nothing is told and nothing is sent.
    if (!kept || kept.status !== "tampil") return;
    if (tags.length) await tellTagged(kept.id, context.viewer.name, null).catch(() => undefined);
    await detectPhotos(context, [{ id: kept.id, ownerId: kept.ownerId, fileKey: kept.fileKey, takenAt: kept.takenAt }], { extra: new Map([[kept.id, { live, geo: geo ? { ...geo } : null }]]) });
  } catch (error) {
    console.warn("main-wam: deteksi misi dari foto Momen belum selesai", error instanceof Error ? error.message : error);
  }
}

/** Runs `afterMomenSaved` after the answer (Next's `after`); outside a request (a test) nothing runs. */
export function scheduleAfterMomenSaved(context: MainWamContext, photo: { id: string; visibleAt: string }, input: MomenSaved): void {
  try { after(() => afterMomenSaved(context, photo, input)); } catch { /* not inside a request */ }
}

/* ── The person's own steps ───────────────────────────────────────────────────────────────────── */

const liteOf = (photo: { id: string; ownerId: string; fileKey: string; takenAt: string }): PhotoLite => ({ id: photo.id, ownerId: photo.ownerId, fileKey: photo.fileKey, takenAt: photo.takenAt });

/** "Periksa fotoku": the newest photos of mine that were never looked at (at most 30), sent or offered as my switch says. */
export async function checkMyPhotos(context: MainWamContext, now = new Date()): Promise<{ checked: number; results: DetectionResult[] }> {
  await limitPerson("misi-periksa", context.viewer.id, 6);
  const { data, error } = await db().from("mw_photos").select("id,owner_id,file_key,taken_at").eq("owner_id", context.viewer.id).eq("status", "tampil").is("mission_id", null).order("created_at", { ascending: false }).limit(CHECK_AT_ONCE * 2);
  if (error) mwFail(error as DbError, MISSIONS_DETECT_MIGRATION);
  const all = ((data ?? []) as { id: string; owner_id: string; file_key: string; taken_at: string }[]).map(row => ({ id: row.id, ownerId: row.owner_id, fileKey: row.file_key, takenAt: row.taken_at }));
  const signals = await signalsOf(all.map(photo => photo.id));
  const unchecked = all.filter(photo => !signals.get(photo.id)?.checkedAt).slice(0, CHECK_AT_ONCE);
  const results = await detectPhotos(context, unchecked, { now });
  return { checked: unchecked.length, results };
}

/** "Ajukan" on a suggestion: this photo for this mission, from my own tap (even when my switch is off). 409 with the reason when it does not meet the mission. */
export async function submitSuggestion(context: MainWamContext, missionId: string, photoId: string, now = new Date()): Promise<DetectionResult> {
  await limitPerson("misi-ajukan", context.viewer.id, 30);
  const photo = await photoRecord(photoId).catch(() => null);
  if (!photo || photo.ownerId !== context.viewer.id) throw new ServiceError(404, "Foto tidak ditemukan.");
  const [result] = await detectPhotos(context, [liteOf(photo)], { now, only: missionId, force: true });
  if (!result) throw new ServiceError(409, "Foto ini belum memenuhi syarat misi.");
  if (result.outcome === "ditolak") throw new ServiceError(409, result.reason ?? "Foto ini belum memenuhi syarat misi.");
  return result;
}

/** "Abaikan" a suggestion: it is not offered again for this photo and mission. */
export async function dismissSuggestion(context: MainWamContext, missionId: string, photoId: string): Promise<void> {
  const photo = await photoRecord(photoId).catch(() => null);
  if (!photo || photo.ownerId !== context.viewer.id) throw new ServiceError(404, "Foto tidak ditemukan.");
  await recordDetection({ photoId, missionId, status: "mungkin", outcome: "diabaikan", completionId: null, reasons: [] });
}

/**
 * "Tarik": takes back a proof that was made from a Momen photo while nobody has decided. The completion goes (no
 * points were given); the photo stays; the pair is remembered so it is never sent again.
 */
export async function takeBack(context: MainWamContext, missionId: string): Promise<void> {
  const read = (columns: string) => db().from("mw_mission_completions").select(columns).eq("mission_id", missionId).eq("employee_id", context.viewer.id).maybeSingle();
  let { data, error } = await read(COMPLETION_COLUMNS);
  if (error && mwMissing(error as DbError)) ({ data, error } = await read(COMPLETION_COLUMNS_BASE));
  if (error) mwFail(error as DbError, MISSIONS_DETECT_MIGRATION);
  const completion = data ? completionFromRow(data as unknown as Record<string, unknown>) : null;
  if (!completion) throw new ServiceError(404, "Kiriman tidak ditemukan.");
  if (!isFromMomen(completion)) throw new ServiceError(409, "Kiriman ini dibuat dari kamera misi, jadi tidak bisa ditarik.");
  if (!TAKE_BACK_STATUSES.includes(completion.status)) throw new ServiceError(409, "Kiriman ini sudah diputuskan, jadi tidak bisa ditarik.");
  const removed = await db().from("mw_mission_completions").delete().eq("id", completion.id).eq("employee_id", context.viewer.id).in("status", [...TAKE_BACK_STATUSES]).select("id");
  if (removed.error) mwFail(removed.error as DbError, MISSIONS_DETECT_MIGRATION);
  if (!removed.data?.length) throw new ServiceError(409, "Kiriman ini sudah diputuskan, jadi tidak bisa ditarik.");
  const auto = completion.checkResult?.auto;
  if (auto) await recordDetection({ photoId: auto.photoId, missionId, status: auto.status, outcome: "ditarik", completionId: null, reasons: [] });
}

/** The person's switch (read with readAutoPref). */
export async function setAutoSwitch(context: MainWamContext, on: boolean): Promise<{ on: boolean; stored: boolean }> {
  await saveAutoPref(context.viewer.id, on);
  return { on, stored: true };
}

/** What detection did for one photo of mine, for the toast after sending: still looking (pending) or the results. */
export async function detectionOfPhoto(context: MainWamContext, photoId: string, now = new Date()): Promise<{ pending: boolean; items: FromPhoto[] }> {
  const photo = await photoRecord(photoId).catch(() => null);
  if (!photo || photo.ownerId !== context.viewer.id) throw new ServiceError(404, "Foto tidak ditemukan.");
  const [missions, settings, completions] = await Promise.all([allMissions(), missionSettings(), completionsOf(context.viewer.id)]);
  const items = missions.migrated ? missionItems(missions.data, completions.data, { sessions: [], settings, now }) : [];
  const [signals, rows] = await Promise.all([signalsOf([photoId]).catch(() => new Map<string, PhotoSignal>()), detectionsOf([photoId]).catch(() => [] as DetectionRow[])]);
  return { pending: !signals.get(photoId)?.checkedAt, items: fromPhotosOf(rows, items) };
}

/** Detection rows → the "Dari fotomu" list: a sent one is shown with where it stands, an offered one only while the mission can still be started. */
export function fromPhotosOf(rows: readonly DetectionRow[], items: readonly MissionItem[]): FromPhoto[] {
  const byMission = new Map(items.map(item => [item.id, item]));
  return rows.flatMap((row): FromPhoto[] => {
    const item = byMission.get(row.missionId);
    if (!item || (row.outcome !== "diajukan" && row.outcome !== "saran")) return [];
    if (row.outcome === "diajukan") {
      // The proof was taken back or replaced (the mission is open again): nothing to show.
      if (item.status === "todo") return [];
      return [{ photoId: row.photoId, missionId: item.id, title: item.title, points: item.points, outcome: "diajukan", status: row.status, state: item.status, canTakeBack: item.status === "pending" || item.status === "review" }];
    }
    if (!canStart(item)) return [];
    return [{ photoId: row.photoId, missionId: item.id, title: item.title, points: item.points, outcome: "saran", status: row.status, state: item.status, canTakeBack: false }];
  });
}

/** For the Misi page: my switch and my photos that meet a mission, newest first (at most 10). Quiet before the migration. */
export async function fromMyPhotos(context: MainWamContext, items: readonly MissionItem[]): Promise<{ auto: boolean; saved: boolean; list: FromPhoto[] }> {
  const pref = await readAutoPref(context.viewer.id).catch(() => ({ on: false, stored: false }));
  const { data, error } = await db().from("mw_photos").select("id").eq("owner_id", context.viewer.id).is("mission_id", null).order("created_at", { ascending: false }).limit(60);
  if (error || !data?.length) return { auto: pref.on, saved: pref.stored, list: [] };
  const rows = await detectionsOf((data as { id: string }[]).map(row => row.id)).catch(() => [] as DetectionRow[]);
  const order = new Map((data as { id: string }[]).map((row, index) => [row.id, index]));
  const sorted = [...rows].sort((a, b) => (order.get(a.photoId) ?? 99) - (order.get(b.photoId) ?? 99));
  return { auto: pref.on, saved: pref.stored, list: fromPhotosOf(sorted, items).slice(0, 10) };
}

/**
 * For the Momen camera: the people the person may tag, and whether any mission takes detection (then the camera offers
 * "Tandai lokasi" and listens for what was found). Never throws: the camera works without both.
 */
export async function cameraExtras(context: MainWamContext): Promise<{ candidates: TagCandidate[]; detect: boolean }> {
  const [pool, missions, settings] = await Promise.all([loadTagPool(context).catch(() => new Map<string, TagCandidate>()), allMissions().catch(() => null), missionSettings().catch(() => null)]);
  const aiVerifier = selectedProvider() !== "manual";
  const detect = !!missions?.migrated && !!settings && moduleAllows(context.viewer, "misi", context.settings.modules)
    && (missions.data.some(mission => mission.active && mission.kind === "foto" && autoModeOf({ ...mission, rules: effectiveRules(mission, settings.defaultRadiusM) }, aiVerifier) !== "mati")
      // Mode demo (no mission in the table): the sample missions stand in, so the camera shows the extras too (nothing is saved).
      || (!missions.data.length && await demoOn().catch(() => false)));
  return { candidates: [...pool.values()].sort((a, b) => a.name.localeCompare(b.name, "id")), detect };
}
