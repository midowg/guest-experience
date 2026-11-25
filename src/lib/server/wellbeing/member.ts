import "server-only";
import { randomUUID } from "node:crypto";
import { kindFromMime } from "@/lib/image-signature";
import { photoPath } from "@/lib/pra-wam/photo";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import type {
  WbAppCatalog, WbBoard, WbCatalogDaily, WbCatalogSport, WbHome, WbLedger, WbLogResult, WbMe, WbMyActivity, WbMyActivityFilter, WbMyActivityPage, WbRules, WbUploadStart,
} from "@/lib/wellbeing/app-types";
import {
  DIMENSIONS, MAX_PHOTOS, addDays, claimedPoints, controlsForApp, countedPoints, dateProblem, defaultAppControls, earliestDate, limitReached, logValues, monthRange, previousMonth, wibToday,
  isNewPhoto, type DimensionId, type EditInput, type Limit, type LogInput, type PointsMode, type ReviewStatus, type UploadStartInput, type WellbeingSettings,
} from "@/lib/wellbeing/rules";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import type { Member } from "../pra-wam/session";
import { isR2Configured, presignUpload, removeObjects, verifyUpload } from "../r2";
import { board, ledgerItems, placeOf, unrankedOf, streakDays, streakStart, weekSeries, type LedgerActivity, type LedgerEntry } from "./member-rules";
import { afterDayCursor, dayCursorOf, db, fail, missing, readAll, readSettings, readTotals, timeOf, waiting, withPhotoUrls, withTime, withTimeColumn, zeroDims, type Row, type Totals } from "./shared";
import { isOwnUploadKey, uploadKeyFor, uploadToken, uploadTokenMatches } from "./uploads";

/*
 * Wellbeing for employees (17 Nov 2026): what /api/wellbeing/* reads and writes for the signed-in
 * WAM account, always only that person's own activities (the board shows everyone's points, names
 * and departments). Contract: src/lib/wellbeing/app-types.ts. Before migration 202611160050 every
 * read answers `migrated: false` with empty data, and every write says it waits for the migration.
 */

export const MY_ACTIVITY_FILTERS = ["all", "daily", "sport", "strava"] as const satisfies readonly WbMyActivityFilter[];
export const BOARD_PERIODS = ["month", "all"] as const;
export const BOARD_DIMENSIONS = ["all", ...DIMENSIONS] as const;
const PAGE_SIZE = 20;
const RECENT = 5;
/** Days of history read at a time for the streak; an older window only while the streak reaches back that far. */
const STREAK_WINDOW = 60;

const MY_COLUMNS = "id,type_code,dimension_id,happened_on,source,title,steps,kcal,minutes,distance_m,note,photos,points_claimed,points,status,review_reason,checked,created_at,type:wb_activity_types(name,kind)";

const storageNotReady = () => new ServiceError(503, "Penyimpanan foto belum siap. Coba lagi nanti, atau kabari admin Wellbeing.");
const loginNotReady = () => new ServiceError(503, "Login belum disiapkan. Isi WAM_SESSION_SECRET pada server.");

const toMe = (member: Member): WbMe => ({ id: member.id, name: member.name, nickname: member.nickname, department: member.department, position: member.position, photo: member.photo });
const rulesOf = (settings: WellbeingSettings): WbRules => ({ backdateDays: settings.backdateDays, programStart: settings.programStart, maxKcal: settings.maxKcal, maxSteps: settings.maxSteps, maxPhotos: MAX_PHOTOS });
const nullableNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));
/** "HH:MM" now in WIB. */
const wibClock = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

