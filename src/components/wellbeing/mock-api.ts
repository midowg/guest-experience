"use client";

import type { WbAppCatalog, WbAppControls, WbBoard, WbBoardRow, WbCatalogDaily, WbCatalogSport, WbClaim, WbHome, WbLedger, WbLedgerItem, WbLogInput, WbMe, WbMyActivity, WbMyActivityFilter, WbReward, WbRewards, WbRules, WbSaldo, WbStrava, WbStravaSync } from "@/lib/wellbeing/app-types";
import { addDays, aroundMe, claimedPoints, claimHolds, dateProblem, dimensionLabels, DIMENSIONS, limitReached, MIN_STEPS, monthRange, rank, rewardState, saldoOf, wibToday, type Delivery, type DimensionId, type Limit, type RewardKind } from "@/lib/wellbeing/rules";
import { cancelledError, WellbeingApiError, type BoardDim, type BoardPeriod, type RequestOptions, type WellbeingApi } from "./api";
import type { CardView } from "@/lib/server/pra-wam/cards";

/*
 * Sample data for /dev-preview/wellbeing (17 Nov 2026): the whole Wellbeing app without a session
 * or a database. Everything lives in memory for the visit; logging an activity changes Beranda,
 * Riwayat, Peringkat and Profil at once, as the real API would. Every name here is made up.
 * Never used outside the dev preview.
 */

export type MockOptions = {
  /** 1.5 to 3 seconds per answer instead of 0.3 to 0.8. */
  slow?: boolean;
  /** About a third of the calls fail (to see Coba lagi). */
  fail?: boolean;
  /** A brand-new person: no activities, no points yet. */
  empty?: boolean;
  /** Yesterday has a Running from Strava, so logging Running for yesterday answers strava_twin. */
  stravaTwin?: boolean;
  /** What Keluar does in the preview. */
  onSignOut?: () => void;
  /** Milliseconds per answer, low and high (tests use [0, 0]). */
  latency?: [number, number];
  /** Before the database migration: every answer says migrated: false. */
  notReady?: boolean;
  /** What Admin Wellbeing → Aplikasi karyawan has set (17 Nov 2026); defaults without it. */
  controls?: Partial<WbAppControls>;
  /** Nothing logged today yet: the streak runs to yesterday and its flame is off (18 Nov 2026). */
  notToday?: boolean;
  /** No WAM character card yet (the questionnaire not finished), for Foto profil (18 Nov 2026). */
  noCard?: boolean;
  /** Voucher re-roll (18 Nov 2026): every Legendary place is taken, so the Legendary voucher cannot be claimed. */
  legendFull?: boolean;
  /** Jenis hadiah (18 Nov 2026): how the re-roll voucher is handed over (automatic unless said). */
  rerollDelivery?: Delivery;
  /** Strava (18 Nov 2026): not set up by the office yet, not connected (the default), connected, or refused by Strava. */
  strava?: "off" | "none" | "ok" | "reconnect";
};

/** A sample WAM character card (a figure picture shipped in public/figur), for Foto profil. */
export const sampleCard = (): CardView => ({
  serial: 7, trial: false, dna: "a1b2c3d4e5", drawnAt: "2026-11-13T03:00:00.000Z",
  character: { id: "penyihir", key: "penyihir", name: "Penyihir Ide", figure: "", class: "Penyihir Ide", title: "Yang mengubah ide biasa jadi luar biasa", description: "", powers: [], image: null, partner: null },
  tier: { key: "rare", name: "Rare", color: "#449DFF", line: "", odds: 1800, sort: 2 },
  background: { number: 1, name: "", image: null }, accent: { number: 1, name: "", image: null }, stickers: [],
  figure: { id: "ada-lovelace", key: "ada-lovelace", name: "Ada Lovelace", costume: "", quote: null, image: "/figur/ada-lovelace.webp", legend: false, legendClass: null },
  reason: null, colors: ["#6D3FD1", "#24124F"],
});

export const sampleMe: WbMe = { id: "00000000-0000-4000-8000-0000000000aa", name: "Dewi Contoh", nickname: "Dewi", department: "Creative", position: "Graphic Designer" };

const RULES: WbRules = { backdateDays: 7, maxKcal: 3000, maxSteps: 60000, maxPhotos: 5 };
const PROOF = "Foto, screenshot, atau bukti partisipasi";
type DailyType = Omit<WbCatalogDaily, "blocked" | "loggedOn">;
const daily = (code: string, dimension: DimensionId, name: string, points: number, proofHint = PROOF, limit: Limit | null = null): DailyType =>
  ({ code, dimension, name, mode: "fixed", points, limit, proofHint });
