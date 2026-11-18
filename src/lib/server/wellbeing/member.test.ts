import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "../pra-wam/session";

/*
 * Catat (17 Nov 2026) against a small in-memory stand-in for Supabase and R2: tables are arrays,
 * filters are the ones member.ts uses, wb_totals sums like the migration does. People are fictional.
 */
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let missingTables = false;
/** Before migration 202611170002: no happened_time column. */
let noTimeColumn = false;
const removed: string[][] = [];
let verifyFails = false;

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "insert" = "select";
  let payload: Row | null = null;
  let single = false;
  let slice: [number, number] | null = null;
  let columns = "";
  const run = () => {
    if (missingTables && table.startsWith("wb_")) return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` } };
    if (noTimeColumn && table === "wb_activities" && op === "insert" && payload && "happened_time" in payload) return { data: null, error: { code: "PGRST204", message: "Could not find the 'happened_time' column of 'wb_activities' in the schema cache" } };
    if (noTimeColumn && table === "wb_activities" && columns.includes("happened_time")) return { data: null, error: { code: "42703", message: "column wb_activities.happened_time does not exist" } };
    const rows = tables[table] ?? (tables[table] = []);
    if (op === "insert") {
      const type = tables.wb_activity_types.find(item => item.code === payload!.type_code)!;
      const row = { id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, created_at: `2026-11-17T03:0${rows.length % 10}:00Z`, review_reason: null, distance_m: null, ...payload!, type: { name: type.name, kind: type.kind } };
      rows.push(row);
      return { data: row, error: null };
    }
    let found = rows.filter(row => filters.every(test => test(row)));
    if (slice) found = found.slice(slice[0], slice[1] + 1);
    return { data: single ? found[0] ?? null : found, error: null };
  };
  const builder = {
    select: (list?: string) => { columns = list ?? ""; return builder; }, order: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return builder; },
    gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
    lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return builder; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return builder; },
    overlaps: (key: string, values: string[]) => { filters.push(row => ((row[key] as string[]) ?? []).some(value => values.includes(value))); return builder; },
    range: (from: number, to: number) => { slice = [from, to]; return builder; },
    limit: (count: number) => { slice = [0, count - 1]; return builder; },
    insert: (row: Row) => { op = "insert"; payload = row; return builder; },
    single: () => { single = true; return builder; }, maybeSingle: () => { single = true; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}

function totals(_name: string, args: { p_from: string | null; p_to: string | null }) {
  const sums = new Map<string, Row>();
  const within = (row: Row) => (!args.p_from || String(row.happened_on) >= args.p_from) && (!args.p_to || String(row.happened_on) <= args.p_to);
  for (const row of [...tables.wb_activities.filter(item => item.status !== "rejected"), ...tables.wb_point_entries.filter(item => !item.voided_at)].filter(within)) {
    const key = `${row.employee_id}|${row.dimension_id}`;
    const sum = sums.get(key) ?? { employee_id: row.employee_id, dimension_id: row.dimension_id, points: 0, activities: 0 };
    sum.points = (sum.points as number) + (row.points as number); sum.activities = (sum.activities as number) + 1;
    sums.set(key, sum);
  }
  const builder = { order: () => builder, range: () => builder, then: (resolve: (result: unknown) => unknown) => Promise.resolve(missingTables ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.wb_totals" } } : { data: [...sums.values()], error: null }).then(resolve) };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query, rpc: totals }) }));
vi.mock("../r2", () => ({
  isR2Configured: () => true,
  presignUpload: vi.fn(async (key: string) => `https://r2.example/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://r2.example/get/${key}?signed`),
  removeObjects: vi.fn(async (keys: string[]) => { removed.push(keys); }),
  verifyUpload: vi.fn(async () => { if (verifyFails) throw Object.assign(new Error("Berkas belum terunggah. Coba unggah ulang."), { status: 422 }); return "jpeg"; }),
}));

const { home, leaderboard, logActivity, myActivities, startUpload } = await import("./member");
const { resetTimeColumn } = await import("./shared");
const { ServiceError } = await import("../config");
const { logSchema } = await import("@/lib/wellbeing/rules");

