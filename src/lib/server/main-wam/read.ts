import "server-only";
import { cache } from "react";
import {
  ACTIVITY_GROUP_COLUMNS, activityGroupFromRow, AWARD_COLUMNS, awardFromRow, GROUP_COLUMNS, groupFromRow, GUIDE_COLUMNS, guideFromRow, PHOTO_COLUMNS, photoFromRow,
  RUNDOWN_LOG_COLUMNS, rundownChangeFromRow, SESSION_COLUMNS, sessionFromRow, SILENT_COLUMNS, silentFromRow, TRIP_COLUMNS, TRIP_SEAT_COLUMNS, tripFromRow, tripSeatFromRow,
} from "@/lib/main-wam/rows";
import type { SilentResult } from "@/lib/main-wam/module-state";
import { byStart } from "@/lib/main-wam/rundown";
import type {
  MwActivityGroup, MwAttendance, MwAwardApproval, MwAwardCategory, MwGroup, MwGuide, MwPhoto, MwSession, MwSilentQuestion, MwTrip, MwTripSeat, RundownChange, TripDirection,
} from "@/lib/main-wam/types";
import { MAIN_WAM_MODULES_MIGRATION, MAIN_WAM_MOMEN_MIGRATION } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { mwMissing, mwWaiting, type DbError, type Read } from "./errors";

/*
 * Fondasi's basic readers, one per entity (docs/main-wam/KONTRAK.md §4): plain reads with the
 * migration fallback (`migrated: false` and empty data before it runs). They do not check who
 * asks: the caller has passed the gate (gate.ts) and decides what the person may see. Areas build
 * their own queries on top in their own folder (src/lib/server/main-wam/<area>/).
 */

const db = () => createPrivilegedClient();
/** Before the migration: empty and `migrated: false`; any other failure throws. */
function settle<T>(error: DbError | null, empty: T): Read<T> | null {
  if (!error) return null;
  if (mwMissing(error)) return { data: empty, migrated: false };
  return databaseError({ message: error.message ?? "", code: error.code });
}
const notConfigured = <T>(empty: T): Read<T> | null => (isSupabaseConfigured() ? null : { data: empty, migrated: false });

/* ── Rundown ──────────────────────────────────────────────────────────────────────────────────── */

/** Every session (drafts and cancelled too: the caller filters for participants), in order. */
async function allSessionsUncached(): Promise<Read<MwSession[]>> {
  const early = notConfigured<MwSession[]>([]);
  if (early) return early;
  const { data, error } = await db().from("mw_sessions").select(SESSION_COLUMNS).order("starts_at").order("sort").limit(500);
  return settle(error, [] as MwSession[]) ?? { data: (data ?? []).map(row => sessionFromRow(row)).sort(byStart), migrated: true };
}
export const allSessions = cache(allSessionsUncached);

/** What participants see: published and cancelled (cancelled are shown struck through), never drafts. */
export async function shownSessions(): Promise<Read<MwSession[]>> {
  const { data, migrated } = await allSessions();
  return { data: data.filter(session => session.status !== "draf"), migrated };
}

/** One session by id, any status (null when there is none, or before the migration). */
export async function sessionById(id: string): Promise<MwSession | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await allSessions();
  return data.find(session => session.id === id) ?? null;
}

/** Riwayat perubahan: of one session, or the latest of all (newest first). */
export async function rundownLog(sessionId?: string, limit = 50): Promise<Read<RundownChange[]>> {
  let query = db().from("mw_rundown_log").select(RUNDOWN_LOG_COLUMNS).order("changed_at", { ascending: false }).limit(limit);
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  return settle(error, [] as RundownChange[]) ?? { data: (data ?? []).map(row => rundownChangeFromRow(row)), migrated: true };
}

/** Check-ins: of one person (all sessions), or of one session (everyone). */
export async function attendanceOf(filter: { employeeId?: string; sessionId?: string }): Promise<Read<MwAttendance[]>> {
  let query = db().from("mw_attendance").select("session_id,employee_id,checked_in_at,method,recorded_by").limit(5000);
  if (filter.employeeId) query = query.eq("employee_id", filter.employeeId);
  if (filter.sessionId) query = query.eq("session_id", filter.sessionId);
  const { data, error } = await query;
  return settle(error, [] as MwAttendance[]) ?? {
    migrated: true,
    data: (data ?? []).map(row => ({ sessionId: row.session_id, employeeId: row.employee_id, checkedInAt: row.checked_in_at, method: row.method === "manual" ? "manual" : "qr", recordedBy: row.recorded_by ?? null })),
  };
}