const DAILY: DailyType[] = [
  { code: "physical.steps", dimension: "physical", name: "Langkah harian", mode: "steps", points: 0, limit: "day", proofHint: "Screenshot jumlah langkah dari aplikasi ponsel" },
  daily("emotional.konsultasi", "emotional", "Konsultasi / Coaching / Mentoring", 150),
  daily("emotional.film_dokumenter", "emotional", "Menonton Film / Dokumenter (1,5-2,5 jam)", 100),
  daily("emotional.sharing_session", "emotional", "Sharing Session", 80),
  daily("emotional.seminar_mental_health", "emotional", "Seminar Mengenai Mental Health", 120),
  daily("emotional.meditasi", "emotional", "Meditasi", 70),
  daily("emotional.baca_buku", "emotional", "Membaca 1 Buku Fisik (Novel, Fiction, Biography, Komik)", 300, `${PROOF} dan rangkuman`),
  daily("emotional.baca_ebook", "emotional", "Membaca 1 Buku E-Book (Novel, Fiction, Biography, Komik)", 300, `${PROOF} dan rangkuman`),
  daily("emotional.podcast", "emotional", "Mendengarkan Podcast", 80, `${PROOF} dan rangkuman`),
  daily("emotional.lainnya", "emotional", "Lainnya (emosional)", 50, `${PROOF}, dan ceritakan kegiatannya di catatan`),
  daily("social.hobi", "social", "Penyaluran Hobi / Minat Non Physical, Non Spiritual", 150),
  daily("social.donor_darah", "social", "Donor Darah", 200, "Kartu donor atau sertifikat"),
  daily("social.buddy_program", "social", "Buddy Program", 80),
  daily("social.training", "social", "Mengikuti Training Hard Skills & Soft Skills", 120, "Sertifikat atau foto kegiatan dan rangkuman"),
  daily("social.lainnya", "social", "Lainnya (sosial)", 50, `${PROOF}, dan ceritakan kegiatannya di catatan`),
  daily("financial.tabungan_emas", "financial", "Membuka Tabungan Emas", 150, "Screenshot/bukti transaksi", "month"),
  daily("financial.deposito", "financial", "Membuka Tabungan Deposito", 300, "Screenshot/bukti transaksi", "month"),
  daily("financial.saham", "financial", "Membuka Tabungan Saham / Reksadana", 300, "Screenshot/bukti transaksi", "month"),
  daily("financial.program_tabungan", "financial", "Membuat Program Tabungan Tertentu", 300, PROOF, "month"),
  daily("financial.asuransi", "financial", "Membeli Asuransi (di Luar BPJS)", 300, "Screenshot/bukti transaksi", "month"),
  daily("financial.koperasi", "financial", "Mengikuti Koperasi", 300, PROOF, "month"),
  daily("financial.lainnya", "financial", "Lainnya (finansial)", 50, `${PROOF}, dan ceritakan kegiatannya di catatan`),
  daily("spiritual.kajian", "spiritual", "Mengikuti Kajian Rohani", 80),
  daily("spiritual.pelayanan", "spiritual", "Pelayanan", 100),
  daily("spiritual.bakti_sosial", "spiritual", "Bakti Sosial", 100),
  daily("spiritual.hari_besar", "spiritual", "Perayaan Hari Besar Keagamaan", 80),
  daily("spiritual.donasi", "spiritual", "Donasi", 100),
  daily("spiritual.lainnya", "spiritual", "Lainnya (spiritual)", 50, `${PROOF}, dan ceritakan kegiatannya di catatan`),
];
const SPORT_HINT = "Foto layar jam atau aplikasi yang menunjukkan kalori";
const SPORTS: WbCatalogSport[] = [
  ["running", "Running"], ["walking", "Walking"], ["cycling", "Cycling"], ["swimming", "Swimming"], ["workout", "Workout"], ["yoga", "Yoga"],
  ["badminton", "Badminton"], ["zumba", "Zumba"], ["aerobik", "Aerobik"], ["futsal", "Futsal"], ["hiking", "Hiking"], ["lainnya", "Lainnya"],
].map(([code, name]) => ({ code: `sport.${code}`, name, proofHint: SPORT_HINT }));

