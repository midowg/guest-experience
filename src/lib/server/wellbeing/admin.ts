import "server-only";
import { randomUUID } from "node:crypto";
import { DIMENSIONS, defaultSettings, monthRange, previousMonth, rank, wibToday, type CatalogItemInput, type DimensionId, type PointBatchInput, type ReviewInput } from "@/lib/wellbeing/rules";
import type { WbActivity, WbActivityPage, WbBatchResult, WbCatalog, WbCatalogItem, WbChampion, WbOverview, WbPeople, WbPersonDetail, WbPointEntry, WbSettingsView } from "@/lib/wellbeing/types";
import { currentAdmin } from "../admin-actor";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { afterCursor, cursorOf, missing, readTotals, waiting, withPhotoUrls, type Totals } from "./shared";

/*
 * Admin Wellbeing's data (16 Nov 2026, migration 202611160050). Every read answers `migrated: false`
 * with empty data until the owner applies the migration, so the screens show a waiting notice
 * instead of an error; every write says it waits for the migration.
 */

type Row = Record<string, unknown>;
export type Actor = { name: string; employeeId?: string };

/** Who is acting, for "diperiksa oleh" and "ditambah oleh". */
export async function wellbeingActor(): Promise<Actor> {
  const actor = await currentAdmin();
  return { name: actor?.kind === "super" ? "Super admin" : actor?.name || "Admin", employeeId: actor?.kind === "person" ? actor.employeeId : undefined };
}

const fail = (error: { code?: string; message: string }): never => { if (missing(error)) throw waiting(); return databaseError(error); };
const zeroDims = (): Record<DimensionId, number> => ({ physical: 0, emotional: 0, social: 0, financial: 0, spiritual: 0 });
const db = () => createPrivilegedClient();

const ACTIVITY_COLUMNS = "id,employee_id,type_code,dimension_id,happened_on,source,title,steps,kcal,minutes,distance_m,note,photos,points_claimed,points,status,review_reason,checked,reviewed_by_name,reviewed_at,created_at,"
  + "type:wb_activity_types(name,kind),person:employees!wb_activities_employee_id_fkey(full_name,nickname,department)";

/** Mapped as stored; the list functions then make the photos ready to show (signPhotos). */
function toActivity(row: Row): WbActivity {
  const type = (row.type ?? {}) as Row, person = (row.person ?? {}) as Row;
  return {
    id: row.id as string, employeeId: row.employee_id as string,
    employeeName: (person.full_name as string) ?? "", employeeNickname: (person.nickname as string) ?? "", department: (person.department as string) ?? "",
    typeCode: row.type_code as string, typeName: (type.name as string) ?? (row.type_code as string), kind: (type.kind as "daily" | "sport") ?? "daily",
    dimension: row.dimension_id as DimensionId, date: row.happened_on as string, source: row.source as WbActivity["source"], title: (row.title as string) ?? "",
    steps: (row.steps as number | null) ?? null, kcal: (row.kcal as number | null) ?? null, minutes: (row.minutes as number | null) ?? null, distanceM: (row.distance_m as number | null) ?? null,
    note: (row.note as string) ?? "", photos: (row.photos as string[]) ?? [], pointsClaimed: row.points_claimed as number, points: row.points as number,
    status: row.status as WbActivity["status"], reason: (row.review_reason as string | null) ?? null, checked: row.checked as boolean,
    reviewedBy: (row.reviewed_by_name as string | null) ?? null, reviewedAt: (row.reviewed_at as string | null) ?? null, createdAt: row.created_at as string,
  };
}

/** Proof photos ready to show; a key that cannot be signed stays as it is (Periksa shows "Foto belum bisa ditampilkan"). */
const signPhotos = (items: WbActivity[]) => withPhotoUrls(items, { keepUnsigned: true });

const totals = readTotals;

type Person = { id: string; full_name: string; nickname: string; department: string; position: string; active: boolean };
async function employees(): Promise<Person[]> {
  const { data, error } = await db().from("employees").select("id,full_name,nickname,department,position,active").order("full_name");
  if (error) databaseError(error);
  return (data ?? []) as Person[];
}
const shortName = (person: Person) => person.nickname || person.full_name;

