import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Laporan → Unduh Excel (17 Nov 2026) against a small in-memory stand-in for Supabase: the workbook
 * is written and read back, cell for cell. People are fictional.
 */
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let slice: [number, number] | null = null;
  const run = () => {
    let rows = (tables[table] ?? []).filter(row => filters.every(test => test(row)));
    if (slice) rows = rows.slice(slice[0], slice[1] + 1);
    return { data: rows, error: null };
  };
  const builder = {
    select: () => builder, order: () => builder,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
    gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
    lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return builder; },
    like: (key: string, pattern: string) => { filters.push(row => String(row[key]).startsWith(pattern.replace("%", ""))); return builder; },
    not: (key: string, _op: string, pattern: string) => { filters.push(row => !String(row[key]).startsWith(pattern.replace("%", ""))); return builder; },
    range: (from: number, to: number) => { slice = [from, to]; return builder; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return builder;
}
function totals(_name: string, args: { p_from: string | null; p_to: string | null }) {
  const sums = new Map<string, Row>();
  const within = (row: Row) => (!args.p_from || String(row.happened_on) >= args.p_from) && (!args.p_to || String(row.happened_on) <= args.p_to);
  for (const row of [...tables.wb_activities.filter(item => item.status !== "rejected"), ...tables.wb_point_entries.filter(item => !item.voided_at)].filter(within)) {
    const key = `${row.employee_id}|${row.dimension_id}`;
    const sum = sums.get(key) ?? { employee_id: row.employee_id, dimension_id: row.dimension_id ?? null, points: 0, activities: 0 };
    sum.points = (sum.points as number) + (row.points as number); sum.activities = (sum.activities as number) + (row.type_code ? 1 : 0);
    sums.set(key, sum);
  }
  const builder = { order: () => builder, range: () => builder, then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [...sums.values()], error: null }).then(resolve) };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => ({ from: query, rpc: totals }) }));
vi.mock("../admin-actor", () => ({ currentAdmin: async () => null }));
vi.mock("../r2", () => ({ isR2Configured: () => false, presignDownload: vi.fn() }));

const { exportSchema, exportWorkbook, periodOf } = await import("./export");
const { readXlsx } = await import("../xlsx");

const AYU = "11111111-1111-4111-8111-111111111111", BUDI = "22222222-2222-4222-8222-222222222222", CITRA = "33333333-3333-4333-8333-333333333333";
const person = (id: string, full_name: string, department: string, active = true) => ({ id, full_name, nickname: full_name.split(" ")[0], department, position: "Staff", active });
const activity = (id: string, employee_id: string, happened_on: string, extra: Row = {}): Row => ({
  id, employee_id, type_code: "sport.running", dimension_id: "physical", happened_on, happened_time: null, source: "manual", title: "Running", steps: null, kcal: 300, minutes: 30, distance_m: 5200,
  note: "", photos: ["wellbeing/x.jpg"], points_claimed: 300, points: 300, status: "approved", review_reason: null, checked: false, reviewed_by_name: null, reviewed_at: null,
  created_at: `${happened_on}T01:00:00Z`, type: { name: "Running", kind: "sport" }, person: { full_name: "", nickname: "", department: "" }, ...extra,
});
const now = new Date("2026-11-17T03:00:00Z");
const A1 = "a0000000-0000-4000-8000-000000000001", A2 = "a0000000-0000-4000-8000-000000000002", A3 = "a0000000-0000-4000-8000-000000000003", A4 = "a0000000-0000-4000-8000-000000000004";
const actor = { name: "Admin HR" };

beforeEach(() => {
  tables = {
    employees: [person(AYU, "Ayu Contoh", "Event"), person(BUDI, "Budi Contoh", "Finance"), person(CITRA, "Citra Contoh", "GA", false)],
    wb_activities: [
      activity(A1, AYU, "2026-11-03", { happened_time: "06:05:00", person: { full_name: "Ayu Contoh", nickname: "Ayu", department: "Event" } }),
      activity(A2, BUDI, "2026-11-10", { type_code: "emotional.meditasi", dimension_id: "emotional", kcal: null, minutes: null, distance_m: null, points_claimed: 70, points: 70, type: { name: "Meditasi", kind: "daily" }, person: { full_name: "Budi Contoh", nickname: "Budi", department: "Finance" } }),
      activity(A3, BUDI, "2026-11-11", { status: "rejected", review_reason: "Foto bukan hari itu", checked: true, reviewed_by_name: "Admin HR", person: { full_name: "Budi Contoh", nickname: "Budi", department: "Finance" } }),
      activity(A4, CITRA, "2026-10-20", { points_claimed: 900, points: 900, person: { full_name: "Citra Contoh", nickname: "Citra", department: "GA" } }),
    ],
    wb_point_entries: [
      { id: "p1", employee_id: BUDI, points: 500, dimension_id: "social", reason: "Kehadiran internal activities", happened_on: "2026-11-05", kind: "admin", created_by_name: "Admin HR", created_at: "2026-11-05T02:00:00Z", voided_at: null, voided_by_name: null },
      { id: "p2", employee_id: AYU, points: -50, dimension_id: null, reason: "Double input dengan Strava", happened_on: "2026-11-06", kind: "admin", created_by_name: "Admin HR", created_at: "2026-11-06T02:00:00Z", voided_at: "2026-11-07T00:00:00Z", voided_by_name: "Admin HR" },
    ],
  };
});

