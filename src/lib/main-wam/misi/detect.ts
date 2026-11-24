import { judgePosition, validLatLng } from "./geo";
import { availabilityOf } from "./missions";
import { checkRules, effectiveRules, tagRuleOf, timesOf, type MissionRule, type RuleCheck, type RuleType, type TagCandidate } from "./rules";
import { AUTO_DETECT_MODES, type AutoDetectMode, type MwCompletion, type MwMission } from "./types";
import { canResend } from "./verify";

/*
 * Mission detection from a Momen photo (docs/main-wam/KONTRAK.md §13, "Deteksi otomatis dari Momen").
 * A Momen photo that happens to meet a photo mission's rules is recognised and offered for that mission.
 * Pure and deterministic: the same photo, missions and completions always give the same answer, and the
 * rules are the ones the mission camera already uses (rules.ts checkRules, geo.ts judgePosition), never a
 * copy. What cannot be known from the data (no location, a pose or an object) is never guessed:
 *   cocok    every rule the server can check holds, and the mission has real evidence to check (a place
 *            or a required tag); only the pose or object, if any, is left to the verifier;
 *   mungkin  nothing is broken, but a rule could not be checked (no location was shared) or there is no
 *            evidence to check at all (a pose-only mission): a person must look;
 *   tidak    a rule is broken, or the mission cannot take a proof now (done, waiting, closed, no tries left,
 *            detection off, not a photo mission).
 */

/** mati: never from Momen; cocok: only a sure match is sent by itself; mungkin: a doubtful one is sent too (it waits for a person). */
export { AUTO_DETECT_MODES };
export type { AutoDetectMode };

/** The rules that are evidence a server can check without AI: a place, or friends that must be tagged. */
export const hasEvidenceRules = (rules: readonly MissionRule[]) => rules.some(rule => rule.type === "lokasi" || (rule.type === "tag" && rule.required));

/**
 * The mode of a mission: the admin's choice, else by default on for a photo mission whose rules give evidence
 * (a place or a required tag) and off for one that rests on a pose or an object alone, unless a real AI
 * verifier is plugged in (`aiVerifier`), so the review queue never floods.
 */
export function autoModeOf(mission: Pick<MwMission, "kind" | "autoDetect"> & { rules: readonly MissionRule[] }, aiVerifier = false): AutoDetectMode {
  if (mission.kind !== "foto") return "mati";
  if (mission.autoDetect) return mission.autoDetect;
  return hasEvidenceRules(mission.rules) || aiVerifier ? "cocok" : "mati";
}

/** What is known about a Momen photo. The position is the phone's, kept only for this (never shown to anyone). */
export type PhotoFacts = {
  photoId: string;
  takenAt: string;
  /** From the app's camera (a gallery picture is not "foto langsung"). */
  live: boolean;
  geo: { latitude: number; longitude: number; accuracy: number | null } | null;
  /** People tagged and still on the photo, as the tag pool knows them. */
  tags: readonly TagCandidate[];
};

export type DetectStatus = "cocok" | "mungkin" | "tidak";

export type Candidate = {
  missionId: string;
  status: DetectStatus;
  mode: AutoDetectMode;
  /** Short Indonesian lines of what held (shown to the reviewer: "Alasan deteksi"). */
  passed: string[];
  /** Short lines of what could not be checked (no location, the pose). */
  unknown: string[];
  /** Why not (status "tidak"). */
  reasons: string[];
  /** The server may send it by itself (the mode allows this status); the person's own switch still decides. */
  autoSubmit: boolean;
  /** Worth showing as a suggestion (not "tidak", detection not off). */
  suggest: boolean;
  /** The tags that count for the mission (the photo may carry more); kept for the proof. */
  counted: string[];
  /** How far from the mission's point, when the position was known (the reviewer reads it; never shown to participants). */
  distanceM: number | null;
  /** Every rule against the photo (kept with the proof, as the mission camera keeps them). */
  checks: RuleCheck[];
};