function byPerson(rows: Totals[]) {
  const out = new Map<string, { points: number; activities: number; dims: Record<DimensionId, number> }>();
  for (const row of rows) {
    const entry = out.get(row.employee_id) ?? { points: 0, activities: 0, dims: zeroDims() };
    entry.points += row.points;
    entry.activities += row.activities;
    if (row.dimension_id) entry.dims[row.dimension_id] += row.points;
    out.set(row.employee_id, entry);
  }
  return out;
}

/* ---------- Hari ini ---------- */

export async function wellbeingOverview(now = new Date()): Promise<WbOverview> {
  const today = wibToday(now), month = monthRange(today), last = previousMonth(today);
  const empty: WbOverview = { migrated: false, today, unchecked: 0, uncheckedPreview: [], todayActivities: 0, month: { ...month, points: 0, people: 0, activities: 0 }, lastMonth: { ...last, overall: [], byDimension: [] }, participants: 0 };
  const client = db();
  const [unchecked, preview, todayCount, monthTotals, lastTotals, people] = await Promise.all([
    client.from("wb_activities").select("id", { count: "exact", head: true }).eq("checked", false),
    client.from("wb_activities").select(ACTIVITY_COLUMNS).eq("checked", false).order("created_at", { ascending: false }).limit(5),
    client.from("wb_activities").select("id", { count: "exact", head: true }).eq("happened_on", today),
    totals(month.from, month.to),
    totals(last.from, last.to),
    employees(),
  ]);
  for (const result of [unchecked, preview, todayCount]) if (result.error) { if (missing(result.error)) return empty; databaseError(result.error); }
  if (!monthTotals.migrated) return empty;
  const named = new Map(people.map(person => [person.id, person]));
  const champion = (id: string, points: number): WbChampion => { const person = named.get(id); return { employeeId: id, name: person?.full_name ?? "(tidak dikenal)", nickname: person ? shortName(person) : "", department: person?.department ?? "", points }; };
  const monthBy = byPerson(monthTotals.rows), lastBy = byPerson(lastTotals.rows);
  const overall = rank([...lastBy].map(([id, value]) => ({ id, points: value.points })).filter(row => row.points > 0)).slice(0, 3).map(row => champion(row.id, row.points));
  const byDimension = DIMENSIONS.flatMap(dimension => {
    const best = rank([...lastBy].map(([id, value]) => ({ id, points: value.dims[dimension] })).filter(row => row.points > 0))[0];
    return best ? [{ ...champion(best.id, best.points), dimension }] : [];
  });
  return {
    migrated: true, today, unchecked: unchecked.count ?? 0, uncheckedPreview: await signPhotos(((preview.data ?? []) as unknown as Row[]).map(toActivity)), todayActivities: todayCount.count ?? 0,
    month: { ...month, points: [...monthBy.values()].reduce((sum, value) => sum + value.points, 0), people: [...monthBy.values()].filter(value => value.points !== 0).length, activities: [...monthBy.values()].reduce((sum, value) => sum + value.activities, 0) },
    lastMonth: { ...last, overall, byDimension },
    participants: people.filter(person => person.active).length,
  };
}

/* ---------- Periksa ---------- */

