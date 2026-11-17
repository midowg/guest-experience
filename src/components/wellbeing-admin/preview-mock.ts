"use client";

import { defaultAppControls, monthRange, previousMonth, rank, wibToday, type AppControls, type DimensionId, type ReviewInput } from "@/lib/wellbeing/rules";
import type { WbActivity, WbCatalogItem, WbOverview, WbPeople, WbPersonDetail, WbPersonRow, WbSettingsView } from "@/lib/wellbeing/types";

/*
 * Admin Wellbeing on sample data (17 Nov 2026), for /dev-preview/wellbeing-admin only: the page's
 * requests to /api/admin/wellbeing are answered here, in memory, so every screen and action can be
 * seen without a session or a database. Every name is made up. Unduh Excel is the one thing it does
 * not make (the file comes from the server); it says so.
 */

const DIMS: DimensionId[] = ["physical", "emotional", "social", "financial", "spiritual"];
const zero = (): Record<DimensionId, number> => ({ physical: 0, emotional: 0, social: 0, financial: 0, spiritual: 0 });
const NAMES = [
  ["Raka Contoh", "Raka", "Event"], ["Bima Rekaan", "Bima", "Production"], ["Yoga Sampel", "Yoga", "Account"], ["Intan Contoh", "Intan", "Marketing"],
  ["Nadia Contoh", "Nadia", "Account"], ["Sinta Sampel", "Sinta", "GA"], ["Citra Sampel", "Citra", "Event"], ["Galih Rekaan", "Galih", "Creative"],
  ["Rizky Sampel", "Rizky", "Finance"], ["Ayu Rekaan", "Ayu", "Event"], ["Fajar Contoh", "Fajar", "Production"], ["Dewi Contoh", "Dewi", "Creative"],
] as const;
const people = NAMES.map(([name, nickname, department], index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, nickname, department, active: index !== 10 }));

/** A proof photo drawn in place (no network): a phone screen with a big number. */
const photo = (label: string, value: string, dark = false) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${dark ? "#121212" : "#f2f2f2"}"/><text x="24" y="70" font-family="Arial" font-size="26" fill="${dark ? "#fff" : "#111"}">${label}</text><text x="24" y="200" font-family="Arial" font-size="64" font-weight="700" fill="${dark ? "#fc4c02" : "#2a8a2a"}">${value}</text></svg>`)}`;

