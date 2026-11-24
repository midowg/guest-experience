import { clock, shortDate, t, type Lang } from "@/lib/main-wam/i18n";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { effectiveRules, publicRules, ruleDisplays, timesOf, type PublicRule } from "./rules";
import type { MissionKind, MissionSettings, MwCompletion, MwMission } from "./types";
import { canResend } from "./verify";

/*
 * The missions as a participant sees them: which are still to do, which are done, which wait for an
 * admin, which have not opened or have closed; the words of their requirements; the filter and the
 * order of the Misi page; the one Beranda's card points at. Pure: tested without a server.
 */

/** todo: not sent; pending: sent, being checked; review: panitia must look; rejected: turned down; done: approved. */
export type MissionStatus = "todo" | "pending" | "review" | "rejected" | "done";
export type MissionAvailability = "buka" | "belum" | "tutup";

/** One mission for one person, JSON-safe (it travels to the browser). */
export type MissionItem = {
  id: string;
  title: string;
  description: string;
  kind: MissionKind;
  points: number;
  status: MissionStatus;
  availability: MissionAvailability;
  placeName: string;
  hasPlace: boolean;
  /** The radius that applies (the mission's own, else the default). */
  radiusM: number;
  sessionId: string | null;
  sessionTitle: string | null;
  credit: MwMission["credit"];
  review: boolean;
  opensAt: string | null;
  closesAt: string | null;
  /** Why a proof was turned down (the automatic checks or a reviewer), shown with "Kirim ulang". */
  rejectedNote: string;
  /** The TNC as the phone gets it (no coordinates): rules.ts. A photo mission always has some. */
  rules: PublicRule[];
  /** Proofs sent so far, and the limit (batas_kali; null = none). */
  attempts: number;
  maxAttempts: number | null;
};

export function availabilityOf(mission: Pick<MwMission, "opensAt" | "closesAt">, now: Date): MissionAvailability {
  if (mission.opensAt && Date.parse(mission.opensAt) > now.getTime()) return "belum";
  if (mission.closesAt && Date.parse(mission.closesAt) <= now.getTime()) return "tutup";
  return "buka";
}

const statusOf = (completion: Pick<MwCompletion, "status"> | undefined): MissionStatus => {
  if (!completion) return "todo";
  switch (completion.status) {
    case "disetujui": return "done";
    case "dikirim": case "diperiksa": return "pending";
    case "perlu_ditinjau": case "menunggu": return "review";
    case "ditolak": return "rejected";
  }
};

/** The active missions in the admin's order, each with this person's state. */
export function missionItems(
  missions: readonly MwMission[],
  completions: readonly (Pick<MwCompletion, "missionId" | "status" | "reviewNote"> & { attempts?: number })[],
  context: { sessions: readonly Pick<MwSession, "id" | "title">[]; settings: Pick<MissionSettings, "defaultRadiusM">; now: Date },
): MissionItem[] {
  const byMission = new Map(completions.map(completion => [completion.missionId, completion]));
  const sessions = new Map(context.sessions.map(session => [session.id, session.title]));
  return missions
    .filter(mission => mission.active)
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "id"))
    .map(mission => {
      const completion = byMission.get(mission.id);
      const rules = effectiveRules(mission, context.settings.defaultRadiusM);
      return {
        id: mission.id, title: mission.title, description: mission.description, kind: mission.kind, points: mission.points,
        status: statusOf(completion), availability: availabilityOf(mission, context.now),
        placeName: mission.placeName, hasPlace: mission.latitude !== null && mission.longitude !== null, radiusM: mission.radiusM ?? context.settings.defaultRadiusM,
        sessionId: mission.sessionId, sessionTitle: mission.sessionId ? sessions.get(mission.sessionId) ?? null : null,
        credit: mission.credit, review: mission.review, opensAt: mission.opensAt, closesAt: mission.closesAt,
        rejectedNote: completion?.status === "ditolak" ? completion.reviewNote : "",
        rules: mission.kind === "foto" ? publicRules(rules) : [], attempts: completion?.attempts ?? (completion ? 1 : 0), maxAttempts: timesOf(rules),
      };
    });
}