const me: Member = { id: "2f1c6a4e-8b7d-4c3a-9e21-5d6f7a8b9c0d", name: "Contoh Satu", nickname: "Satu", department: "CoE", position: "Staff", mustChangePassword: false, roles: [], photo: null };
const other: Member = { ...me, id: "7a8b9c0d-1c2d-4e5f-8a9b-0c1d2e3f4a5b", name: "Contoh Dua", nickname: "Dua" };
const now = new Date("2026-11-17T03:00:00Z");

async function photoFor(member: Member) {
  const start = await startUpload(member, { mime: "image/jpeg", size: 1000 }, now);
  return { key: start.key, mime: "image/jpeg" as const, size: 1000, token: start.token };
}
async function log(member: Member, input: Record<string, unknown>) {
  return logActivity(member, logSchema.parse({ date: "2026-11-17", note: "", photos: [await photoFor(member)], ...input }), now);
}
async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(ServiceError);
  return error as InstanceType<typeof ServiceError>;
}

beforeEach(() => {
  process.env.WAM_SESSION_SECRET = "s".repeat(40);
  missingTables = false; noTimeColumn = false; verifyFails = false; removed.length = 0;
  resetTimeColumn();
  tables = {
    wb_settings: [{ id: 1, backdate_days: 7, max_kcal: 3000, max_steps: 60000, program_start: "2026-05-22" }],
    wb_activity_types: [
      { code: "physical.steps", dimension_id: "physical", kind: "daily", name: "Langkah harian", points_mode: "steps", points: 0, limit_per: "day", proof_hint: "", active: true, sort_order: 10 },
      { code: "emotional.meditasi", dimension_id: "emotional", kind: "daily", name: "Meditasi", points_mode: "fixed", points: 70, limit_per: null, proof_hint: "", active: true, sort_order: 150 },
      { code: "financial.asuransi", dimension_id: "financial", kind: "daily", name: "Membeli Asuransi", points_mode: "fixed", points: 300, limit_per: "month", proof_hint: "", active: true, sort_order: 160 },
      { code: "sport.running", dimension_id: "physical", kind: "sport", name: "Lari", points_mode: "kcal", points: 0, limit_per: null, proof_hint: "", active: true, sort_order: 210 },
      { code: "social.lama", dimension_id: "social", kind: "daily", name: "Kegiatan lama", points_mode: "fixed", points: 50, limit_per: null, proof_hint: "", active: false, sort_order: 999 },
    ],
    wb_activities: [],
    wb_point_entries: [],
    employees: [
      { id: me.id, full_name: "Contoh Satu", nickname: "Satu", department: "CoE", active: true },
      { id: other.id, full_name: "Contoh Dua", nickname: "Dua", department: "HR", active: true },
    ],
  };
});