/** A steady random sequence, so the sample looks the same on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A stand-in proof photo (no network): a tinted square with words. */
function samplePhoto(label: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="hsl(${hue} 45% 86%)"/><text x="240" y="230" font-family="sans-serif" font-size="34" font-weight="600" text-anchor="middle" fill="hsl(${hue} 40% 32%)">Foto contoh</text><text x="240" y="276" font-family="sans-serif" font-size="22" text-anchor="middle" fill="hsl(${hue} 40% 32%)">${label.replace(/[<&>"]/g, "").slice(0, 30)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const photos = (count: number, label: string, seed: number) => Array.from({ length: count }, (_, index) => samplePhoto(label, (seed * 47 + index * 61) % 360));

type Person = { id: string; name: string; department: string; month: Record<DimensionId, number>; all: Record<DimensionId, number>; lastMonth: Record<DimensionId, number> };
const FIRST = ["Raka", "Sinta", "Bima", "Nadia", "Yoga", "Ayu", "Fajar", "Citra", "Galih", "Intan", "Rizky", "Maya", "Dimas", "Laras", "Hendra", "Tari", "Bayu", "Putri", "Arif", "Wulan", "Eko", "Rani", "Teguh", "Sari", "Joko", "Lina", "Agus", "Mira"];
const LAST = ["Contoh", "Sampel", "Rekaan"];
const DEPARTMENTS = ["Event", "Finance", "Production", "HR", "Sales", "Marketing", "IT", "Creative", "GA", "Account"];

function split(total: number, random: () => number): Record<DimensionId, number> {
  const weights = DIMENSIONS.map((dimension, index) => (index === 0 ? 1.4 : 0.3) + random());
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(DIMENSIONS.map((dimension, index) => [dimension, Math.round(total * weights[index] / sum)])) as Record<DimensionId, number>;
}

function seedPeople(): Person[] {
  const random = seeded(20261117);
  return FIRST.map((first, index) => {
    const month = Math.round(13200 * (1 - index / 31) * (0.82 + random() * 0.36));
    const all = Math.round(month * (3.2 + random() * 2.2) + 4000);
    const lastMonth = Math.round(14800 * (1 - index / 29) * (0.7 + random() * 0.6));
    return {
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `${first} ${LAST[index % LAST.length]}`,
      department: DEPARTMENTS[Math.floor(random() * DEPARTMENTS.length)],
      month: split(month, random), all: split(all, random), lastMonth: split(lastMonth, random),
    };
  });
}

type Admin = { date: string; title: string; points: number; dimension: DimensionId | null };

function seedActivities(today: string, stravaTwin: boolean): WbMyActivity[] {
  const random = seeded(4242);
  const list: WbMyActivity[] = [];
  let serial = 0;
  const typeOf = (code: string) => DAILY.find(item => item.code === code);
  const createdAt = (date: string) => {
    serial += 1;
    const hour = 7 + Math.floor(random() * 13), minute = Math.floor(random() * 60);
    // Never later than now (today's sample sits before anything logged in the preview).
    const at = Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`) + serial * 1000;
    return new Date(Math.min(at, Date.now() - (60 - serial % 60) * 60_000)).toISOString();
  };
  const base = (daysBack: number) => {
    const date = addDays(today, -daysBack);
    return { id: `act-${String(list.length + 1).padStart(4, "0")}`, date, time: null as string | null, source: (daysBack > 10 ? "import" : "manual") as WbMyActivity["source"], createdAt: createdAt(date), note: "", reason: null, status: "approved" as const, distanceM: null, minutes: null, steps: null, kcal: null };
  };
  const addDaily = (daysBack: number, code: string, extra: Partial<WbMyActivity> & { photoCount?: number } = {}) => {
    const type = typeOf(code)!;
    const { photoCount = 1, ...rest } = extra;
    const claimed = type.mode === "steps" ? claimedPoints("steps", 0, { steps: rest.steps ?? 0 }, RULES) : type.points;
    list.push({ ...base(daysBack), typeCode: code, typeName: type.name, kind: "daily", dimension: type.dimension, title: type.name,
      photos: photos(photoCount, type.name, list.length), pointsClaimed: claimed, points: claimed, ...rest });
  };
  const addSport = (daysBack: number, sport: string, title: string, kcal: number, extra: Partial<WbMyActivity> = {}) => {
    const type = SPORTS.find(item => item.code === `sport.${sport}`)!;
    const claimed = Math.min(kcal, RULES.maxKcal);
    const isStrava = extra.source === "strava";
    list.push({ ...base(daysBack), typeCode: type.code, typeName: type.name, kind: "sport", dimension: "physical", title, kcal,
      photos: isStrava ? [] : photos(1, title, list.length), pointsClaimed: claimed, points: claimed, ...extra });
  };

  // The last week, by hand: every state the screens show.
  addSport(0, "running", "Lari pagi", 412, { minutes: 34, distanceM: 5200, time: "06:05" });
  addDaily(0, "emotional.meditasi");
  addDaily(1, "physical.steps", { steps: 9120 });
  addDaily(1, "spiritual.kajian");
  addSport(2, "cycling", "Gowes sore", 618, { minutes: 55, distanceM: 18400 });
  addDaily(2, "emotional.podcast", { note: "Podcast soal kebiasaan tidur." });
  addDaily(3, "social.buddy_program");
  addSport(3, "badminton", "Badminton", 450, { minutes: 60, points: 300, status: "adjusted", reason: "Kalori disesuaikan dengan durasi 60 menit di foto." });
  addDaily(4, "financial.tabungan_emas");
  addDaily(5, "emotional.baca_buku", { note: "Rangkuman ada di foto kedua.", photoCount: 2 });
  addDaily(5, "physical.steps", { steps: 7400 });
  addDaily(6, "social.hobi", { status: "rejected", points: 0, reason: "Foto bukti tidak terbaca. Silakan catat ulang dengan foto yang jelas." });
  addSport(6, "swimming", "Swimming", 380, { minutes: 40 });
  addSport(7, "yoga", "Yoga", 210, { minutes: 50 });
  addDaily(8, "physical.steps", { steps: 11250, points: 900, status: "adjusted", reason: "Langkah di screenshot 9.000, bukan 11.250." });
  addDaily(9, "spiritual.donasi");

  // Before that: a steady mix, from the old app (source "import").
  const fixed = DAILY.filter(item => item.mode === "fixed" && !item.limit);
  const sports = SPORTS.filter(item => item.code !== "sport.lainnya");
  for (let daysBack = 10; daysBack <= 56; daysBack++) {
    if (random() < 0.22) continue;
    if (random() < 0.6) addDaily(daysBack, "physical.steps", { steps: 5000 + Math.round(random() * 7000) });
    if (random() < 0.45) { const sport = sports[Math.floor(random() * sports.length)]; addSport(daysBack, sport.code.slice(6), sport.name, 180 + Math.round(random() * 520), { minutes: 25 + Math.round(random() * 60) }); }
    if (random() < 0.35) addDaily(daysBack, fixed[Math.floor(random() * fixed.length)].code);
  }
  addDaily(23, "social.donor_darah", { status: "rejected", points: 0, reason: "Sudah tercatat (dobel)." });
  // Strava, before its old link stopped in July 2026.
  [["running", "Lari sore", 356, 6100], ["cycling", "Gowes pagi", 540, 21300], ["running", "Long run", 690, 8800]].forEach(([sport, title, kcal, meters], index) =>
    addSport(127 + index * 3, sport as string, title as string, kcal as number, { source: "strava", distanceM: meters as number, minutes: 30 + index * 12 }));
  if (stravaTwin) addSport(1, "running", "Lari pagi", 402, { source: "strava", distanceM: 5000, minutes: 33 });
  return list;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(cancelledError()); return; }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(cancelledError()); }, { once: true });
});
/** Riwayat's order on the server: newest day first, then newest logged, then id. */
const historyOrder = (a: WbMyActivity, b: WbMyActivity) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export function mockApi(options: MockOptions = {}): WellbeingApi {
  const today = wibToday();
  const people = seedPeople();
  const activities: WbMyActivity[] = options.empty ? [] : seedActivities(today, !!options.stravaTwin).filter(item => !options.notToday || item.date !== today);
  const admin: Admin[] = options.empty ? [] : [{ date: addDays(today, -12), title: "Hadir Friday Sharing", points: 100, dimension: "social" }];
  const importBase = options.empty ? 0 : 6150;
  let uploads = 0;

  async function call<T>(answer: () => T, failChance = 0.35, request?: RequestOptions): Promise<T> {
    const [low, high] = options.latency ?? (options.slow ? [1500, 3000] : [300, 800]);
    await sleep(low + Math.random() * (high - low), request?.signal);
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new WellbeingApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
    if (options.fail && Math.random() < failChance) throw new WellbeingApiError("Server belum bisa dihubungi. Coba lagi sebentar.", 503);
    return clone(answer());
  }

  const counted = () => activities.filter(item => item.status !== "rejected");
  const month = monthRange(today);
  const inMonth = (date: string) => date >= month.from && date <= month.to;
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const myDims = (period: BoardPeriod) => {
    const out = Object.fromEntries(DIMENSIONS.map(dimension => [dimension, 0])) as Record<DimensionId, number>;
    for (const item of counted()) if (period === "all" || inMonth(item.date)) out[item.dimension] += item.points;
    for (const entry of admin) if (entry.dimension && (period === "all" || inMonth(entry.date))) out[entry.dimension] += entry.points;
    return out;
  };
  const myPoints = (period: BoardPeriod, dim: BoardDim) => {
    const dims = myDims(period);
    if (dim !== "all") return dims[dim];
    const loose = sum(admin.filter(entry => !entry.dimension && (period === "all" || inMonth(entry.date))).map(entry => entry.points));
    return sum(Object.values(dims)) + loose + (period === "all" ? importBase : 0);
  };
  const dayPoints = (date: string) => sum(counted().filter(item => item.date === date).map(item => item.points)) + sum(admin.filter(entry => entry.date === date).map(entry => entry.points));

  function board(period: BoardPeriod, dim: BoardDim): WbBoard {
    const pointsOf = (person: Person) => { const dims = period === "month" ? person.month : person.all; return dim === "all" ? sum(Object.values(dims)) : dims[dim]; };
    const rows = people.map(person => ({ employeeId: person.id, name: person.name, department: person.department, points: pointsOf(person), me: false }));
    const mine = myPoints(period, dim);
    if (mine > 0) rows.push({ employeeId: sampleMe.id, name: sampleMe.name, department: sampleMe.department, points: mine, me: true });
    const ranked: WbBoardRow[] = rank(rows);
    const champions = rank(people.map(person => ({ employeeId: person.id, name: person.name, department: person.department, me: false,
      points: dim === "all" ? sum(Object.values(person.lastMonth)) : person.lastMonth[dim] })));
    return { migrated: true, period, dim, items: ranked, me: ranked.find(row => row.me) ?? null, of: people.length + 1, lastMonthChampion: champions[0] ?? null, ...aroundMe(ranked) };
  }

  function streak() {
    let day = today, count = 0;
    if (!counted().some(item => item.date === day)) day = addDays(day, -1);
    while (counted().some(item => item.date === day)) { count += 1; day = addDays(day, -1); }
    return count;
  }

  function totals(): WbHome["totals"] {
    const monthPoints = myPoints("month", "all");
    return {
      points: myPoints("all", "all"), monthPoints,
      rank: monthPoints > 0 ? board("month", "all").me?.rank ?? null : null, of: people.length + 1,
      streak: streak(),
      week: Array.from({ length: 7 }, (_, index) => { const date = addDays(today, index - 6); return { date, points: dayPoints(date) }; }),
    };
  }
  const newest = () => [...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const loggedDates = (code: string) => counted().filter(item => item.typeCode === code).map(item => item.date);
  // As the server: only a monthly limit blocks a type; one per day is told by loggedOn.
  const blockedText = "Sudah dicatat bulan ini. Kegiatan ini hanya sekali sebulan.";
  const notReady = !!options.notReady;
  const controls: WbAppControls = { announcement: null, prize: null, photoReading: true, pausedMessage: null, ...options.controls };
  const strava = { state: options.strava ?? "none", lastSyncAt: options.strava === "ok" ? new Date(Date.now() - 25 * 60_000).toISOString() : null as string | null };
  const stravaNow = (): WbStrava => strava.state === "off"
    ? { ready: false, connected: false, status: null, athleteName: "", connectedAt: null, lastSyncAt: null, lastError: null, private: false }
    : strava.state === "none" ? { ready: true, connected: false, status: null, athleteName: "", connectedAt: null, lastSyncAt: null, lastError: null, private: false }
    : { ready: true, connected: true, status: strava.state === "reconnect" ? "reconnect" : "ok", athleteName: "Dewi C.", connectedAt: "2026-11-03T02:00:00.000Z", lastSyncAt: strava.lastSyncAt,
      lastError: strava.state === "reconnect" ? "Strava menolak sambungan (dicabut atau kedaluwarsa). Sambungkan ulang." : null, private: true };

  // Hadiah (18 Nov 2026): sample prizes, others' claims (taken), and my claims; the saldo follows my all-time points.
  const rewardItems = [
    { id: "00000000-0000-4000-8000-0000000000b1", title: "Voucher Decathlon Rp250.000", description: "Voucher belanja Decathlon, bisa dipakai di semua toko Decathlon Indonesia.\nBerlaku 6 bulan sejak diserahkan.",
      photos: photos(2, "Voucher Decathlon", 3), cost: 35000, stock: 4 as number | null, taken: 1, perPerson: 1 },
    { id: "00000000-0000-4000-8000-0000000000b2", title: "Tumbler Hydro Flask 32 oz", description: "Botol minum baja tahan karat, menjaga dingin 24 jam. Warna dipilih saat penyerahan.",
      photos: photos(3, "Tumbler", 7), cost: 30000, stock: 2, taken: 0, perPerson: 1 },
    { id: "00000000-0000-4000-8000-0000000000b3", title: "Kelas yoga satu bulan", description: "Empat kali kelas yoga di studio mitra kantor.", photos: photos(1, "Kelas yoga", 11), cost: 15000, stock: null, taken: 3, perPerson: 2 },
    { id: "00000000-0000-4000-8000-0000000000b4", title: "Jam olahraga Garmin", description: "Jam pintar untuk lari dan bersepeda, lengkap dengan GPS.", photos: photos(2, "Garmin", 17), cost: 300000, stock: 1, taken: 0, perPerson: 1 },
    // Voucher re-roll (18 Nov 2026): claimed at once, used on the tokoh card.
    { id: "00000000-0000-4000-8000-0000000000b5", title: "Voucher re-roll tokoh", description: "Undi ulang tokoh kartu WAM-mu sekali. Rarity juga diundi ulang.", photos: [] as string[], cost: 5000, stock: null, taken: 6, perPerson: 3, kind: "reroll" as RewardKind, delivery: options.rerollDelivery ?? "auto" as Delivery },
    { id: "00000000-0000-4000-8000-0000000000b6", title: "Voucher re-roll Legendary", description: "Undi ulang tokoh kartu WAM-mu, rarity pasti Legendary.", photos: [] as string[], cost: 25000, stock: 3, taken: 1, perPerson: 1, kind: "reroll_legendary" as RewardKind, delivery: "auto" as Delivery },
    // Jenis hadiah dan voucher kode (18 Nov 2026): a code voucher received at once, a link voucher, money approved at once.
    { id: "00000000-0000-4000-8000-0000000000b7", title: "Voucher kopi Rp50.000", description: "Kopi atau teh di kedai mitra kantor.", photos: [] as string[], cost: 5000, stock: 8 as number | null, taken: 3, perPerson: 2,
      kind: "voucher" as RewardKind, delivery: "auto" as Delivery, validUntil: addDays(today, 40), howTo: "Tunjukkan kode di kasir sebelum membayar.", codes: ["KOPI-3M9Q", "KOPI-8H2K"] },
    { id: "00000000-0000-4000-8000-0000000000b8", title: "Diskon toko olahraga 20%", description: "Potongan 20% belanja online di toko mitra.", photos: [] as string[], cost: 8000, stock: null, taken: 2, perPerson: 1,
      kind: "voucher" as RewardKind, delivery: "auto" as Delivery, validUntil: null, howTo: "Buka link, lalu masuk dengan email kantor.", codes: ["https://toko.example/promo/WLM20"] },
    { id: "00000000-0000-4000-8000-0000000000b9", title: "Saldo e-wallet Rp200.000", description: "Ditransfer ke e-wallet dalam 3 hari kerja.", photos: [] as string[], cost: 25000, stock: 5, taken: 1, perPerson: 1, kind: "uang" as RewardKind, delivery: "approved" as Delivery },
  ].map(item => ({ kind: "barang" as RewardKind, delivery: "admin" as Delivery, validUntil: null as string | null, howTo: "", codes: [] as string[], ...item }));
  const claims: WbClaim[] = notReady || options.empty ? [] : [{
    id: "00000000-0000-4000-8000-0000000000c1", rewardId: rewardItems[2].id, title: rewardItems[2].title, photo: rewardItems[2].photos[0], cost: 15000, status: "delivered", note: "",
    reason: null, createdAt: `${addDays(today, -20)}T03:00:00.000Z`, decidedAt: `${addDays(today, -19)}T03:00:00.000Z`, deliveredAt: `${addDays(today, -18)}T03:00:00.000Z`, voucher: null,
    kind: "barang", code: null, validUntil: null, howTo: "",
  }, {
    id: "00000000-0000-4000-8000-0000000000c2", rewardId: rewardItems[6].id, title: rewardItems[6].title, photo: null, cost: 5000, status: "delivered", note: "",
    reason: null, createdAt: `${addDays(today, -3)}T03:00:00.000Z`, decidedAt: `${addDays(today, -3)}T03:00:00.000Z`, deliveredAt: `${addDays(today, -3)}T03:00:00.000Z`, voucher: null,
    kind: "voucher", code: "KOPI-7QX2", validUntil: rewardItems[6].validUntil, howTo: rewardItems[6].howTo,
  }];
  const blockedOf = (kind: RewardKind) => kind !== "reroll" && kind !== "reroll_legendary" ? null : options.noCard ? "no_card" as const : kind === "reroll_legendary" && options.legendFull ? "legend_full" as const : null;
  const saldo = (): WbSaldo => saldoOf(myPoints("all", "all"), claims);
  const rewardView = (item: (typeof rewardItems)[number]): WbReward => {
    const mine = claims.filter(claim => claim.rewardId === item.id && claimHolds(claim.status)).length, taken = item.taken + mine;
    return { id: item.id, title: item.title, description: item.description, photos: item.photos, cost: item.cost, kind: item.kind, delivery: item.delivery, validUntil: item.validUntil, howTo: item.howTo,
      left: item.stock === null ? null : Math.max(0, item.stock - taken), perPerson: item.perPerson, mine,
      state: rewardState({ cost: item.cost, stock: item.stock, taken, perPerson: item.perPerson, mine, available: saldo().available, blocked: blockedOf(item.kind) }) };
  };

  return {
    home: () => call(() => ({ migrated: !notReady, me: sampleMe, today, totals: totals(), dims: myDims("month"), recent: notReady ? [] : newest().slice(0, 5), rules: RULES, controls })),
    catalog: () => call<WbAppCatalog>(() => notReady ? { migrated: false, today, rules: RULES, sports: [], daily: [], controls } : ({
      migrated: true, today, rules: RULES, sports: SPORTS, controls,
      daily: DAILY.map(item => ({
        ...item,
        blocked: item.limit === "month" && limitReached("month", today, loggedDates(item.code)) ? blockedText : null,
        loggedOn: [...new Set(loggedDates(item.code).filter(date => date >= addDays(today, -RULES.backdateDays)))].sort(),
      })),
    })),
    activities: (filter: WbMyActivityFilter, before?: string) => call(() => {
      if (notReady) return { migrated: false, items: [], next: null };
      const all = [...activities].sort(historyOrder).filter(item => filter === "all" || (filter === "daily" && item.kind === "daily")
        || (filter === "sport" && item.kind === "sport" && item.source !== "strava") || (filter === "strava" && item.source === "strava"));
      // The cursor is opaque to the app; here it is the last item's id.
      let start = 0;
      if (before) {
        const at = all.findIndex(item => `c:${item.id}` === before);
        if (at < 0) throw new WellbeingApiError("Halaman tidak dikenal. Muat ulang daftarnya.", 422, { before: ["Halaman tidak dikenal."] });
        start = at + 1;
      }
      const items = all.slice(start, start + 20);
      return { migrated: true, items, next: all.length > start + 20 ? `c:${items[items.length - 1].id}` : null };
    }),
    activity: id => call(() => {
      const found = activities.find(item => item.id === id);
      if (!found) throw new WellbeingApiError("Aktivitas tidak ditemukan.", 404);
      return found;
    }, 0.15),
    startUpload: ({ mime, size }, request) => call(() => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new WellbeingApiError("Foto harus JPG, PNG, atau WebP.", 422, { mime: ["Foto harus JPG, PNG, atau WebP."] });
      if (size > 8 * 1024 * 1024) throw new WellbeingApiError("Foto lebih dari 8 MB.", 422, { size: ["Foto lebih dari 8 MB."] });
      uploads += 1;
      const key = `mock/${uploads}`;
      return { key, uploadUrl: `mock:${key}`, token: `mock-token-${uploads}` };
    }, 0.25, request),
    log: (input: WbLogInput, request) => call(() => {
      if (controls.pausedMessage) throw new WellbeingApiError(controls.pausedMessage, 503);
      const dailyType = DAILY.find(item => item.code === input.code);
      const sportType = SPORTS.find(item => item.code === input.code);
      if (!dailyType && !sportType) throw new WellbeingApiError("Jenis kegiatan tidak dikenal.", 422);
      const datePro = dateProblem(input.date, today, RULES.backdateDays);
      if (datePro) throw new WellbeingApiError(datePro, 422, { date: [datePro] });
      if (input.photos.length < 1) throw new WellbeingApiError("Tambahkan minimal 1 foto bukti.", 422, { photos: ["Tambahkan minimal 1 foto bukti."] });
      if (input.photos.length > RULES.maxPhotos) throw new WellbeingApiError(`Maksimal ${RULES.maxPhotos} foto.`, 422, { photos: [`Maksimal ${RULES.maxPhotos} foto.`] });
      const note = input.note.trim().slice(0, 300);
      let activity: WbMyActivity;
      const common = { id: `act-new-${Date.now()}`, date: input.date, time: input.time ?? null, source: "manual" as const, note, reason: null, status: "approved" as const, distanceM: null, createdAt: new Date().toISOString() };
      if (dailyType) {
        if (dailyType.limit === "month" && limitReached("month", input.date, loggedDates(dailyType.code))) throw new WellbeingApiError(`${dailyType.name}: sudah dicatat bulan itu.`, 409, { code: ["limit"] });
        // One per day for every daily type.
        if (loggedDates(dailyType.code).includes(input.date)) throw new WellbeingApiError("Kegiatan ini sudah dicatat di tanggal yang sama.", 409, { code: ["same_day"] });
        const steps = dailyType.mode === "steps" ? Number(input.steps) : null;
        if (steps !== null && !(Number.isInteger(steps) && steps >= MIN_STEPS && steps <= RULES.maxSteps)) throw new WellbeingApiError("Jumlah langkah tidak valid.", 422, { steps: [`Langkah minimal ${MIN_STEPS}, paling banyak ${RULES.maxSteps.toLocaleString("id-ID")}.`] });
        const points = claimedPoints(dailyType.mode, dailyType.points, { steps }, RULES);
        activity = { ...common, typeCode: dailyType.code, typeName: dailyType.name, kind: "daily", dimension: dailyType.dimension, title: dailyType.name, steps, kcal: null, minutes: null,
          photos: photos(input.photos.length, dailyType.name, activities.length), pointsClaimed: points, points };
      } else {
        const type = sportType!;
        const kcal = Number(input.kcal);
        if (!(Number.isInteger(kcal) && kcal >= 1 && kcal <= RULES.maxKcal)) throw new WellbeingApiError("Kalori tidak valid.", 422, { kcal: [`Isi kalori 1 sampai ${RULES.maxKcal.toLocaleString("id-ID")}.`] });
        const twin = counted().find(item => item.source === "strava" && item.date === input.date && item.typeCode === type.code);
        if (twin && !input.force) throw new WellbeingApiError(`Sudah ada "${twin.title}" dari Strava di tanggal ini (${twin.points.toLocaleString("id-ID")} poin). Kalau itu aktivitas yang sama, tidak perlu dicatat lagi.`, 409, { code: ["strava_twin"] });
        const points = claimedPoints("kcal", 0, { kcal }, RULES);
        activity = { ...common, typeCode: type.code, typeName: type.name, kind: "sport", dimension: "physical", title: type.name, steps: null, kcal, minutes: input.minutes ?? null,
          photos: photos(input.photos.length, type.name, activities.length), pointsClaimed: points, points };
      }
      activities.push(activity);
      return { activity, totals: totals() };
    }, 0.2, request),
    leaderboard: (period, dim) => call(() => notReady ? { migrated: false, period, dim, items: [], me: null, of: 0, lastMonthChampion: null, near: [], ahead: null } : board(period, dim)),
    ledger: () => call<WbLedger>(() => {
      if (notReady) return { migrated: false, items: [], total: 0 };
      const items: WbLedgerItem[] = [
        ...counted().map(item => ({ date: item.date, title: item.title || item.typeName, points: item.points, dimension: item.dimension,
          kind: "activity" as const, sub: item.source === "strava" ? "Strava" : item.source === "import" ? `${dimensionLabels[item.dimension]} · aplikasi lama` : dimensionLabels[item.dimension] })),
        ...admin.map(entry => ({ date: entry.date, title: entry.title, sub: "Dari admin", points: entry.points, kind: "admin" as const, dimension: entry.dimension })),
        ...(importBase ? [{ date: "2026-05-22", title: "Saldo dari aplikasi lama", sub: "Dipindah saat peralihan", points: importBase, kind: "import" as const, dimension: null }] : []),
      ].sort((a, b) => b.date.localeCompare(a.date));
      return { migrated: true, items, total: sum(items.map(item => item.points)) };
    }),
    signOut: async () => { await sleep(options.latency?.[0] ?? 300); options.onSignOut?.(); },
    myCard: () => call(() => options.noCard ? null : sampleCard()),
    // The preview keeps the picture in the browser: its address is the picture itself.
    savePhoto: async (blob, _mime, onProgress) => {
      for (let step = 1; step <= 4; step++) { await sleep(options.latency?.[0] ?? 120); onProgress(step / 4); }
      return URL.createObjectURL(blob);
    },
    // The sample answers go through JSON, as the server's do: null, then nothing.
    removePhoto: () => call(() => null).then(() => undefined),
    // Strava in the preview: connecting happens at once (no Strava page), syncing finds nothing new.
    strava: () => call<WbStrava>(() => stravaNow()),
    stravaSync: () => call<WbStravaSync>(() => {
      if (strava.state !== "ok") throw new WellbeingApiError("Sambungan Strava terputus. Sambungkan ulang di Profil.", 409);
      strava.lastSyncAt = new Date().toISOString();
      return { added: 0, seen: 3 };
    }),
    stravaDisconnect: () => call<WbStrava>(() => { strava.state = "none"; return stravaNow(); }),
    stravaConnect: () => { strava.state = "ok"; strava.lastSyncAt = new Date().toISOString(); },
    rewards: () => call<WbRewards>(() => notReady ? { migrated: false, saldo: { earned: 0, held: 0, available: 0 }, rewards: [], claims: [], cardUrl: null }
      : { migrated: true, saldo: saldo(), rewards: rewardItems.map(rewardView), claims: [...claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), cardUrl: "/wam/kuesioner" }),
    claimReward: ({ rewardId, note }) => call(() => {
      const item = rewardItems.find(entry => entry.id === rewardId);
      if (!item) throw new WellbeingApiError("Hadiah ini sudah tidak tersedia. Muat ulang daftarnya.", 409, { code: ["unavailable"] });
      const view = rewardView(item);
      if (view.state === "limit") throw new WellbeingApiError("Kamu sudah mengklaim hadiah ini sebanyak batasnya.", 409, { code: ["limit"] });
      if (view.state === "sold_out") throw new WellbeingApiError("Hadiah ini sudah habis diklaim.", 409, { code: ["sold_out"] });
      if (view.state === "short") throw new WellbeingApiError("Saldo poinmu belum cukup untuk hadiah ini.", 409, { code: ["balance"] });
      if (view.state === "no_card") throw new WellbeingApiError("Kartu tokohmu belum keluar. Selesaikan kuesioner WAM dulu, lalu klaim voucher ini.", 409, { code: ["no_card"] });
      if (view.state === "legend_full") throw new WellbeingApiError("Tempat Legendary sudah penuh, jadi voucher ini belum bisa diklaim. Poinmu tidak terpotong.", 409, { code: ["legend_full"] });
      const now = new Date().toISOString(), reroll = item.kind === "reroll" || item.kind === "reroll_legendary";
      // A re-roll is handed over at once with its ticket; otherwise the delivery says (a code voucher takes the next code).
      const status = item.delivery === "auto" ? "delivered" as const : item.delivery === "approved" ? "approved" as const : "requested" as const;
      const code = item.kind === "voucher" ? item.codes.length > 1 ? item.codes.shift()! : item.codes[0] ?? null : null;
      const claim: WbClaim = { id: `00000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, "0")}`, rewardId, title: item.title, photo: item.photos[0] ?? null, cost: item.cost,
        status, note: item.delivery === "auto" || reroll ? "" : note.trim().slice(0, 300), reason: null, createdAt: now, decidedAt: status === "requested" ? null : now, deliveredAt: status === "delivered" ? now : null,
        voucher: reroll && status === "delivered" ? { legendary: item.kind === "reroll_legendary", status: "open" } : null,
        kind: item.kind, code: status === "delivered" ? code : null, validUntil: item.validUntil, howTo: item.howTo };
      claims.push(claim);
      return { claim, saldo: saldo() };
    }, 0.15),
    cancelClaim: id => call(() => {
      const claim = claims.find(entry => entry.id === id);
      if (!claim) throw new WellbeingApiError("Klaim tidak ditemukan.", 404);
      if (claim.status !== "requested") throw new WellbeingApiError("Klaim ini sudah diproses admin, jadi tidak bisa dibatalkan lagi.", 409);
      claim.status = "cancelled";
      return { claim, saldo: saldo() };
    }, 0.15),
  };
}