describe("Unduh Excel", () => {
  it("knows the periods", () => {
    expect(periodOf({ period: "month" }, "2026-11-17")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodOf({ period: "last_month" }, "2026-11-17")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodOf({ period: "range", from: "2026-11-02", to: "2026-11-09" }, "2026-11-17")).toEqual({ from: "2026-11-02", to: "2026-11-09" });
    expect(periodOf({ period: "all" }, "2026-11-17")).toEqual({ from: null, to: null });
    expect(exportSchema.safeParse({ data: "people", period: "range", from: "2026-11-09", to: "2026-11-02" }).success).toBe(false);
  });

  it("ranks points per employee for the month, with the dimensions, and says what the file holds", async () => {
    const { file, name } = await exportWorkbook(exportSchema.parse({ data: "people", period: "month" }), actor, now);
    expect(name).toBe("wellbeing-rekap-poin-2026-11-01_2026-11-30.xlsx");
    const [sheet, info] = readXlsx(file);
    expect(sheet.rows[0]).toEqual(["Peringkat", "Nama", "Nama panggilan", "Divisi", "Jabatan", "Status", "Total poin", "Fisik", "Emosional", "Sosial", "Finansial", "Spiritual", "Poin lain", "Aktivitas"]);
    // Budi: 70 (meditasi) + 500 (admin, social); the rejected run counts nothing. Ayu: 300, minus a voided -50 that does not count.
    expect(sheet.rows[1]).toEqual(["1", "Budi Contoh", "Budi", "Finance", "Staff", "Aktif", "570", "0", "70", "500", "0", "0", "0", "1"]);
    expect(sheet.rows[2].slice(0, 7)).toEqual(["2", "Ayu Contoh", "Ayu", "Event", "Staff", "Aktif", "300"]);
    // Citra is inactive and has no points this month: not listed.
    expect(sheet.rows).toHaveLength(3);
    expect(info.name).toBe("Keterangan");
    expect(info.rows.map(row => row[0])).toEqual(["Laporan", "Periode", "Saringan", "Jumlah baris", "Dibuat", "Oleh", "Sumber"]);
    expect(info.rows[1][1]).toBe("1 November 2026 – 30 November 2026");
    expect(info.rows[5][1]).toBe("Admin HR");
  });

  it("lists the activities as filtered, or exactly the ones ticked in Periksa", async () => {
    const month = readXlsx((await exportWorkbook(exportSchema.parse({ data: "activities", period: "month" }), actor, now)).file)[0];
    expect(month.rows.slice(1).map(row => row[0])).toEqual(["2026-11-03", "2026-11-10", "2026-11-11"]);
    expect(month.rows[1].slice(0, 5)).toEqual(["2026-11-03", "06:05", "Ayu Contoh", "Event", "Running"]);
    expect(month.rows[1][12]).toBe("5.2");
    expect(month.rows[3].slice(13, 18)).toEqual(["300", "0", "Ditolak", "Ya", "Foto bukan hari itu"]);

    const rejected = readXlsx((await exportWorkbook(exportSchema.parse({ data: "activities", period: "all", status: "rejected" }), actor, now)).file)[0];
    expect(rejected.rows.slice(1).map(row => row[0])).toEqual(["2026-11-11"]);

    // Ticked in Periksa: only those, whatever their date.
    const picked = await exportWorkbook(exportSchema.parse({ data: "activities", period: "month", ids: [A4] }), actor, now);
    const [list, info] = readXlsx(picked.file);
    expect(list.rows.slice(1).map(row => row[0])).toEqual(["2026-10-20"]);
    expect(info.rows[1][1]).toBe("-");
    expect(info.rows[2][1]).toBe("1 aktivitas yang dipilih di Periksa");
    expect(picked.name).toMatch(/^wellbeing-aktivitas-pilihan-2026-11-17\.xlsx$/);
  });

  it("lists the points from an admin, with who gave them and what was voided", async () => {
    const sheet = readXlsx((await exportWorkbook(exportSchema.parse({ data: "points", period: "month" }), actor, now)).file)[0];
    expect(sheet.rows[1]).toEqual(["2026-11-05", "Budi Contoh", "Finance", "500", "Sosial", "Kehadiran internal activities", "Admin", "Admin HR", "Tidak", expect.any(String)]);
    expect(sheet.rows[2].slice(0, 4)).toEqual(["2026-11-06", "Ayu Contoh", "Event", "-50"]);
    expect(sheet.rows[2][8]).toBe("Ya (Admin HR)");
  });
});