export type MissionSummary = { total: number; done: number; pending: number; availablePoints: number; earnedPoints: number };
export function summarize(items: readonly MissionItem[]): MissionSummary {
  const done = items.filter(item => item.status === "done");
  const open = items.filter(item => item.status !== "done" && item.availability !== "tutup");
  return {
    total: items.length, done: done.length, pending: items.filter(item => item.status === "pending" || item.status === "review").length,
    availablePoints: open.reduce((sum, item) => sum + item.points, 0), earnedPoints: done.reduce((sum, item) => sum + item.points, 0),
  };
}

/** A mission photo someone tagged me in (the Misi page lists it with "Lepas tag"). */
export type TaggedIn = { photoId: string; byName: string; /** Empty: a regular Momen photo, not one made for a mission. */ missionTitle: string };

/**
 * A photo of mine that meets a mission, found by detection (detect.ts): "diajukan" = sent by itself (it can be taken back
 * while nobody has decided), "saran" = only offered (the person taps Ajukan). `state` is where the mission stands for me now.
 */
export type FromPhoto = {
  photoId: string;
  missionId: string;
  title: string;
  points: number;
  outcome: "diajukan" | "saran";
  status: "cocok" | "mungkin";
  state: MissionStatus;
  canTakeBack: boolean;
  /** Mode demo only: the picture to show (an SVG), since a demo photo is not in storage. */
  thumb?: string;
};

/** What the Beranda card and the Misi page get (JSON-safe, nothing about where a mission is or who else did it). */
export type MisiView = {
  migrated: boolean;
  /** Mode demo's sample stands in: nothing can be saved. */
  sample: boolean;
  items: MissionItem[];
  summary: MissionSummary;
  /** The person's points: the ledger's sum, manual rows too. */
  points: number;
  place: { rank: number; of: number } | null;
  leaderboardOpen: boolean;
  /** Photos I am tagged in (still on). */
  taggedIn: TaggedIn[];
  /** "Dari fotomu": my Momen photos that meet a mission (sent or offered). Absent before detection exists. */
  fromPhotos?: FromPhoto[];
  /** My switch "Deteksi misi otomatis" (default on); false = only suggestions. */
  autoDetect?: boolean;
  /** The switch can be saved (the migration has run); false = suggestions only until then. */
  autoDetectSaved?: boolean;
};

export const MISSION_FILTERS = ["all", "todo", "done"] as const;
export type MissionFilter = (typeof MISSION_FILTERS)[number];
export const MISSION_SORTS = ["desc", "asc"] as const;
export type MissionSort = (typeof MISSION_SORTS)[number];

/** "Belum" = everything not done (waiting for approval and turned down too); "Berhasil" = done. */
export const filterItems = (items: readonly MissionItem[], filter: MissionFilter): MissionItem[] =>
  items.filter(item => (filter === "all" ? true : filter === "done" ? item.status === "done" : item.status !== "done"));

/** By points, the admin's order kept for equal points (the sort is stable). */
export const sortItems = (items: readonly MissionItem[], sort: MissionSort): MissionItem[] =>
  [...items].sort((a, b) => (sort === "desc" ? b.points - a.points : a.points - b.points));

/**
 * The three groups of the page: "Belum" (not sent, or turned down), "Menunggu" (sent: being checked or
 * waiting for panitia) and "Selesai" (approved).
 */
export function sections(items: readonly MissionItem[], filter: MissionFilter, sort: MissionSort): { todo: MissionItem[]; waiting: MissionItem[]; done: MissionItem[] } {
  const shown = sortItems(filterItems(items, filter), sort);
  const waits = (item: MissionItem) => item.status === "pending" || item.status === "review";
  return { todo: shown.filter(item => item.status !== "done" && !waits(item)), waiting: shown.filter(waits), done: shown.filter(item => item.status === "done") };
}

/** Can the person start it now from the app (a sesi mission is done at its session, not here)? */
export const canStart = (item: Pick<MissionItem, "status" | "availability" | "attempts" | "maxAttempts">) =>
  (item.status === "todo" || (item.status === "rejected" && canResend("ditolak", item.attempts, item.maxAttempts))) && item.availability === "buka";

/* ── Words ────────────────────────────────────────────────────────────────────────────────────── */

export type RequirementIcon = "camera" | "map-pin" | "users" | "clock" | "shield-check" | "tag" | "pose" | "repeat";
export type Requirement = { icon: RequirementIcon; title: string; note?: string };