/* ── Kelompok ─────────────────────────────────────────────────────────────────────────────────── */

async function listGroupsUncached(): Promise<Read<MwGroup[]>> {
  const early = notConfigured<MwGroup[]>([]);
  if (early) return early;
  const { data, error } = await db().from("mw_groups").select(GROUP_COLUMNS).order("sort").order("number").limit(200);
  return settle(error, [] as MwGroup[]) ?? { data: (data ?? []).map(row => groupFromRow(row as Record<string, unknown>)), migrated: true };
}
/** Every kelompok with its members (the caller checks settings.groupsPublished for participants). */
export const listGroups = cache(listGroupsUncached);

/** Kelompok kegiatan: of one session, or the ones a person is in (every session). */
export async function activityGroups(filter: { sessionId?: string; employeeId?: string }): Promise<Read<MwActivityGroup[]>> {
  if (filter.employeeId) {
    const { data: mine, error } = await db().from("mw_activity_group_members").select("activity_group_id").eq("employee_id", filter.employeeId).limit(100);
    const early = settle(error, [] as MwActivityGroup[]);
    if (early) return early;
    const ids = (mine ?? []).map(row => row.activity_group_id as string);
    if (!ids.length) return { data: [], migrated: true };
    const { data, error: groupError } = await db().from("mw_activity_groups").select(ACTIVITY_GROUP_COLUMNS).in("id", ids).order("sort");
    return settle(groupError, [] as MwActivityGroup[]) ?? { data: (data ?? []).map(row => activityGroupFromRow(row as Record<string, unknown>)), migrated: true };
  }
  let query = db().from("mw_activity_groups").select(ACTIVITY_GROUP_COLUMNS).order("sort").order("label").limit(500);
  if (filter.sessionId) query = query.eq("session_id", filter.sessionId);
  const { data, error } = await query;
  return settle(error, [] as MwActivityGroup[]) ?? { data: (data ?? []).map(row => activityGroupFromRow(row as Record<string, unknown>)), migrated: true };
}

/* ── Perjalanan ───────────────────────────────────────────────────────────────────────────────── */

async function listTripsUncached(direction: TripDirection | "beide"): Promise<Read<MwTrip[]>> {
  let query = db().from("mw_trips").select(TRIP_COLUMNS).order("sort").order("starts_at").limit(200);
  if (direction !== "beide") query = query.eq("direction", direction);
  const { data, error } = await query;
  return settle(error, [] as MwTrip[]) ?? { data: (data ?? []).map(row => tripFromRow(row)), migrated: true };
}
const listTripsCached = cache(listTripsUncached);
/** The steps there (berangkat) or back (pulang), or both, in order. */
export const listTrips = (direction?: TripDirection) => listTripsCached(direction ?? "beide");

/** A person's seats and vehicles, every step. */
export const seatsOf = cache(async (employeeId: string): Promise<Read<MwTripSeat[]>> => {
  const { data, error } = await db().from("mw_trip_seats").select(TRIP_SEAT_COLUMNS).eq("employee_id", employeeId).limit(100);
  return settle(error, [] as MwTripSeat[]) ?? { data: (data ?? []).map(row => tripSeatFromRow(row)), migrated: true };
});

/* ── Panduan ──────────────────────────────────────────────────────────────────────────────────── */

async function listGuidesUncached(all: boolean): Promise<Read<MwGuide[]>> {
  let query = db().from("mw_guides").select(GUIDE_COLUMNS).order("sort").order("title").limit(100);
  if (!all) query = query.eq("published", true);
  const { data, error } = await query;
  return settle(error, [] as MwGuide[]) ?? { data: (data ?? []).map(row => guideFromRow(row)), migrated: true };
}
const listGuidesCached = cache(listGuidesUncached);
/** The guides, published only unless `all` (Admin WAM). */
export const listGuides = (all = false) => listGuidesCached(all);

/** One published guide by its address (null when there is none). */
export async function guideBySlug(slug: string): Promise<MwGuide | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const { data, error } = await db().from("mw_guides").select(GUIDE_COLUMNS).eq("slug", slug).eq("published", true).maybeSingle();
  if (error) { if (mwMissing(error)) return null; databaseError(error); }
  return data ? guideFromRow(data) : null;
}