function toMine(row: Row): WbMyActivity {
  const type = (row.type ?? {}) as Row;
  const typeCode = row.type_code as string, typeName = (type.name as string | undefined) ?? typeCode, status = row.status as ReviewStatus;
  return {
    id: row.id as string, typeCode, typeName, kind: (type.kind as "daily" | "sport" | undefined) ?? (typeCode.startsWith("sport.") ? "sport" : "daily"),
    dimension: row.dimension_id as DimensionId, date: row.happened_on as string, time: timeOf(row), source: row.source as WbMyActivity["source"], title: (row.title as string) || typeName,
    steps: nullableNumber(row.steps), kcal: nullableNumber(row.kcal), minutes: nullableNumber(row.minutes), distanceM: nullableNumber(row.distance_m),
    note: (row.note as string) ?? "", photos: (row.photos as string[] | null) ?? [], pointsClaimed: row.points_claimed as number,
    points: countedPoints(status, row.points as number), status, reason: (row.review_reason as string | null) ?? null, createdAt: row.created_at as string,
    checked: !!row.checked, photoKeys: (row.photos as string[] | null) ?? [],
  };
}

type Person = { id: string; full_name: string; nickname: string | null; department: string | null; active: boolean };
async function people(): Promise<Person[]> {
  const { rows, error } = await readAll((from, to) => db().from("employees").select("id,full_name,nickname,department,active").order("full_name").order("id").range(from, to));
  if (error) databaseError(error);
  return rows as unknown as Person[];
}
/** What colleagues see on the board: the nama panggilan, else the full name. */
const boardName = (person: Person) => person.nickname?.trim() || person.full_name;

/**
 * Everyone's profile photo (18 Nov 2026): the WAM account's photo (a photo, or the WAM character
 * card made into one), as the app address the board's avatars load. Without photos (before the
 * WAM photo migration, or any error) the board shows initials, as before.
 */
async function photos(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const { rows, error } = await readAll((from, to) => db().from("pw_accounts").select("employee_id,photo_key,photo_updated_at").eq("active", true).not("photo_key", "is", null).order("employee_id").range(from, to));
    if (error) return out;
    for (const row of rows as unknown as { employee_id: string; photo_key: string | null; photo_updated_at: string | null }[]) {
      const path = photoPath({ id: row.employee_id, photoKey: row.photo_key, photoUpdatedAt: row.photo_updated_at });
      if (path) out.set(row.employee_id, path);
    }
  } catch { /* initials */ }
  return out;
}

/* ---------- Beranda ---------- */

const emptyTotals = (today: string): WbHome["totals"] => ({ points: 0, monthPoints: 0, rank: null, of: 0, streak: 0, week: weekSeries([], today) });

/** My counted activities per day from today back, as far as the streak needs (and at least the week). */
async function countedDays(employeeId: string, today: string): Promise<{ date: string; points: number }[] | null> {
  const days: { date: string; points: number }[] = [];
  let to = today;
  for (let window = 0; window < 12; window++) {
    const from = addDays(to, -(STREAK_WINDOW - 1));
    const { rows, error } = await readAll((start, end) => db().from("wb_activities").select("id,happened_on,points").eq("employee_id", employeeId).neq("status", "rejected")
      .gte("happened_on", from).lte("happened_on", to).order("happened_on", { ascending: false }).order("id").range(start, end));
    if (error) { if (missing(error)) return null; databaseError(error); }
    days.push(...rows.map(row => ({ date: row.happened_on as string, points: Number(row.points) })));
    const start = streakStart(days.map(day => day.date), today);
    // The streak starts after the first day read: it is whole. Otherwise read the window before.
    if (!start || start > from) break;
    to = addDays(from, -1);
  }
  return days;
}