/** The short chips under a mission's title ("Foto langsung", "Lokasi aktif"). */
export function chipsOf(item: Pick<MissionItem, "kind"> & { rules?: readonly PublicRule[] }, lang: Lang = "id"): Requirement[] {
  if (item.kind === "foto" && item.rules?.length) return ruleDisplays(item.rules, lang).flatMap(rule => rule.chips.map(title => ({ icon: rule.icon, title })));
  if (item.kind === "foto") return [{ icon: "camera", title: t(lang, "misi.req.photo") }, { icon: "map-pin", title: t(lang, "misi.req.location") }];
  if (item.kind === "checkin") return [{ icon: "map-pin", title: t(lang, "misi.req.checkin") }];
  return [{ icon: "users", title: t(lang, "misi.req.session") }];
}

/** When, in short: "Sel, 5 Jan 21.00". */
export const whenOf = (iso: string, lang: Lang = "id") => `${shortDate(lang, wibDate(iso))} ${clock(lang, wibTime(iso))}`;

/** "Syarat dapat poin": what the mission asks, in order (the sheet shows it). */
export function rulesOf(item: MissionItem, lang: Lang = "id"): Requirement[] {
  if (item.kind === "foto" && item.rules.length) return ruleDisplays(item.rules, lang).map(rule => ({ icon: rule.icon, title: rule.title, ...(rule.note ? { note: rule.note } : {}) }));
  const place = item.placeName || t(lang, "misi.place.generic");
  const out: Requirement[] = [];
  if (item.kind === "foto") {
    out.push({ icon: "camera", title: t(lang, "misi.rule.photo.title"), note: t(lang, "misi.rule.photo.note") });
    out.push(item.hasPlace
      ? { icon: "map-pin", title: t(lang, "misi.rule.place.title"), note: t(lang, "misi.rule.place.photoNote", { radius: item.radiusM, place }) }
      : { icon: "map-pin", title: t(lang, "misi.rule.location.title"), note: t(lang, "misi.rule.location.note") });
  } else if (item.kind === "checkin") {
    out.push({ icon: "map-pin", title: t(lang, "misi.rule.place.title"), note: t(lang, "misi.rule.place.checkinNote", { radius: item.radiusM, place }) });
  } else {
    out.push({
      icon: "users",
      title: item.sessionTitle ? t(lang, "misi.rule.session.title", { session: item.sessionTitle }) : t(lang, "misi.rule.session.titleAny"),
      note: t(lang, item.credit === "absen" ? "misi.rule.session.absen" : "misi.rule.session.panitia"),
    });
  }
  if (item.review) out.push({ icon: "shield-check", title: t(lang, "misi.rule.review.title"), note: t(lang, "misi.rule.review.note") });
  const once = t(lang, item.kind === "foto" ? "misi.rule.once.photo" : item.kind === "checkin" ? "misi.rule.once.checkin" : "misi.rule.once.session");
  if (item.closesAt) out.push({ icon: "clock", title: t(lang, "misi.rule.window.until", { when: whenOf(item.closesAt, lang) }), note: `${t(lang, "misi.rule.once.title")} · ${once}` });
  else if (item.opensAt && item.availability === "belum") out.push({ icon: "clock", title: t(lang, "misi.rule.window.from", { when: whenOf(item.opensAt, lang) }), note: `${t(lang, "misi.rule.once.title")} · ${once}` });
  else out.push({ icon: "clock", title: t(lang, "misi.rule.once.title"), note: once });
  return out;
}

/**
 * A department as a short label for the Peringkat ("Sales & Marketing" → "SM", "Center of Excellence" → "CoE",
 * "HRGA" stays). A name that is already short, one word, is kept as it is.
 */
export function abbreviateDepartment(name: string): string {
  const clean = name.trim();
  if (!clean) return "";
  const words = clean.split(/\s+/).filter(word => !/^(&|dan|and|\/|-)$/i.test(word));
  if (words.length <= 1) return clean.length <= 8 ? clean : clean.slice(0, 4).toUpperCase();
  return words.map(word => (/^[a-z]/.test(word) ? word[0] : word[0].toUpperCase())).join("").slice(0, 5);
}
