/*
 * Misi Perjalanan (prototype, 23 Nov 2026): the 45-minute bus ride from the office to the Villa
 * Cangkringan for the HoD BoD meeting (forum "CSM & prioritas CAPEX", 24–28 Nov). HoD, BoD and
 * CoS open this instead of the session's usual detail. Missions (Susun Kalimatmu, Future Signal,
 * Pesan untuk 2027) open hints about a HoD's roommate; the room and the roommate are revealed after
 * check-in at the venue; Agenda & Tanya CEO lets them send questions per session.
 *
 * Only what is not personal lives here (the sentences, the questions, the rundown). Who sleeps in
 * which room, the hints from the questionnaire and sleeping hours are in pw_settings
 * ('mission_journey'), read on the server, and each person receives only their own room.
 * A demo: progress stays on the device (localStorage); nothing is shared between accounts yet.
 */

/** The forum this experience belongs to. */
export const MISSION_SESSION_ID = "2eeaabc9-3f16-426c-aced-dfaff545a478";
export const MISSION_SETTING_KEY = "mission_journey";

/** A CoS is a HoD here (27 Nov 2026): same room, quiz and room card. */
export type MissionRole = "HoD" | "BoD";
export type QuizChoice = { id: string; name: string; nick: string };
/**
 * A roommate. `questions` (27 Nov 2026): one per hint, each "who is this?" with three names, the
 * roommate among two others that change from question to question, so the answer is the name that
 * fits every hint.
 */
export type Mate = { name: string; nick: string; dept: string; hints: string[]; sleep: string | null; wake: string | null; questions: { choices: QuizChoice[] }[] };
/** What one person receives: their own part only. */
export type MissionView = {
  employeeId: string;
  /** The account's full name: a question to the CEO is sent under it (26 Nov 2026). */
  name: string;
  nick: string;
  role: MissionRole;
  /** The CEO also gets Mode CEO. */
  ceo: boolean;
  sentences: number[];
  /** Only for a HoD in the room list: the room code, the roommates (each with their quiz) and own sleeping hours. */
  room: { code: string; mates: Mate[]; self: { sleep: string | null; wake: string | null } } | null;
};

/** Unscramble the Future: each sentence cut into phrases, in order. */
export const SENTENCES: Record<number, string[]> = {
  1: ["Masa depan Werkudara", "dimulai dari", "sebuah visi besar", "yang berani melampaui", "batas hari ini."],
  2: ["Visi tersebut membutuhkan", "kepemimpinan yang mampu", "menerjemahkannya menjadi", "arah dan prioritas", "bersama."],
  3: ["Dengan memahami pasar", "dan menangkap peluang baru,", "kita memastikan", "arah tersebut", "terus relevan dan berkembang."],
  4: ["Untuk menjawab peluang tersebut,", "kita harus berani berinovasi", "dan memanfaatkan teknologi", "untuk menciptakan", "cara kerja", "yang lebih baik."],
  5: ["Setiap inovasi", "membutuhkan kreativitas", "agar ide dapat diwujudkan", "menjadi karya dan pengalaman", "yang memiliki nilai."],
  6: ["Dan setiap gagasan", "membutuhkan sumber daya", "serta kemitraan yang tepat", "agar dapat diwujudkan", "menjadi kenyataan."],
  7: ["Namun, kekuatan terbesar", "di balik semua rencana", "adalah manusia", "yang terus belajar, bertumbuh,", "dan saling mendukung."],
  8: ["Setiap kepercayaan", "dan sumber daya", "harus dikelola dengan cermat,", "transparan,", "serta penuh tanggung jawab."],
  9: ["Dengan pengendalian keuangan", "yang kuat,", "kita menjaga kesehatan bisnis", "dan memastikan pertumbuhan", "yang berkelanjutan."],
  10: ["Tata kelola dan komunikasi", "yang terpercaya", "memastikan setiap langkah", "berjalan selaras, terarah,", "dan akuntabel."],
  11: ["Dari setiap wilayah dan lini bisnis,", "kita membawa standar yang sama", "untuk memperluas jangkauan", "dan menciptakan dampak", "yang lebih besar."],
  12: ["Pada akhirnya,", "seluruh visi, strategi, dan kolaborasi", "menjadi nyata melalui eksekusi yang konsisten,", "hingga kita tidak hanya membangun bisnis hari ini,", "tetapi juga meninggalkan legacy bagi masa depan."],
};
/** The scrambled order the pieces start in, by the sentence's length. */
const SHUFFLE: Record<number, number[]> = { 5: [2, 4, 0, 3, 1], 6: [3, 1, 5, 0, 4, 2] };
export const scrambled = (sentence: number) => (SHUFFLE[SENTENCES[sentence]?.length ?? 0] ?? []).slice();
/** Is the answer (piece indexes in the order tapped) the sentence? */
export const sentenceRight = (answer: readonly number[], sentence: number) =>
  answer.length === (SENTENCES[sentence]?.length ?? -1) && answer.every((piece, at) => piece === at);