/** My totals (all time, this month, place, streak, week) and this month's points per dimension; null before the migration. */
async function myTotals(employeeId: string, now: Date): Promise<{ totals: WbHome["totals"]; dims: Record<DimensionId, number> } | null> {
  const today = wibToday(now), month = monthRange(today);
  const [all, inMonth, everyone, days] = await Promise.all([readTotals(null, null), readTotals(month.from, month.to), people(), countedDays(employeeId, today)]);
  if (!all.migrated || !inMonth.migrated || !days) return null;
  const sum = (rows: Totals[]) => rows.reduce((total, row) => total + row.points, 0);
  const monthBy = new Map<string, number>();
  for (const row of inMonth.rows) monthBy.set(row.employee_id, (monthBy.get(row.employee_id) ?? 0) + row.points);
  const dims = zeroDims();
  for (const row of inMonth.rows) if (row.employee_id === employeeId && row.dimension_id) dims[row.dimension_id] += row.points;
  const active = everyone.filter(person => person.active);
  return {
    totals: {
      points: sum(all.rows.filter(row => row.employee_id === employeeId)),
      monthPoints: monthBy.get(employeeId) ?? 0,
      rank: placeOf(active.map(person => ({ id: person.id, points: monthBy.get(person.id) ?? 0 })), employeeId),
      of: active.length,
      streak: streakDays(days.map(day => day.date), today),
      week: weekSeries(days, today),
    },
    dims,
  };
}