describe("Catat", () => {
  it("logs steps at 10 a point, counted at once, with photos ready to show and fresh totals", async () => {
    const result = await log(me, { code: "physical.steps", steps: 9128 });
    expect(result.activity).toMatchObject({ typeCode: "physical.steps", kind: "daily", dimension: "physical", steps: 9128, points: 912, pointsClaimed: 912, status: "approved", source: "manual" });
    expect(result.activity.photos[0]).toMatch(/^https:\/\/r2\.example\/get\/wellbeing\/2f1c6a4e/);
    expect(tables.wb_activities[0]).toMatchObject({ employee_id: me.id, checked: false, kcal: null, minutes: null });
    expect(result.totals).toMatchObject({ points: 912, monthPoints: 912, rank: 1, of: 2, streak: 1 });
    expect(result.totals.week.at(-1)).toEqual({ date: "2026-11-17", points: 912 });
  });

  it("keeps the time of day when given, refuses one later today, and saves without it before migration 202611170002", async () => {
    // now is 10:00 WIB.
    expect((await log(me, { code: "sport.running", kcal: 300, time: "06:05" })).activity).toMatchObject({ time: "06:05", kcal: 300 });
    expect(tables.wb_activities[0]).toMatchObject({ happened_time: "06:05" });
    expect(await refusal(log(me, { code: "sport.running", kcal: 200, time: "11:30" }))).toMatchObject({ status: 422, fieldErrors: { time: ["Jam itu belum lewat hari ini."] } });
    expect((await log(me, { code: "sport.running", kcal: 200, time: "21:00", date: "2026-11-16" })).activity.time).toBe("21:00");
    expect((await log(me, { code: "emotional.meditasi" })).activity.time).toBeNull();

    noTimeColumn = true; resetTimeColumn();
    const saved = await log(me, { code: "sport.running", kcal: 150, time: "07:00", date: "2026-11-15" });
    expect(saved.activity).toMatchObject({ kcal: 150, time: null });
    expect(tables.wb_activities.at(-1)).not.toHaveProperty("happened_time");
    const page = await myActivities(me, "all");
    expect(page.migrated).toBe(true);
    expect(page.items).toHaveLength(4);
  });

  it("refuses a second log past the limit (409 limit) and the same daily activity on the same day (409 same_day), keeping the photos", async () => {
    await log(me, { code: "physical.steps", steps: 5000 });
    expect((await refusal(log(me, { code: "physical.steps", steps: 6000 })))).toMatchObject({ status: 409, fieldErrors: { code: ["limit"] } });
    await log(me, { code: "financial.asuransi", date: "2026-11-10" });
    expect((await refusal(log(me, { code: "financial.asuransi", date: "2026-11-16" })))).toMatchObject({ status: 409, fieldErrors: { code: ["limit"] } });
    await log(me, { code: "emotional.meditasi" });
    expect((await refusal(log(me, { code: "emotional.meditasi" })))).toMatchObject({ status: 409, fieldErrors: { code: ["same_day"] } });
    expect(await log(me, { code: "emotional.meditasi", date: "2026-11-16" })).toMatchObject({ activity: { points: 70 } });
    expect(removed).toEqual([]);
  });

  it("asks before logging a sport that already came in from Strava that day (409 strava_twin, then force)", async () => {
    tables.wb_activities.push({ id: "s1", employee_id: me.id, type_code: "sport.running", dimension_id: "physical", happened_on: "2026-11-17", source: "strava", status: "approved", points: 400, photos: [] });
    const photo = await photoFor(me);
    const input = { code: "sport.running", date: "2026-11-17", kcal: 412.6, minutes: 45, note: "", photos: [photo] };
    expect(await refusal(logActivity(me, logSchema.parse(input), now))).toMatchObject({ status: 409, fieldErrors: { code: ["strava_twin"] } });
    const forced = await logActivity(me, logSchema.parse({ ...input, force: true }), now);
    expect(forced.activity).toMatchObject({ kind: "sport", kcal: 413, minutes: 45, points: 413 });
  });

  it("refuses someone else's upload, an old date, a value out of range, a type no longer offered, or a photo used before", async () => {
    const theirs = await photoFor(other);
    expect(await refusal(logActivity(me, logSchema.parse({ code: "emotional.meditasi", date: "2026-11-17", note: "", photos: [theirs] }), now))).toMatchObject({ status: 422, fieldErrors: { photos: [expect.any(String)] } });
    // Any day since the programme started (18 Nov 2026); before it, refused. A day limit applies only once switched on.
    expect(await refusal(log(me, { code: "emotional.meditasi", date: "2026-05-21" }))).toMatchObject({ status: 422, fieldErrors: { date: [expect.stringMatching(/saat program mulai/)] } });
    tables.wb_settings[0].app = { backdateLimited: true };
    expect(await refusal(log(me, { code: "emotional.meditasi", date: "2026-11-09" }))).toMatchObject({ status: 422, fieldErrors: { date: [expect.stringMatching(/7 hari/)] } });
    tables.wb_settings[0].app = {};
    expect(await refusal(log(me, { code: "emotional.meditasi", date: "2026-11-18" }))).toMatchObject({ status: 422, fieldErrors: { date: [expect.any(String)] } });
    expect(await refusal(log(me, { code: "physical.steps", steps: 50 }))).toMatchObject({ status: 422, fieldErrors: { steps: [expect.any(String)] } });
    expect(await refusal(log(me, { code: "sport.running", kcal: 5000 }))).toMatchObject({ status: 422, fieldErrors: { kcal: [expect.any(String)] } });
    expect(await refusal(log(me, { code: "social.lama" }))).toMatchObject({ status: 422, fieldErrors: { code: [expect.any(String)] } });
    const photo = await photoFor(me);
    await logActivity(me, logSchema.parse({ code: "sport.running", date: "2026-11-17", kcal: 300, note: "", photos: [photo] }), now);
    expect(await refusal(logActivity(me, logSchema.parse({ code: "sport.running", date: "2026-11-16", kcal: 300, note: "", photos: [photo] }), now))).toMatchObject({ status: 422, fieldErrors: { photos: [expect.stringMatching(/sudah dipakai/)] } });
    expect(tables.wb_activities).toHaveLength(1);
  });

  it("deletes the uploads when they fail the photo check", async () => {
    verifyFails = true;
    const photo = await photoFor(me);
    await expect(logActivity(me, logSchema.parse({ code: "emotional.meditasi", date: "2026-11-17", note: "", photos: [photo] }), now)).rejects.toThrow(/belum terunggah/);
    expect(removed).toEqual([[photo.key]]);
    expect(tables.wb_activities).toHaveLength(0);
  });

  it("waits for the migration", async () => {
    const photo = await photoFor(me);
    missingTables = true;
    expect(await refusal(logActivity(me, logSchema.parse({ code: "emotional.meditasi", date: "2026-11-17", note: "", photos: [photo] }), now))).toMatchObject({ status: 503, message: expect.stringMatching(/menunggu migrasi/) });
    expect(await refusal(startUpload(me, { mime: "image/jpeg", size: 1000 }, now))).toMatchObject({ status: 503 });
  });
});