export const sentenceLabel = (sentence: number) => String(sentence).padStart(2, "0");

/** Future Signal: a bank of questions; each person gets two (by a pair that follows their id). */
// 24 Nov 2026: questions the questionnaire already asks are left out (what makes meetings tiresome:
// E5; departments to work with: E1 and 23; one new habit for 2027: 31). Three remain.
export const SIGNALS = [
  { q: "Satu kata untuk Werkudara di 2030?", o: ["Global", "Berani", "Kolaboratif", "Inovatif", "Berkelanjutan", "Terpercaya"] },
  { q: "Prioritas utama 2027 menurutmu?", o: ["Efisiensi biaya", "Ekspansi pasar", "Inovasi layanan", "Penguatan SDM", "Sistem & data"] },
  { q: "Seberapa siap timmu menyambut 2027?", o: ["1 · Baru mulai", "2", "3", "4", "5 · Sangat siap"] },
] as const;
const SIGNAL_PAIRS: [number, number][] = [[0, 1], [1, 2], [2, 0]];
/** The two questions of a person, steady for their id. */
export function signalPair(id: string): [number, number] {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;
  return SIGNAL_PAIRS[sum % SIGNAL_PAIRS.length];
}

// 24 Nov 2026: Pesan untuk 2027 left out, the questionnaire's question 31 already asks for it.
export type MissionKey = "kal" | "sig";
/** The missions of a person: their sentence when they hold one, then Future Signal. */
export function missionsOf(view: Pick<MissionView, "sentences" | "role">): MissionKey[] {
  return [...(view.sentences.length ? ["kal" as const] : []), "sig" as const];
}
export const HINT_COUNT = 3;
/** The room hints open after `done` of `missions` missions: shared out evenly, all once every mission is done. */
export function hintsOpen(done: number, missions: number): number {
  if (missions <= 0 || done <= 0) return 0;
  return done >= missions ? HINT_COUNT : Math.min(HINT_COUNT, Math.round(done * HINT_COUNT / missions));
}

/** The rundown of the Meeting HOD BOD (Ishoma left out); sessions with an id take questions. */
export type AgendaItem = { id?: string; t: string; end?: string; title: string; desc: string };
export const AGENDA: { day: string; items: AgendaItem[] }[] = [
  { day: "Selasa, 24 Nov", items: [
    { t: "14.30", title: "Keberangkatan menuju lokasi", desc: "Berangkat dari kantor" },
    { t: "15.30", title: "Persiapan dan check-in", desc: "Villa Cangkringan" },
    { id: "s1", t: "16.00", end: "18.00", title: "Business Overview & Evaluation Meeting", desc: "Evaluasi financial dan non-financial, pencapaian revenue, margin, dan action plan." }] },
  { day: "Rabu, 25 Nov", items: [
    { t: "Pagi", title: "Morning Activity", desc: "Oleh panitia" },
    { id: "s2", t: "09.00", end: "12.00", title: "Department Evaluation Presentation", desc: "Penyampaian evaluasi dan pencapaian masing-masing departemen." },
    { id: "s3", t: "13.00", end: "18.00", title: "Gudang Idea & Research Presentation", desc: "Pemaparan ide, hasil riset, dan peluang pengembangan." }] },
  { day: "Kamis, 26 Nov", items: [
    { t: "Pagi", title: "Morning Activity", desc: "Oleh panitia" },
    { id: "s4", t: "09.00", end: "12.00", title: "Sesi 1 · Business Strategy & Goal Setting", desc: "Penetapan goals financial dan non-financial." },
    { id: "s5", t: "13.00", end: "18.00", title: "Sesi 2 · Revenue Target Setting", desc: "Pembahasan target nominal omzet." },
    { t: "Malam", title: "Karaoke", desc: "Kegiatan kebersamaan (opsional)" }] },
  { day: "Jumat, 27 Nov", items: [
    { t: "Pagi", title: "Morning Activity", desc: "Oleh panitia" },
    { id: "s6", t: "09.00", end: "12.00", title: "Sesi 1 · Target & Budget Planning", desc: "Penyusunan target dan perencanaan anggaran." },
    { id: "s7", t: "13.00", end: "18.00", title: "Sesi 2 · Strategy Breakdown & Action Plan", desc: "Penjabaran strategi menjadi program kerja dan rencana aksi." },
    { t: "Malam", title: "BBQ", desc: "Kegiatan kebersamaan (opsional)" }] },
  { day: "Sabtu, 28 Nov", items: [
    { id: "s8", t: "09.00", end: "11.00", title: "Final Wrap-Up & Closing Session", desc: "Rekapitulasi hasil meeting, kesimpulan, dan tindak lanjut." }] },
];
export const agendaSession = (id: string) => {
  for (const day of AGENDA) for (const item of day.items) if (item.id === id) return { ...item, day: day.day };
  return null;
};
export const QUESTION_CATEGORIES = ["Financial", "Non-financial", "Revenue & margin", "Action plan", "Lainnya"] as const;
export type Question = { id: string; text: string; by: string; anon: boolean; votes: number; cat: string; voted: boolean; mine: boolean; status: "baru" | "live" | "dijawab" };
/** Example questions, marked "Contoh", so the list is not empty in the demo. */
export const SAMPLE_QUESTIONS: Record<string, Omit<Question, "id" | "voted" | "mine" | "status" | "by" | "anon">[]> = {
  s1: [
    { text: "Dari evaluasi margin tahun ini, lini bisnis mana yang jadi prioritas perbaikan untuk 2027?", votes: 5, cat: "Revenue & margin" },
    { text: "Indikator non-financial apa yang dipakai untuk menilai keberhasilan departemen tahun depan?", votes: 3, cat: "Non-financial" },
    { text: "Bagaimana action plan yang belum tercapai tahun ini akan ditindaklanjuti?", votes: 2, cat: "Action plan" },
  ],
  s5: [{ text: "Apakah target omzet dibagi per kuartal atau per lini bisnis?", votes: 4, cat: "Revenue & margin" }],
};
/** Most support first; the order they came in otherwise. */
export const byVotes = <T extends { votes: number }>(list: readonly T[]) => list.map((item, at) => ({ item, at })).sort((a, b) => b.item.votes - a.item.votes || a.at - b.at).map(({ item }) => item);