export function installAdminMock(options: { notReady?: boolean } = {}) {
  if (typeof window === "undefined" || (window as unknown as { __wbAdminMock?: boolean }).__wbAdminMock) return;
  (window as unknown as { __wbAdminMock?: boolean }).__wbAdminMock = true;
  const today = wibToday(), month = monthRange(today), last = previousMonth(today);
  const day = (back: number) => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - back); return date.toISOString().slice(0, 10); };
  const types: [string, string, DimensionId, "daily" | "sport", number][] = [
    ["sport.running", "Running", "physical", "sport", 0], ["sport.cycling", "Cycling", "physical", "sport", 0], ["sport.badminton", "Badminton", "physical", "sport", 0],
    ["physical.steps", "Langkah harian", "physical", "daily", 0], ["emotional.meditasi", "Meditasi", "emotional", "daily", 70], ["emotional.podcast", "Mendengarkan Podcast", "emotional", "daily", 80],
    ["social.buddy_program", "Buddy Program", "social", "daily", 80], ["financial.tabungan_emas", "Membuka Tabungan Emas", "financial", "daily", 150], ["spiritual.kajian", "Mengikuti Kajian Rohani", "spiritual", "daily", 80],
  ];
  let serial = 0;
  const activity = (who: number, code: string, back: number, extra: Partial<WbActivity> = {}): WbActivity => {
    const [typeCode, typeName, dimension, kind, fixed] = types.find(item => item[0] === code)!;
    const person = people[who];
    const points = extra.kcal ?? (extra.steps ? Math.floor(extra.steps / 10) : fixed);
    serial += 1;
    return {
      id: `10000000-0000-4000-8000-${String(serial).padStart(12, "0")}`, employeeId: person.id, employeeName: person.name, employeeNickname: person.nickname, department: person.department,
      typeCode, typeName, kind, dimension, date: day(back), time: null, source: "manual", title: typeName, steps: null, kcal: null, minutes: null, distanceM: null, note: "",
      photos: [photo(typeName, extra.kcal ? `${extra.kcal} kcal` : extra.steps ? `${extra.steps}` : "✓", kind === "sport")], pointsClaimed: points, points,
      status: "approved", reason: null, checked: false, reviewedBy: null, reviewedAt: null, createdAt: `${day(back)}T0${serial % 9}:15:00.000Z`, ...extra,
    };
  };
  const activities: WbActivity[] = [
    activity(11, "sport.running", 0, { kcal: 412, minutes: 28, distanceM: 5200, time: "06:05", title: "Morning Run", note: "Lari pagi keliling Renon" }),
    activity(3, "physical.steps", 0, { steps: 9128 }),
    activity(0, "sport.badminton", 0, { kcal: 520, minutes: 90, time: "16:30", note: "Main badminton bareng tim Event, tiga set lalu lanjut latihan smash dan drop shot sampai lapangan tutup" }),
    activity(5, "emotional.meditasi", 1, {}),
    activity(7, "sport.cycling", 1, { kcal: 618, minutes: 55, distanceM: 18400, source: "strava", photos: [] }),
    activity(2, "emotional.podcast", 1, { note: "Episode tentang kebiasaan tidur" }),
    activity(8, "financial.tabungan_emas", 2, {}),
    activity(9, "spiritual.kajian", 2, {}),
    activity(1, "sport.running", 2, { kcal: 300, minutes: 30 }),
    activity(4, "social.buddy_program", 3, { checked: true, reviewedBy: "Admin HR" }),
    activity(6, "sport.running", 3, { kcal: 900, minutes: 20, status: "adjusted", points: 250, reason: "Kalori disesuaikan dengan durasi di foto", checked: true, reviewedBy: "Admin HR" }),
    activity(10, "physical.steps", 4, { steps: 25000, status: "rejected", reason: "Foto bukan dari hari itu", checked: true, reviewedBy: "Admin HR" }),
  ];
  const settings: WbSettingsView = { migrated: true, backdateDays: 7, maxKcal: 3000, maxSteps: 60000, programStart: "2026-05-22", updatedBy: "Admin HR", updatedAt: new Date().toISOString(),
    app: { ...defaultAppControls, prize: "Juara 1 voucher Decathlon Rp250 rb" } as AppControls, appReady: !options.notReady };
  const catalog: WbCatalogItem[] = types.map(([code, name, dimension, kind, points], index) => ({ code, name, dimension, kind, mode: kind === "sport" ? "kcal" : code === "physical.steps" ? "steps" : "fixed", points, limit: code === "physical.steps" ? "day" : code.startsWith("financial") ? "month" : null, proofHint: "Foto, screenshot, atau bukti partisipasi", active: true, sortOrder: index }));

  const counted = (item: WbActivity) => item.status === "rejected" ? 0 : item.points;
  const rows = (period: "month" | "all"): WbPersonRow[] => rank(people.map((person, index) => {
    const mine = activities.filter(item => item.employeeId === person.id && (period === "all" || item.date >= month.from));
    const dims = zero();
    for (const item of mine) dims[item.dimension] += counted(item);
    const base = period === "all" ? 5000 - index * 300 : 1800 - index * 120;
    dims.physical += Math.max(0, base);
    return { id: person.id, name: person.name, nickname: person.nickname, department: person.department, active: person.active, activities: mine.length, dims, points: Object.values(dims).reduce((a, b) => a + b, 0) };
  }));
  const overview = (): WbOverview => {
    const ranked = rows("month");
    return { migrated: true, today, unchecked: activities.filter(item => !item.checked).length, uncheckedPreview: activities.filter(item => !item.checked).slice(0, 5), todayActivities: activities.filter(item => item.date === today).length,
      month: { ...month, points: ranked.reduce((sum, row) => sum + row.points, 0), people: ranked.filter(row => row.points > 0).length, activities: activities.length + 120 },
      lastMonth: { ...last, overall: ranked.slice(0, 3).map(row => ({ employeeId: row.id, name: row.name, nickname: row.nickname, department: row.department, points: row.points + 4000 })),
        byDimension: DIMS.map((dimension, index) => ({ dimension, employeeId: people[index].id, name: people[index].name, nickname: people[index].nickname, department: people[index].department, points: 900 - index * 120 })) },
      participants: people.filter(person => person.active).length };
  };
  const ok = (data: unknown, message = "OK") => new Response(JSON.stringify({ ok: true, data, message }), { headers: { "Content-Type": "application/json" } });
  const refuse = (status: number, message: string) => new Response(JSON.stringify({ ok: false, message }), { status, headers: { "Content-Type": "application/json" } });

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (!url.pathname.startsWith("/api/admin/wellbeing")) return original(input, init);
    await new Promise(resolve => setTimeout(resolve, 250));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    const path = url.pathname.slice("/api/admin/wellbeing".length);
    if (path === "/overview") return ok(overview());
    if (path === "/activities" && method === "GET") {
      const filter = url.searchParams.get("filter") ?? "unchecked", kind = url.searchParams.get("kind") ?? "all", q = (url.searchParams.get("q") ?? "").toLowerCase();
      const items = activities.filter(item => (filter === "unchecked" ? !item.checked : filter === "all" ? true : item.status === filter)
        && (kind === "all" || (kind === "strava" ? item.source === "strava" : item.kind === kind)) && (!q || `${item.employeeName} ${item.department}`.toLowerCase().includes(q)));
      return ok({ migrated: true, items, next: null, unchecked: activities.filter(item => !item.checked).length });
    }
    if (path === "/activities/check" && method === "POST") {
      const ids = body.ids as string[], checked = body.checked as boolean;
      const changed = activities.filter(item => ids.includes(item.id) && item.checked !== checked && (checked || item.status === "approved"));
      for (const item of changed) Object.assign(item, { checked, reviewedBy: checked ? "Admin (pratinjau)" : null });
      return ok({ changed: changed.map(item => item.id) }, checked ? `${changed.length} aktivitas ditandai sudah diperiksa.` : `${changed.length} aktivitas dikembalikan ke belum diperiksa.`);
    }
    const one = /^\/activities\/([0-9a-f-]+)$/.exec(path);
    if (one && method === "PATCH") {
      const item = activities.find(entry => entry.id === one[1]);
      if (!item) return refuse(404, "Aktivitas tidak ditemukan.");
      const next = body as unknown as ReviewInput;
      Object.assign(item, { status: next.status, points: next.points, reason: next.reason, checked: next.checked, reviewedBy: "Admin (pratinjau)" });
      return ok(item, next.status === "rejected" ? "Aktivitas ditolak." : next.status === "adjusted" ? "Poin diubah." : "Ditandai sudah diperiksa.");
    }
    if (path === "/people") { const period = url.searchParams.get("period") === "all" ? "all" : "month"; return ok({ migrated: true, period, from: period === "month" ? month.from : null, to: period === "month" ? month.to : null, rows: rows(period), departments: [...new Set(people.map(person => person.department))].sort() } satisfies WbPeople); }
    const person = /^\/people\/([0-9a-f-]+)$/.exec(path);
    if (person) {
      const who = people.find(entry => entry.id === person[1]);
      if (!who) return refuse(404, "Karyawan tidak ditemukan.");
      const all = rows("all").find(row => row.id === who.id)!, now = rows("month").find(row => row.id === who.id)!;
      return ok({ migrated: true, person: { ...who, position: "Staff" }, total: all.points, month: now.points, dims: all.dims, monthDims: now.dims, activities: activities.filter(item => item.employeeId === who.id), entries: [] } satisfies WbPersonDetail);
    }
    if (path === "/catalog") return ok({ migrated: true, items: catalog });
    if (path === "/settings" && method === "GET") return ok(settings);
    if (path === "/settings" && method === "PUT") { Object.assign(settings, body, { updatedBy: "Admin (pratinjau)", updatedAt: new Date().toISOString() }); return ok(settings, "Aturan disimpan."); }
    if (path === "/settings/app" && method === "PUT") {
      if (!settings.appReady) return refuse(503, "Kontrol aplikasi menunggu migrasi 202611170002_wellbeing_time_app.sql.");
      settings.app = body as unknown as AppControls; settings.updatedBy = "Admin (pratinjau)"; settings.updatedAt = new Date().toISOString();
      return ok(settings, "Pengaturan aplikasi karyawan disimpan.");
    }
    if (path === "/export") return refuse(501, "Pratinjau tanpa database: berkas Excel dibuat oleh server di admin sungguhan.");
    if (path === "/points" && method === "POST") return ok({ batchId: "20000000-0000-4000-8000-000000000001", count: (body.employeeIds as string[]).length, points: body.points }, "Poin ditambahkan (pratinjau).");
    return refuse(404, "Tidak ada di pratinjau.");
  };
}