/** A guide's file key, for the file route (published only). */
export async function guideFileKey(id: string): Promise<{ key: string; mime: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("mw_guides").select("file_key,file_mime").eq("id", id).eq("published", true).maybeSingle();
  if (error || !data?.file_key) return null;
  return { key: data.file_key, mime: data.file_mime ?? "application/pdf" };
}

/* ── Momen ────────────────────────────────────────────────────────────────────────────────────── */

/** One photo's row (any status; null when there is none). */
export async function photoById(id: string): Promise<MwPhoto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("mw_photos").select(PHOTO_COLUMNS).eq("id", id).maybeSingle();
  if (error) { if (mwMissing(error)) return null; databaseError(error); }
  return data ? photoFromRow(data) : null;
}

/** How many photos for everyone are shown since an instant (Beranda's "12 foto baru"). */
export async function photosForEveryoneSince(since: string): Promise<Read<number>> {
  const { count, error } = await db().from("mw_photos").select("id", { count: "exact", head: true }).eq("status", "tampil").eq("audience", "semua").gt("visible_at", since).lte("visible_at", new Date().toISOString());
  return settle(error, 0) ?? { data: count ?? 0, migrated: true };
}

/** Writers of Momen before its migration. */
export const momenWaiting = () => mwWaiting(MAIN_WAM_MOMEN_MIGRATION);

/* ── Modul ────────────────────────────────────────────────────────────────────────────────────── */

async function awardCategoriesUncached(all: boolean): Promise<Read<MwAwardCategory[]>> {
  let query = db().from("mw_award_categories").select(AWARD_COLUMNS).order("sort").order("title").limit(50);
  if (!all) query = query.eq("published", true);
  const { data, error } = await query;
  return settle(error, [] as MwAwardCategory[]) ?? { data: (data ?? []).map(row => awardFromRow(row as Record<string, unknown>)), migrated: true };
}
const awardCategoriesCached = cache(awardCategoriesUncached);
/** Award categories with their nominees, published only unless `all`; once per request (Beranda panitia asks twice). */
export const awardCategories = (all = false) => awardCategoriesCached(all);

/** The BOD's approvals, by category. */
export const awardApprovals = cache(async (): Promise<Read<MwAwardApproval[]>> => {
  const { data, error } = await db().from("mw_award_approvals").select("category_id,nominee_id,approved_by,approved_at").limit(50);
  return settle(error, [] as MwAwardApproval[]) ?? {
    data: (data ?? []).map(row => ({ categoryId: row.category_id, nomineeId: row.nominee_id, approvedBy: row.approved_by ?? "", approvedAt: row.approved_at })), migrated: true,
  };
});

/** The categories a person has voted in (no nominee: a vote is secret, the person sees their own through D's API). */
export const votedCategories = cache(async (employeeId: string): Promise<Read<Set<string>>> => {
  const { data, error } = await db().from("mw_award_votes").select("category_id").eq("voter_id", employeeId).limit(50);
  return settle(error, new Set<string>()) ?? { data: new Set((data ?? []).map(row => row.category_id as string)), migrated: true };
});

/** Every Silent Meeting question (one per session); once per request. */
export const silentQuestions = cache(async (): Promise<Read<MwSilentQuestion[]>> => {
  const { data, error } = await db().from("mw_silent_questions").select(SILENT_COLUMNS).limit(50);
  return settle(error, [] as MwSilentQuestion[]) ?? { data: (data ?? []).map(row => silentFromRow(row)), migrated: true };
});

/**
 * The counts of every Silent Meeting closed for good (question id → feedbacks, openers), by
 * mw_silent_results, which first finalizes any that closed since (shuffle, counts kept). There is
 * never a count of an open one (audit H2): show a number only through silentShownCount.
 */
export const silentResults = cache(async (): Promise<Read<Map<string, SilentResult>>> => {
  const { data, error } = await db().rpc("mw_silent_results");
  return settle(error, new Map<string, SilentResult>()) ?? {
    data: new Map(((data ?? []) as { question_id: string; feedback_count: number; opener_count: number }[]).map(row => [row.question_id, { feedback: row.feedback_count, openers: row.opener_count }])),
    migrated: true,
  };
});

/** Writers of the modules before their migration. */
export const modulesWaiting = () => mwWaiting(MAIN_WAM_MODULES_MIGRATION);