/* ── The road from the office to the villa (24 Nov 2026): one winding curve in a 360×150 scene. ── */
export const ROAD = { from: [34, 112], c1: [130, 40], c2: [220, 150], to: [318, 82] } as const;
export const ROAD_PATH = `M${ROAD.from.join(" ")} C${ROAD.c1.join(" ")} ${ROAD.c2.join(" ")} ${ROAD.to.join(" ")}`;
const bezier = (t: number): [number, number] => {
  const u = 1 - t;
  const at = (axis: 0 | 1) => u * u * u * ROAD.from[axis] + 3 * u * u * t * ROAD.c1[axis] + 3 * u * t * t * ROAD.c2[axis] + t * t * t * ROAD.to[axis];
  return [at(0), at(1)];
};
// The curve measured once, so a share of the way is a share of its length (as pathLength="100" draws it).
const SAMPLES = (() => {
  const points = Array.from({ length: 201 }, (_, at) => bezier(at / 200));
  const lengths = [0];
  for (let at = 1; at < points.length; at++) lengths.push(lengths[at - 1] + Math.hypot(points[at][0] - points[at - 1][0], points[at][1] - points[at - 1][1]));
  return { points, lengths, total: lengths[lengths.length - 1] };
})();
/** The point `percent` of the way along the road, and its heading in degrees (for the bus). */
export function roadPoint(percent: number): { x: number; y: number; angle: number } {
  const want = Math.max(0, Math.min(100, percent)) / 100 * SAMPLES.total;
  let at = SAMPLES.lengths.findIndex(length => length >= want);
  if (at <= 0) at = 1;
  const [ax, ay] = SAMPLES.points[at - 1];
  const [bx, by] = SAMPLES.points[at];
  const share = (want - SAMPLES.lengths[at - 1]) / ((SAMPLES.lengths[at] - SAMPLES.lengths[at - 1]) || 1);
  return { x: ax + (bx - ax) * share, y: ay + (by - ay) * share, angle: Math.atan2(by - ay, bx - ax) * 180 / Math.PI };
}
/** How far along the bus is: waiting at the office, then a stretch per mission done, the villa on arrival. */
export function journeyPercent(input: { launched: boolean; done: number; missions: number; arrived: boolean }): number {
  if (input.arrived) return 100;
  if (!input.launched) return 0;
  return Math.round(8 + (input.done / Math.max(1, input.missions)) * 80);
}
/** Where each mission's stop stands on the road (the share reached when it is done). */
export const missionStops = (missions: number) => Array.from({ length: missions }, (_, at) => journeyPercent({ launched: true, done: at + 1, missions, arrived: false }));

/** The key a person is known by in the quiz: their full name, spaces tidied, in capitals. */
export const personKey = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * The quiz of one roommate (25 Nov 2026): them and two others from outside the viewer's room,
 * preferring people of the same rooms' group (the women's rooms or the men's), in an order that is
 * the same every time but does not always put the answer first.
 */
export function quizChoices<T extends { name: string }>(mate: T, pool: readonly T[], sameGroup: (person: T) => boolean, salt = ""): T[] {
  const score = (text: string) => { let sum = 7; for (const char of text) sum = (sum * 31 + char.charCodeAt(0)) % 1_000_003; return sum; };
  const byMate = (person: T) => score(`${mate.name}|${person.name}|${salt}`);
  const others = [...pool].sort((a, b) => Number(sameGroup(b)) - Number(sameGroup(a)) || byMate(a) - byMate(b)).slice(0, 2);
  return [mate, ...others].sort((a, b) => byMate(a) - byMate(b));
}

/** The key of one quiz answer: the roommate and the question's number. */
export const answerKey = (mateKey: string, question: number) => `${mateKey}#${question}`;

/** Initials for an avatar: "Linda Susanto" → "LS". */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