export async function home(member: Member, now = new Date()): Promise<WbHome> {
  const today = wibToday(now);
  const [settings, summary, recent] = await Promise.all([
    readSettings(),
    myTotals(member.id, now),
    withTimeColumn(on => db().from("wb_activities").select(withTime(MY_COLUMNS, on)).eq("employee_id", member.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(RECENT)),
  ]);
  const base = { me: toMe(member), today, rules: rulesOf(settings.settings), controls: controlsForApp(settings.app, today) };
  if (recent.error && !missing(recent.error)) databaseError(recent.error);
  if (!settings.migrated || !summary || recent.error) return { migrated: false, ...base, totals: emptyTotals(today), dims: zeroDims(), recent: [] };
  return { migrated: true, ...base, totals: summary.totals, dims: summary.dims, recent: await withPhotoUrls(((recent.data ?? []) as unknown as Row[]).map(toMine)) };
}

/* ---------- Catat: the catalogue ---------- */

const TYPE_COLUMNS = "code,dimension_id,kind,name,points_mode,points,limit_per,proof_hint,active,sort_order";
const blockedText = (limit: Limit) => (limit === "day" ? "Sudah dicatat hari ini. Kegiatan ini hanya sekali sehari." : "Sudah dicatat bulan ini. Kegiatan ini hanya sekali sebulan.");

export async function catalog(member: Member, now = new Date()): Promise<WbAppCatalog> {
  const today = wibToday(now), month = monthRange(today);
  const client = db();
  const settings = await readSettings();
  // This month (limits) and the backdate window (one per day; since the programme started when there is no limit), whichever starts earlier.
  const since = [month.from, earliestDate(today, settings.settings.backdateDays, settings.settings.programStart)].sort()[0];
  const [types, logged] = await Promise.all([
    client.from("wb_activity_types").select(TYPE_COLUMNS).eq("active", true),
    readAll((from, to) => client.from("wb_activities").select("id,type_code,happened_on").eq("employee_id", member.id).neq("status", "rejected")
      .gte("happened_on", since).lte("happened_on", month.to).order("id").range(from, to)),
  ]);
  const rules = rulesOf(settings.settings), controls = controlsForApp(settings.app ?? defaultAppControls, today);
  for (const error of [types.error, logged.error]) if (error) { if (missing(error)) return { migrated: false, daily: [], sports: [], rules, today, controls }; databaseError(error); }
  if (!settings.migrated) return { migrated: false, daily: [], sports: [], rules, today, controls };
  const datesOf = new Map<string, string[]>();
  for (const row of logged.rows) datesOf.set(row.type_code as string, [...(datesOf.get(row.type_code as string) ?? []), row.happened_on as string]);
  const order = (row: Row) => `${row.kind === "sport" ? 9 : DIMENSIONS.indexOf(row.dimension_id as DimensionId)}-${String(row.sort_order).padStart(6, "0")}-${row.name}`;
  const rows = ((types.data ?? []) as Row[]).sort((a, b) => order(a).localeCompare(order(b), "id"));
  // A daily type counted by kcal has no place in the daily list (the screens log kcal as a sport).
  const daily = rows.filter(row => row.kind === "daily" && row.points_mode !== "kcal").map((row): WbCatalogDaily => {
    const limit = (row.limit_per as Limit | null) ?? null;
    return {
      code: row.code as string, dimension: row.dimension_id as DimensionId, name: row.name as string, mode: row.points_mode as WbCatalogDaily["mode"], points: row.points as number,
      limit, proofHint: (row.proof_hint as string) ?? "", blocked: limit === "month" && limitReached(limit, today, datesOf.get(row.code as string) ?? []) ? blockedText(limit) : null,
      loggedOn: [...new Set((datesOf.get(row.code as string) ?? []).filter(date => date >= earliestDate(today, rules.backdateDays, rules.programStart)))].sort(),
    };
  });
  const sports = rows.filter(row => row.kind === "sport").map((row): WbCatalogSport => ({ code: row.code as string, name: row.name as string, proofHint: (row.proof_hint as string) ?? "" }));
  return { migrated: true, daily, sports, rules, today, controls };
}

/* ---------- Riwayat ---------- */

export async function myActivities(member: Member, filter: WbMyActivityFilter, before?: string): Promise<WbMyActivityPage> {
  const { data, error } = await withTimeColumn(on => {
    let request = db().from("wb_activities").select(withTime(MY_COLUMNS, on)).eq("employee_id", member.id)
      .order("happened_on", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
    // Sports are the sport.* codes (as in Admin Periksa); those from Strava have their own tab.
    if (filter === "daily") request = request.not("type_code", "like", "sport.%");
    if (filter === "sport") request = request.like("type_code", "sport.%").neq("source", "strava");
    if (filter === "strava") request = request.eq("source", "strava");
    if (before) request = request.or(afterDayCursor(before));
    return request;
  });
  if (error) { if (missing(error)) return { migrated: false, items: [], next: null }; databaseError(error); }
  const rows = ((data ?? []) as unknown as Row[]).map(toMine);
  const more = rows.length > PAGE_SIZE;
  const items = more ? rows.slice(0, PAGE_SIZE) : rows;
  return { migrated: true, items: await withPhotoUrls(items), next: more ? dayCursorOf(items.at(-1)!) : null };
}

/** One of my activities; someone else's (or none) is 404. */
export async function myActivity(member: Member, id: string): Promise<WbMyActivity> {
  const none = new ServiceError(404, "Aktivitas tidak ditemukan.");
  const { data, error } = await withTimeColumn(on => db().from("wb_activities").select(withTime(MY_COLUMNS, on)).eq("id", id).eq("employee_id", member.id).maybeSingle());
  if (error) { if (missing(error)) throw none; databaseError(error); }
  if (!data) throw none;
  const [activity] = await withPhotoUrls([toMine(data as unknown as Row)]);
  return activity;
}

/* ---------- Catat: proof photos and the log ---------- */

/** Step one for each proof photo: a key of the server's choosing, a ten-minute upload address, and its token. */
export async function startUpload(member: Member, input: UploadStartInput, now = new Date()): Promise<WbUploadStart> {
  if (!isR2Configured()) throw storageNotReady();
  const secret = praWamSecret();
  if (!secret) throw loginNotReady();
  if (!(await readSettings()).migrated) throw waiting();
  const photo = { key: uploadKeyFor(member.id, randomUUID(), input.mime), mime: input.mime, size: input.size };
  return { key: photo.key, uploadUrl: await presignUpload(photo.key, photo.mime, photo.size), token: uploadToken(secret, photo, member.id, now.getTime()) };
}

const conflict = (code: "limit" | "same_day" | "strava_twin", message: string) => new ServiceError(409, message, { code: [code] });
const refused = (field: string, message: string) => new ServiceError(422, message, { [field]: [message] });

/**
 * Catat: one activity, counted at once (approved, not yet checked by an admin). Refused when the
 * type is gone, the date is outside the window, a value is out of range, a photo is not this
 * person's agreed upload, or (409) the limit is reached, the daily type is already there that
 * day, or a sport is already in from Strava that day (sent again with force to log it anyway).
 *
 * The uploaded photos are kept after a refusal the person can correct (fields, 409), so the same
 * form can be sent again; they are deleted when they fail the photo check or saving fails.
 */
export async function logActivity(member: Member, input: LogInput, now = new Date()): Promise<WbLogResult> {
  const secret = praWamSecret();
  if (input.photos.some(photo => !isOwnUploadKey(photo.key, member.id, photo.mime) || !uploadTokenMatches(secret, photo.token, photo, member.id, now.getTime()))) {
    throw refused("photos", "Foto bukti tidak dikenali atau sudah kedaluwarsa. Unggah ulang fotonya.");
  }
  if (!isR2Configured()) throw storageNotReady();
  const keys = input.photos.map(photo => photo.key);
  // Only keys checked above (this person's folder) are ever deleted.
  const discard = () => removeObjects(keys).catch(() => undefined);

  const client = db();
  const today = wibToday(now);
  const [settingsRead, typeRead] = await Promise.all([readSettings(), client.from("wb_activity_types").select(TYPE_COLUMNS).eq("code", input.code).maybeSingle()]);
  if (typeRead.error) fail(typeRead.error);
  if (!settingsRead.migrated) throw waiting();
  // Catat paused by the admin (a data move, a fix): the photos may be sent again later.
  const paused = controlsForApp(settingsRead.app, today).pausedMessage;
  if (paused) throw new ServiceError(503, paused);
  const type = typeRead.data as Row | null;
  if (!type || !type.active) throw refused("code", "Kegiatan ini sudah tidak tersedia. Muat ulang daftar kegiatan.");
  const settings = settingsRead.settings;
  const problem = dateProblem(input.date, today, settings.backdateDays, settings.programStart);
  if (problem) throw refused("date", problem);
  // A time later today has not happened yet (a few minutes of clock difference are let through).
  if (input.time && input.date === today && input.time > wibClock(new Date(now.getTime() + 5 * 60_000))) throw refused("time", "Jam itu belum lewat hari ini.");
  const mode = type.points_mode as PointsMode;
  const values = logValues(mode, input, settings);
  if (!values.ok) throw new ServiceError(422, Object.values(values.fieldErrors)[0][0], values.fieldErrors);

  // This type in the activity's month (limits, the same day, Strava), and the photos not used before.
  const month = monthRange(input.date);
  const [history, reused] = await Promise.all([
    readAll((from, to) => client.from("wb_activities").select("id,happened_on,source").eq("employee_id", member.id).eq("type_code", input.code).neq("status", "rejected")
      .gte("happened_on", month.from).lte("happened_on", month.to).order("id").range(from, to)),
    client.from("wb_activities").select("id").eq("employee_id", member.id).overlaps("photos", keys).limit(1),
  ]);
  if (history.error) fail(history.error);
  if (reused.error) fail(reused.error);
  if (reused.data?.length) throw refused("photos", "Foto ini sudah dipakai untuk aktivitas lain. Unggah foto baru.");
  const dates = history.rows.map(row => row.happened_on as string);
  const limit = (type.limit_per as Limit | null) ?? null;
  if (limit && limitReached(limit, input.date, dates)) {
    throw conflict("limit", limit === "day" ? "Kegiatan ini hanya sekali sehari dan sudah tercatat pada tanggal itu." : "Kegiatan ini hanya sekali sebulan dan sudah tercatat bulan itu.");
  }
  if (type.kind === "daily" && dates.includes(input.date)) throw conflict("same_day", "Kegiatan ini sudah kamu catat pada tanggal itu.");
  if (type.kind === "sport" && !input.force && history.rows.some(row => row.source === "strava" && row.happened_on === input.date)) {
    throw conflict("strava_twin", `Pada tanggal itu sudah ada ${type.name as string} dari Strava. Kalau ini olahraga yang berbeda, kirim sekali lagi.`);
  }

  try {
    await Promise.all(input.photos.map(photo => verifyUpload(photo.key, photo.size, [kindFromMime(photo.mime) ?? "jpeg"])));
  } catch (error) {
    await discard();
    throw error;
  }
  const points = claimedPoints(mode, type.points as number, values, settings);
  // The time is kept once migration 202611170002 is in; before it, the log is saved without it.
  const { data, error } = await withTimeColumn(on => client.from("wb_activities").insert({
    employee_id: member.id, type_code: type.code, dimension_id: type.dimension_id, happened_on: input.date, ...(on && input.time ? { happened_time: input.time } : {}),
    source: "manual", title: String(type.name).slice(0, 200),
    steps: values.steps, kcal: values.kcal, minutes: values.minutes, note: input.note, photos: keys, points_claimed: points, points, status: "approved", checked: false,
  }).select(withTime(MY_COLUMNS, on)).single());
  if (error) {
    // Two sends at once: the unique index (202611170001) lets one through; the other is the same log.
    if (error.code === "23505") throw conflict("same_day", "Kegiatan ini sudah kamu catat pada tanggal itu.");
    await discard();
    fail(error);
  }
  const [activity] = await withPhotoUrls([toMine(data as unknown as Row)]);
  const summary = await myTotals(member.id, now);
  return { activity, totals: summary?.totals ?? emptyTotals(today) };
}

/**
 * Ubah (25 Nov 2026): change my own activity while the admin has not checked it (Catat's own data only:
 * not from Strava or the old app, not yet Oke'd, changed or rejected). The same checks as Catat (the
 * type, the date and time, the values, once a day or month, Strava's twin), this activity left out of
 * them; the photos kept are the activity's own, new ones are checked uploads. The points follow the new
 * values. Saved only while it is still unchecked, so an admin's Oke a moment earlier wins (409); the
 * photos taken off are removed from storage.
 */
export async function updateMyActivity(member: Member, id: string, input: EditInput, now = new Date()): Promise<WbLogResult> {
  const client = db();
  const read = await client.from("wb_activities").select("id,source,status,checked,photos").eq("id", id).eq("employee_id", member.id).maybeSingle();
  if (read.error) fail(read.error);
  const current = read.data as Row | null;
  if (!current) throw new ServiceError(404, "Aktivitas tidak ditemukan.");
  if (current.source !== "manual") throw new ServiceError(409, "Aktivitas dari Strava atau aplikasi lama tidak bisa diubah.");
  if (current.checked || current.status !== "approved") throw new ServiceError(409, "Aktivitas ini sudah diperiksa admin, jadi tidak bisa diubah lagi.");
  const before = (current.photos as string[] | null) ?? [];
  const fresh = input.photos.filter(isNewPhoto);
  if (input.photos.some(photo => !isNewPhoto(photo) && !before.includes(photo.key))) throw refused("photos", "Foto bukti tidak dikenali. Tutup lalu buka lagi aktivitasnya.");
  const secret = praWamSecret();
  if (fresh.some(photo => !isOwnUploadKey(photo.key, member.id, photo.mime) || !uploadTokenMatches(secret, photo.token, photo, member.id, now.getTime()))) {
    throw refused("photos", "Foto bukti tidak dikenali atau sudah kedaluwarsa. Unggah ulang fotonya.");
  }
  if (fresh.length && !isR2Configured()) throw storageNotReady();
  const freshKeys = fresh.map(photo => photo.key), keys = input.photos.map(photo => photo.key);
  const discard = () => removeObjects(freshKeys).catch(() => undefined);

  const today = wibToday(now);
  const [settingsRead, typeRead] = await Promise.all([readSettings(), client.from("wb_activity_types").select(TYPE_COLUMNS).eq("code", input.code).maybeSingle()]);
  if (typeRead.error) fail(typeRead.error);
  if (!settingsRead.migrated) throw waiting();
  const paused = controlsForApp(settingsRead.app, today).pausedMessage;
  if (paused) throw new ServiceError(503, paused);
  const type = typeRead.data as Row | null;
  if (!type || !type.active) throw refused("code", "Kegiatan ini sudah tidak tersedia. Pilih kegiatan lain.");
  const settings = settingsRead.settings;
  const problem = dateProblem(input.date, today, settings.backdateDays, settings.programStart);
  if (problem) throw refused("date", problem);
  if (input.time && input.date === today && input.time > wibClock(new Date(now.getTime() + 5 * 60_000))) throw refused("time", "Jam itu belum lewat hari ini.");
  const mode = type.points_mode as PointsMode;
  const values = logValues(mode, input, settings);
  if (!values.ok) throw new ServiceError(422, Object.values(values.fieldErrors)[0][0], values.fieldErrors);

  // The type in the month, this activity left out; new photos not used by another activity.
  const month = monthRange(input.date);
  const [history, reused] = await Promise.all([
    readAll((from, to) => client.from("wb_activities").select("id,happened_on,source").eq("employee_id", member.id).eq("type_code", input.code).neq("status", "rejected").neq("id", id)
      .gte("happened_on", month.from).lte("happened_on", month.to).order("id").range(from, to)),
    freshKeys.length ? client.from("wb_activities").select("id").eq("employee_id", member.id).overlaps("photos", freshKeys).limit(1) : Promise.resolve({ data: [], error: null }),
  ]);
  if (history.error) fail(history.error);
  if (reused.error) fail(reused.error);
  if (reused.data?.length) throw refused("photos", "Foto ini sudah dipakai untuk aktivitas lain. Unggah foto baru.");
  const dates = history.rows.map(row => row.happened_on as string);
  const limit = (type.limit_per as Limit | null) ?? null;
  if (limit && limitReached(limit, input.date, dates)) {
    throw conflict("limit", limit === "day" ? "Kegiatan ini hanya sekali sehari dan sudah tercatat pada tanggal itu." : "Kegiatan ini hanya sekali sebulan dan sudah tercatat bulan itu.");
  }
  if (type.kind === "daily" && dates.includes(input.date)) throw conflict("same_day", "Kegiatan ini sudah kamu catat pada tanggal itu.");
  if (type.kind === "sport" && !input.force && history.rows.some(row => row.source === "strava" && row.happened_on === input.date)) {
    throw conflict("strava_twin", `Pada tanggal itu sudah ada ${type.name as string} dari Strava. Kalau ini olahraga yang berbeda, kirim sekali lagi.`);
  }

  try {
    await Promise.all(fresh.map(photo => verifyUpload(photo.key, photo.size, [kindFromMime(photo.mime) ?? "jpeg"])));
  } catch (error) {
    await discard();
    throw error;
  }
  const points = claimedPoints(mode, type.points as number, values, settings);
  const { data, error } = await withTimeColumn(on => client.from("wb_activities").update({
    type_code: type.code, dimension_id: type.dimension_id, happened_on: input.date, ...(on ? { happened_time: input.time ?? null } : {}),
    title: String(type.name).slice(0, 200), steps: values.steps, kcal: values.kcal, minutes: values.minutes, note: input.note, photos: keys,
    points_claimed: points, points, updated_at: now.toISOString(),
  }).eq("id", id).eq("employee_id", member.id).eq("checked", false).eq("status", "approved").select(withTime(MY_COLUMNS, on)).maybeSingle());
  if (error) {
    await discard();
    if (error.code === "23505") throw conflict("same_day", "Kegiatan ini sudah kamu catat pada tanggal itu.");
    fail(error);
  }
  if (!data) {
    await discard();
    throw new ServiceError(409, "Aktivitas ini baru saja diperiksa admin, jadi tidak bisa diubah lagi.");
  }
  // Photos taken off this activity: only this person's own uploads are ever deleted.
  const dropped = before.filter(key => !keys.includes(key) && key.startsWith(`wellbeing/${member.id}/`));
  if (dropped.length) await removeObjects(dropped).catch(() => undefined);
  const [activity] = await withPhotoUrls([toMine(data as unknown as Row)]);
  const summary = await myTotals(member.id, now);
  return { activity, totals: summary?.totals ?? emptyTotals(today) };
}

/* ---------- Peringkat ---------- */

export async function leaderboard(member: Member, period: "month" | "all", dim: DimensionId | "all", now = new Date()): Promise<WbBoard> {
  const today = wibToday(now);
  const range = period === "month" ? monthRange(today) : null, last = previousMonth(today);
  const [everyone, sums, lastSums, photoOf] = await Promise.all([people(), readTotals(range?.from ?? null, range?.to ?? null), readTotals(last.from, last.to), photos()]);
  const active = everyone.filter(person => person.active);
  if (!sums.migrated || !lastSums.migrated) return { migrated: false, period, dim, items: [], me: null, of: active.length, lastMonthChampion: null, near: [], ahead: null, unranked: [] };
  const pointsBy = (rows: Totals[]) => {
    const out = new Map<string, number>();
    for (const row of rows) if (dim === "all" || row.dimension_id === dim) out.set(row.employee_id, (out.get(row.employee_id) ?? 0) + row.points);
    return out;
  };
  const current = pointsBy(sums.rows), before = pointsBy(lastSums.rows);
  const row = (person: Person, points: Map<string, number>) => ({ id: person.id, name: boardName(person), department: person.department ?? "", points: points.get(person.id) ?? 0, photo: photoOf.get(person.id) ?? null });
  const rows = active.map(person => row(person, current));
  const { items, me, near, ahead } = board(rows, member.id);
  // Last month's champion stays the champion after leaving, as in Admin Wellbeing.
  const champion = board(everyone.map(person => row(person, before)), member.id, 1).items[0] ?? null;
  return { migrated: true, period, dim, items, me, of: active.length, lastMonthChampion: champion, near, ahead, unranked: unrankedOf(rows, member.id) };
}

/* ---------- Riwayat poin ---------- */

export async function ledger(member: Member): Promise<WbLedger> {
  const client = db();
  const [activities, entries] = await Promise.all([
    readAll((from, to) => client.from("wb_activities").select("id,happened_on,created_at,title,type_code,dimension_id,source,steps,kcal,minutes,points,status,type:wb_activity_types(name)")
      .eq("employee_id", member.id).neq("status", "rejected").order("happened_on", { ascending: false }).order("id").range(from, to)),
    readAll((from, to) => client.from("wb_point_entries").select("id,happened_on,created_at,reason,points,dimension_id,kind")
      .eq("employee_id", member.id).is("voided_at", null).order("happened_on", { ascending: false }).order("id").range(from, to)),
  ]);
  for (const read of [activities, entries]) if (read.error) { if (missing(read.error)) return { migrated: false, items: [], total: 0 }; databaseError(read.error); }
  const done: LedgerActivity[] = activities.rows.map(row => ({
    date: row.happened_on as string, createdAt: row.created_at as string, title: (row.title as string) ?? "", typeName: (((row.type ?? {}) as Row).name as string | undefined) ?? (row.type_code as string),
    dimension: row.dimension_id as DimensionId, source: row.source as LedgerActivity["source"], steps: nullableNumber(row.steps), kcal: nullableNumber(row.kcal), minutes: nullableNumber(row.minutes),
    points: Number(row.points), status: row.status as ReviewStatus,
  }));
  const given: LedgerEntry[] = entries.rows.map(row => ({
    date: row.happened_on as string, createdAt: row.created_at as string, reason: row.reason as string, points: Number(row.points),
    dimension: (row.dimension_id as DimensionId | null) ?? null, kind: row.kind === "import" ? "import" : "admin",
  }));
  return { migrated: true, ...ledgerItems(done, given) };
}