export type DetectInput = {
  missions: readonly MwMission[];
  completions: readonly Pick<MwCompletion, "missionId" | "status" | "attempts">[];
  photo: PhotoFacts;
  submitter: { id: string; department: string };
  settings: { defaultRadiusM: number; maxAccuracyM: number };
  /** Now: a mission closed by now cannot take the photo. */
  now: Date;
  /** A real AI verifier is plugged in (verifier.ts): pose-only missions may then be detected. */
  aiVerifier?: boolean;
};

/** The tags of a photo that count for a tag rule: the photo may carry more people than the rule asks. */
export function countedTags(rule: Extract<MissionRule, { type: "tag" }>, tags: readonly TagCandidate[], submitter: { id: string; department: string }): TagCandidate[] {
  const unique = [...new Map(tags.map(tag => [tag.id, tag] as const)).values()].filter(tag => tag.id !== submitter.id);
  const take = (test: (tag: TagCandidate) => boolean) => unique.filter(test).slice(0, rule.count);
  switch (rule.relation) {
    case "bod": return take(tag => tag.bod);
    case "sebangku": return take(tag => tag.seatmate);
    case "sekamar": return take(tag => tag.roommate);
    case "departemen_lain": {
      const mine = submitter.department.trim().toLowerCase();
      const seen = new Set<string>();
      return unique.filter(tag => {
        const department = tag.department.trim().toLowerCase();
        if (!department || department === mine || seen.has(department)) return false;
        seen.add(department);
        return true;
      }).slice(0, rule.count);
    }
    case "siapa_saja": return unique.slice(0, rule.count);
  }
}

const RULE_WORDS: Record<RuleType, string> = {
  foto_langsung: "Foto dari kamera aplikasi", lokasi: "Lokasi di area misi", tag: "Teman yang ditandai sesuai syarat", pose: "Pose atau objek di foto", waktu: "Waktu foto dalam jam misi", batas_kali: "Batas kirim belum tercapai",
};

/** Why a mission cannot take a proof now, or null. */
function blocked(mission: MwMission, completion: Pick<MwCompletion, "status" | "attempts"> | undefined, rules: readonly MissionRule[], now: Date): string | null {
  const availability = availabilityOf(mission, now);
  if (availability === "belum") return "Misi ini belum dibuka.";
  if (availability === "tutup") return "Misi ini sudah ditutup.";
  if (!completion) return null;
  if (completion.status === "disetujui") return "Misi ini sudah selesai.";
  if (completion.status !== "ditolak") return "Misi ini sudah punya kiriman yang sedang ditinjau.";
  return canResend("ditolak", completion.attempts, timesOf(rules)) ? null : "Batas kirim misi ini sudah tercapai.";
}