export const ACTIVITY_FILTERS = ["unchecked", "all", "adjusted", "rejected"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
export const ACTIVITY_KINDS = ["all", "daily", "sport", "strava"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export async function listActivities(query: { filter: ActivityFilter; kind: ActivityKind; q?: string; before?: string; employeeId?: string }, limit = 24): Promise<WbActivityPage> {
  const client = db();
  let request = client.from("wb_activities").select(ACTIVITY_COLUMNS).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (query.filter === "unchecked") request = request.eq("checked", false);
  if (query.filter === "adjusted" || query.filter === "rejected") request = request.eq("status", query.filter);
  if (query.kind === "strava") request = request.eq("source", "strava");
  // Sports are the sport.* codes; everything else is a daily activity.
  if (query.kind === "sport") request = request.like("type_code", "sport.%");
  if (query.kind === "daily") request = request.not("type_code", "like", "sport.%");
  if (query.employeeId) request = request.eq("employee_id", query.employeeId);
  if (query.before) request = request.or(afterCursor(query.before));
  if (query.q?.trim()) {
    const term = query.q.trim().replace(/[^\p{L}\p{N} .'-]/gu, " ").replace(/\s+/g, " ").trim();
    if (!term) return { migrated: true, items: [], next: null, unchecked: 0 };
    const { data: found, error } = await client.from("employees").select("id").or(`full_name.ilike."*${term}*",nickname.ilike."*${term}*",department.ilike."*${term}*"`).limit(200);
    if (error) databaseError(error);
    const ids = (found ?? []).map(row => row.id as string);
    if (!ids.length) return { migrated: true, items: [], next: null, unchecked: 0 };
    request = request.in("employee_id", ids);
  }
  const [{ data, error }, unchecked] = await Promise.all([request, client.from("wb_activities").select("id", { count: "exact", head: true }).eq("checked", false)]);
  if (error) { if (missing(error)) return { migrated: false, items: [], next: null, unchecked: 0 }; databaseError(error); }
  const rows = ((data ?? []) as unknown as Row[]).map(toActivity);
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { migrated: true, items: await signPhotos(items), next: more ? cursorOf(items.at(-1)!) : null, unchecked: unchecked.count ?? 0 };
}

export async function reviewActivity(id: string, input: ReviewInput, actor: Actor): Promise<WbActivity> {
  const { data, error } = await db().from("wb_activities").update({
    status: input.status, points: input.points, review_reason: input.status === "approved" ? null : input.reason, checked: input.checked,
    reviewed_by: actor.employeeId ?? null, reviewed_by_name: actor.name.slice(0, 150), reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id).select(ACTIVITY_COLUMNS).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Aktivitas tidak ditemukan.");
  const [activity] = await signPhotos([toActivity(data as unknown as Row)]);
  return activity;
}

/* ---------- Karyawan ---------- */

export async function listPeople(period: "month" | "all", now = new Date()): Promise<WbPeople> {
  const range = period === "month" ? monthRange(wibToday(now)) : null;
  const [people, sums] = await Promise.all([employees(), totals(range?.from ?? null, range?.to ?? null)]);
  const by = byPerson(sums.rows);
  const rows = rank(people.filter(person => person.active || by.has(person.id)).map(person => {
    const value = by.get(person.id) ?? { points: 0, activities: 0, dims: zeroDims() };
    return { id: person.id, name: person.full_name, nickname: person.nickname, department: person.department, active: person.active, points: value.points, activities: value.activities, dims: value.dims };
  })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id"));
  return { migrated: sums.migrated, period, from: range?.from ?? null, to: range?.to ?? null, rows, departments: [...new Set(people.map(person => person.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")) };
}

export async function personDetail(id: string, now = new Date()): Promise<WbPersonDetail> {
  const client = db();
  const { data: person, error } = await client.from("employees").select("id,full_name,nickname,department,position,active").eq("id", id).maybeSingle();
  if (error) databaseError(error);
  if (!person) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  const month = monthRange(wibToday(now));
  const [all, inMonth, activities, entries] = await Promise.all([
    totals(null, null), totals(month.from, month.to),
    client.from("wb_activities").select(ACTIVITY_COLUMNS).eq("employee_id", id).order("happened_on", { ascending: false }).order("created_at", { ascending: false }).limit(30),
    client.from("wb_point_entries").select("id,batch_id,points,dimension_id,reason,happened_on,created_by_name,created_at,voided_at").eq("employee_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const base = { person: { id: person.id as string, name: person.full_name as string, nickname: (person.nickname as string) ?? "", department: (person.department as string) ?? "", position: (person.position as string) ?? "", active: person.active as boolean } };
  if (!all.migrated || (activities.error && missing(activities.error))) return { migrated: false, ...base, total: 0, month: 0, dims: zeroDims(), monthDims: zeroDims(), activities: [], entries: [] };
  if (activities.error) databaseError(activities.error);
  if (entries.error) databaseError(entries.error);
  const allOne = byPerson(all.rows.filter(row => row.employee_id === id)).get(id), monthOne = byPerson(inMonth.rows.filter(row => row.employee_id === id)).get(id);
  return {
    migrated: true, ...base, total: allOne?.points ?? 0, month: monthOne?.points ?? 0, dims: allOne?.dims ?? zeroDims(), monthDims: monthOne?.dims ?? zeroDims(),
    activities: await signPhotos(((activities.data ?? []) as unknown as Row[]).map(toActivity)),
    entries: ((entries.data ?? []) as Row[]).map((row): WbPointEntry => ({ id: row.id as string, batchId: row.batch_id as string, points: row.points as number, dimension: (row.dimension_id as DimensionId | null) ?? null, reason: row.reason as string, date: row.happened_on as string, by: (row.created_by_name as string) || "Admin", createdAt: row.created_at as string, voided: !!row.voided_at })),
  };
}

/** Tambah poin: the same points to everyone picked, as one batch that can be undone. */
export async function addPoints(input: PointBatchInput, actor: Actor): Promise<WbBatchResult> {
  const client = db();
  const ids = [...new Set(input.employeeIds)];
  let foundCount = 0;
  for (let at = 0; at < ids.length; at += 100) {
    const { data: found, error: lookup } = await client.from("employees").select("id").in("id", ids.slice(at, at + 100));
    if (lookup) databaseError(lookup);
    foundCount += (found ?? []).length;
  }
  if (foundCount !== ids.length) throw new ServiceError(422, "Ada orang yang tidak ditemukan di Data karyawan. Muat ulang lalu pilih lagi.");
  const batchId = randomUUID();
  const { error } = await client.from("wb_point_entries").insert(ids.map(employeeId => ({
    employee_id: employeeId, points: input.points, dimension_id: input.dimension, reason: input.reason, happened_on: input.date, kind: "admin",
    batch_id: batchId, created_by: actor.employeeId ?? null, created_by_name: actor.name.slice(0, 150),
  })));
  if (error) fail(error);
  return { batchId, count: ids.length, points: input.points };
}

/** Urungkan a batch (or only one person's entry in it): it stops counting (kept, marked voided). */
export async function voidBatch(batchId: string, actor: Actor, employeeId?: string): Promise<{ count: number }> {
  let request = db().from("wb_point_entries").update({ voided_at: new Date().toISOString(), voided_by_name: actor.name.slice(0, 150) })
    .eq("batch_id", batchId).is("voided_at", null);
  if (employeeId) request = request.eq("employee_id", employeeId);
  const { data, error } = await request.select("id");
  if (error) fail(error);
  if (!data?.length) throw new ServiceError(404, "Poin ini sudah diurungkan atau tidak ditemukan.");
  return { count: data.length };
}

/* ---------- Pengaturan ---------- */

const toItem = (row: Row): WbCatalogItem => ({
  code: row.code as string, dimension: row.dimension_id as DimensionId, kind: row.kind as "daily" | "sport", name: row.name as string,
  mode: row.points_mode as WbCatalogItem["mode"], points: row.points as number, limit: (row.limit_per as WbCatalogItem["limit"]) ?? null,
  proofHint: (row.proof_hint as string) ?? "", active: row.active as boolean, sortOrder: row.sort_order as number,
});
const CATALOG_COLUMNS = "code,dimension_id,kind,name,points_mode,points,limit_per,proof_hint,active,sort_order";

export async function catalog(): Promise<WbCatalog> {
  const { data, error } = await db().from("wb_activity_types").select(CATALOG_COLUMNS).order("kind").order("dimension_id").order("sort_order");
  if (error) { if (missing(error)) return { migrated: false, items: [] }; databaseError(error); }
  const order = (item: WbCatalogItem) => `${item.kind === "sport" ? 9 : DIMENSIONS.indexOf(item.dimension)}-${String(item.sortOrder).padStart(5, "0")}`;
  return { migrated: true, items: ((data ?? []) as Row[]).map(toItem).sort((a, b) => order(a).localeCompare(order(b))) };
}

const catalogRow = (input: CatalogItemInput) => {
  const dimension = input.kind === "sport" ? "physical" : input.dimension;
  const mode = input.kind === "sport" ? "kcal" : input.mode;
  if (mode === "fixed" && input.points < 1) throw new ServiceError(422, "Poin tetap harus lebih dari 0.", { points: ["Isi poinnya."] });
  return { dimension_id: dimension, kind: input.kind, name: input.name, points_mode: mode, points: mode === "fixed" ? input.points : 0, limit_per: input.limit, proof_hint: input.proofHint, active: input.active, updated_at: new Date().toISOString() };
};
const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "kegiatan";

export async function createCatalogItem(input: CatalogItemInput): Promise<WbCatalogItem> {
  const client = db();
  const row = catalogRow(input);
  const prefix = input.kind === "sport" ? "sport" : row.dimension_id;
  const base = slug(input.name).length >= 2 ? slug(input.name) : `${slug(input.name)}_kegiatan`.replace(/^_/, "");
  let code = `${prefix}.${base}`;
  const { data: taken, error: lookup } = await client.from("wb_activity_types").select("code").like("code", `${code}%`);
  if (lookup) fail(lookup);
  const used = new Set((taken ?? []).map(item => item.code as string));
  for (let n = 2; used.has(code); n++) code = `${prefix}.${base.slice(0, 36)}_${n}`;
  const { data, error } = await client.from("wb_activity_types").insert({ code, ...row, sort_order: 500 }).select(CATALOG_COLUMNS).single();
  if (error) fail(error);
  return toItem(data as Row);
}

export async function updateCatalogItem(code: string, input: CatalogItemInput): Promise<WbCatalogItem> {
  const { data: current, error: read } = await db().from("wb_activity_types").select("kind").eq("code", code).maybeSingle();
  if (read) fail(read);
  if (!current) throw new ServiceError(404, "Jenis kegiatan tidak ditemukan.");
  if (current.kind !== input.kind) throw new ServiceError(422, "Harian atau olahraga tidak bisa diubah. Buat kegiatan baru, lalu nonaktifkan yang ini.", { kind: ["Tidak bisa diubah."] });
  const { data, error } = await db().from("wb_activity_types").update(catalogRow(input)).eq("code", code).select(CATALOG_COLUMNS).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Jenis kegiatan tidak ditemukan.");
  return toItem(data as Row);
}

export async function wellbeingSettings(): Promise<WbSettingsView> {
  const { data, error } = await db().from("wb_settings").select("backdate_days,max_kcal,max_steps,program_start,updated_at,updated_by_name").eq("id", 1).maybeSingle();
  if (error) { if (missing(error)) return { migrated: false, ...defaultSettings, updatedBy: null, updatedAt: null }; databaseError(error); }
  if (!data) return { migrated: true, ...defaultSettings, updatedBy: null, updatedAt: null };
  return { migrated: true, backdateDays: data.backdate_days as number, maxKcal: data.max_kcal as number, maxSteps: data.max_steps as number, programStart: data.program_start as string, updatedBy: (data.updated_by_name as string | null) ?? null, updatedAt: (data.updated_at as string | null) ?? null };
}

export async function saveWellbeingSettings(input: { backdateDays: number; maxKcal: number; maxSteps: number }, actor: Actor): Promise<WbSettingsView> {
  const { error } = await db().from("wb_settings").upsert({ id: 1, backdate_days: input.backdateDays, max_kcal: input.maxKcal, max_steps: input.maxSteps, updated_at: new Date().toISOString(), updated_by_name: actor.name.slice(0, 150) }, { onConflict: "id" });
  if (error) fail(error);
  return wellbeingSettings();
}