describe("Beranda and Peringkat", () => {
  const activity = (employee: Member, date: string, points: number, dimension = "physical", status = "approved") =>
    ({ id: `${employee.id}-${date}-${points}`, employee_id: employee.id, type_code: "emotional.meditasi", dimension_id: dimension, happened_on: date, source: "manual", status, points, points_claimed: points, photos: [], created_at: `${date}T02:00:00Z`, title: "", note: "", type: { name: "Meditasi", kind: "daily" } });

  it("ranks this month among active employees, with last month's champion", async () => {
    tables.employees.push({ id: "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", full_name: "Contoh Tiga", nickname: "", department: "Finance", active: false });
    tables.wb_activities.push(
      activity(me, "2026-11-17", 300), activity(me, "2026-11-16", 200, "emotional"), activity(me, "2026-11-15", 999, "social", "rejected"),
      activity(other, "2026-11-10", 500), activity(other, "2026-10-20", 900),
      { ...activity(me, "2026-10-05", 100), employee_id: "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
    );
    const month = await leaderboard(me, "month", "all", now);
    expect(month.items.map(row => [row.name, row.rank, row.points])).toEqual([["Dua", 1, 500], ["Satu", 1, 500]]);
    expect(month).toMatchObject({ migrated: true, of: 2, me: { rank: 1, me: true }, lastMonthChampion: { name: "Dua", points: 900, rank: 1, me: false } });
    const emotional = await leaderboard(me, "month", "emotional", now);
    expect(emotional.items).toEqual([expect.objectContaining({ name: "Satu", points: 200 })]);
    expect(emotional.lastMonthChampion).toBeNull();
    const all = await leaderboard(other, "all", "all", now);
    expect(all.items.map(row => row.name)).toEqual(["Dua", "Satu"]);

    const beranda = await home(me, now);
    expect(beranda.totals).toMatchObject({ points: 500, monthPoints: 500, rank: 1, of: 2, streak: 2 });
    expect(beranda.dims).toMatchObject({ physical: 300, emotional: 200, social: 0 });
    expect(beranda.recent.map(item => item.date)).toEqual(["2026-11-17", "2026-11-16", "2026-11-15"]);
    expect(beranda.recent[2]).toMatchObject({ status: "rejected", points: 0, pointsClaimed: 999 });
    expect(beranda.rules).toEqual({ backdateDays: null, programStart: "2026-05-22", maxKcal: 3000, maxSteps: 60000, maxPhotos: 5 });
  });

  it("answers empty with migrated false before the migration", async () => {
    missingTables = true;
    expect(await home(me, now)).toMatchObject({ migrated: false, totals: { points: 0, rank: null, streak: 0 }, recent: [] });
    expect(await leaderboard(me, "month", "all", now)).toMatchObject({ migrated: false, items: [], me: null, of: 2 });
  });
});