/** One mission against one photo. */
export function detectMission(mission: MwMission, input: DetectInput): Candidate {
  const rules = effectiveRules(mission, input.settings.defaultRadiusM);
  const mode = autoModeOf({ ...mission, rules }, input.aiVerifier);
  const none = (reason: string): Candidate => ({ missionId: mission.id, status: "tidak", mode, passed: [], unknown: [], reasons: [reason], autoSubmit: false, suggest: false, counted: [], distanceM: null, checks: [] });
  if (mission.kind !== "foto") return none("Hanya misi foto yang bisa dideteksi dari Momen.");
  if (!mission.active) return none("Misi ini belum aktif.");
  if (mode === "mati") return none("Deteksi otomatis dari Momen mati untuk misi ini.");
  const completion = input.completions.find(item => item.missionId === mission.id);
  const stop = blocked(mission, completion, rules, input.now);
  if (stop) return none(stop);

  const { photo, submitter } = input;
  const place = rules.find((rule): rule is Extract<MissionRule, { type: "lokasi" }> => rule.type === "lokasi") ?? null;
  // Where the photo was taken: judged by the same function as the mission camera. A fix too coarse to say, or none, is "not known", not "not there".
  let inside: boolean | null = null;
  let distanceM: number | null = null;
  if (place && photo.geo && validLatLng(photo.geo)) {
    const verdict = judgePosition({ fix: { latitude: photo.geo.latitude, longitude: photo.geo.longitude, accuracy: photo.geo.accuracy, at: null }, target: place, radiusM: place.radiusM, maxAccuracyM: input.settings.maxAccuracyM, now: input.now });
    distanceM = verdict.distanceM;
    if (verdict.ok) inside = true;
    else if (verdict.reason === "terlalu-jauh") inside = false;
  }
  const tagRule = tagRuleOf(rules);
  const counted = tagRule ? countedTags(tagRule, photo.tags, submitter) : [];
  const taken = new Date(photo.takenAt);
  const { checks, reasons } = checkRules(rules, {
    now: Number.isFinite(taken.getTime()) ? taken : input.now, inside, tags: counted, submitter, previous: completion?.attempts ?? 0, live: photo.live,
  });
  if (reasons.length) return { ...none(reasons[0]), reasons, distanceM, checks };

  const passed: string[] = [];
  const unknown: string[] = [];
  for (const check of checks) {
    if (check.type === "pose") unknown.push(`${RULE_WORDS.pose}: dinilai pemeriksa`);
    else if (check.ok === true) {
      if (check.type === "lokasi" && place) passed.push(`Foto diambil di ${place.name || "lokasi misi"} (dalam radius ${place.radiusM} m)`);
      else if (check.type === "tag") { if (counted.length) passed.push(`Teman ditandai sesuai syarat: ${counted.map(tag => tag.name).join(", ")}`); }
      else passed.push(RULE_WORDS[check.type]);
    } else if (check.type === "lokasi") unknown.push(photo.geo ? "Lokasi foto kurang teliti untuk dipastikan" : "Lokasi foto tidak dibagikan, jadi belum bisa dicek");
    else unknown.push(RULE_WORDS[check.type]);
  }
  const placeKnown = !place || inside === true;
  const evidence = hasEvidenceRules(rules) || !!input.aiVerifier;
  const status: DetectStatus = placeKnown && evidence ? "cocok" : "mungkin";
  if (!evidence) unknown.push("Misi ini hanya bergantung pada pose atau objek: perlu dilihat pemeriksa");
  const autoSubmit = status === "cocok" || mode === "mungkin";
  return { missionId: mission.id, status, mode, passed, unknown, reasons: [], autoSubmit, suggest: true, counted: counted.map(tag => tag.id), distanceM, checks };
}

/** Every active photo mission against one photo; the order of the missions is kept. */
export function detectForPhoto(input: DetectInput): Candidate[] {
  return input.missions.filter(mission => mission.active && mission.kind === "foto").map(mission => detectMission(mission, input));
}

/** What to do with a candidate, given the person's own switch (default on) and what happened to it before. */
export type Action = "ajukan" | "saran" | "lewati";
export function actionFor(candidate: Pick<Candidate, "status" | "autoSubmit" | "suggest">, input: { personAuto: boolean; before: "diajukan" | "saran" | "ditarik" | "diabaikan" | null }): Action {
  if (candidate.status === "tidak" || !candidate.suggest) return "lewati";
  // The person took it back or waved it off: never again for this photo and mission. A suggestion already shown is not shown twice.
  if (input.before === "ditarik" || input.before === "diabaikan" || input.before === "diajukan" || input.before === "saran") return "lewati";
  return candidate.autoSubmit && input.personAuto ? "ajukan" : "saran";
}

/** The message for the person about a candidate, as plain data (the words live in the dictionary). */
export function detectionLines(candidate: Pick<Candidate, "passed" | "unknown">): string[] {
  return [...candidate.passed, ...candidate.unknown];
}
