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

export type MissionRole = "HoD" | "BoD" | "CoS";
export type Mate = { name: string; nick: string; dept: string; hints: string[]; sleep: string | null; wake: string | null };
/** What one person receives: their own part only. */
export type MissionView = {
  employeeId: string;
  nick: string;
  role: MissionRole;
  /** The CEO also gets Mode CEO. */
  ceo: boolean;
  sentences: number[];
  /** Only for a HoD in the room list: the room code, the roommates, own sleeping hours, and the others to guess from. */
  room: { code: string; mates: Mate[]; self: { sleep: string | null; wake: string | null }; others: { id: string; name: string }[] } | null;
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
export const SIGNALS = [
  { q: "Satu kata untuk Werkudara di 2030?", o: ["Global", "Berani", "Kolaboratif", "Inovatif", "Berkelanjutan", "Terpercaya"] },
  { q: "Prioritas utama 2027 menurutmu?", o: ["Efisiensi biaya", "Ekspansi pasar", "Inovasi layanan", "Penguatan SDM", "Sistem & data"] },
  { q: "Hal yang paling ingin dihapus dari meeting kita?", o: ["Molor dari jadwal", "Bahasan melebar", "Sibuk HP/laptop", "Tidak ada keputusan", "Terlalu banyak slide"] },
  { q: "Departemen yang ingin lebih sering kamu ajak kolaborasi di 2027?", o: ["Sales & Marketing", "Accounting", "CFC", "HRGA", "Strategic Sourcing", "CoE", "BAS", "Takshaka"] },
  { q: "Seberapa siap timmu menyambut 2027?", o: ["1 · Baru mulai", "2", "3", "4", "5 · Sangat siap"] },
  { q: "Satu kebiasaan baru untuk tim di 2027?", o: ["Rapat lebih singkat", "Data satu versi", "Apresiasi rutin", "Belajar bersama", "Eksperimen kecil"] },
] as const;
const SIGNAL_PAIRS: [number, number][] = [[0, 1], [2, 3], [4, 5], [1, 2], [3, 4], [5, 0]];
/** The two questions of a person, steady for their id. */
export function signalPair(id: string): [number, number] {
  let sum = 0;
  for (const char of id) sum = (sum + char.charCodeAt(0)) % 997;
  return SIGNAL_PAIRS[sum % SIGNAL_PAIRS.length];
}

export type MissionKey = "kal" | "sig" | "pes";
/** The missions of a person: a sentence when they hold one; the message to BoD for everyone but BoD. */
export function missionsOf(view: Pick<MissionView, "sentences" | "role">): MissionKey[] {
  return [...(view.sentences.length ? ["kal" as const] : []), "sig" as const, ...(view.role !== "BoD" ? ["pes" as const] : [])];
}
export const HINT_COUNT = 3;

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

/** Points, as the prototype counts them (shown only to the person; no public ranking). */
export const POINTS = { launch: 20, sentenceFirstTry: 100, sentence: 70, sentencePart: 50, signal: 60, message: 60, arrive: 30, guessRight: 100, agree: 40, ask: 30 } as const;

/** Initials for an avatar: "Linda Susanto" → "LS". */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
