import { personaColors } from "@/lib/pra-wam/figures";
import { mysteryName } from "./admin";
import { soalTimes } from "./flow";
import { correctPoints } from "./rules";
import type { Alias, AnswerRow, QuizPhase, QuizRun, RunQuestion, TallyRow } from "./types";

/*
 * Kuis live's sample (dev-preview, tests, Mode demo): the prototype's eight questions and tokoh as
 * players. Tokoh are public figures (the questionnaire's cards); the names behind them are made up
 * (public repo). Never used for a real game.
 */

const q = (id: number, level: 1 | 2 | 3 | 4, body: string, options: string[], correct: number): RunQuestion => ({ id: `00000000-0000-4000-8000-0000000000${String(id).padStart(2, "0")}`, level, body, options, correct });
export const SAMPLE_QUESTIONS: RunQuestion[] = [
  q(1, 1, "Kota Batu terkenal dengan buah apa?", ["Jeruk", "Apel", "Salak", "Durian"], 1),
  q(2, 1, "Biru dicampur kuning menjadi warna apa?", ["Ungu", "Oranye", "Hijau", "Cokelat"], 2),
  q(3, 2, "Gunung tertinggi di Pulau Jawa?", ["Semeru", "Arjuno", "Lawu", "Welirang"], 0),
  q(4, 2, "1 jam sama dengan berapa detik?", ["360", "6.000", "36.000", "3.600"], 3),
  q(5, 3, "Planet yang satu harinya lebih lama dari satu tahunnya?", ["Merkurius", "Venus", "Mars", "Jupiter"], 1),
  q(6, 3, "Siapa pencipta World Wide Web?", ["Bill Gates", "Steve Jobs", "Tim Berners-Lee", "Vint Cerf"], 2),
  q(7, 4, "Berapa jumlah tulang orang dewasa?", ["186", "206", "212", "230"], 1),
  q(8, 4, "Negara dengan pulau terbanyak di dunia?", ["Swedia", "Indonesia", "Filipina", "Norwegia"], 0),
];

const PERSONAS: Record<string, string> = {
  garda: "Garda Depan", penyihir: "Penyihir Ide", siasat: "Ahli Siasat", penjaga: "Penjaga Damai",
  pemantik: "Pemantik Semangat", pengintai: "Pengintai Jeli", penyembuh: "Penyembuh Hati", penghibur: "Bard Penghibur",
};
const FIGURES: [string, string, string][] = [
  ["marie-curie", "Marie Curie", "siasat"], ["ki-hajar-dewantara", "Ki Hajar Dewantara", "garda"], ["nikola-tesla", "Nikola Tesla", "penyihir"],
  ["nelson-mandela", "Nelson Mandela", "penjaga"], ["muhammad-ali", "Muhammad Ali", "pemantik"], ["ada-lovelace", "Ada Lovelace", "pengintai"],
  ["r-a-kartini", "R.A. Kartini", "penyembuh"], ["charlie-chaplin", "Charlie Chaplin", "penghibur"], ["serena-williams", "Serena Williams", "garda"],
  ["leonardo-da-vinci", "Leonardo da Vinci", "penyihir"], ["sun-tzu", "Sun Tzu", "siasat"], ["bob-ross", "Bob Ross", "penjaga"],
  ["usain-bolt", "Usain Bolt", "pemantik"], ["albert-einstein", "Albert Einstein", "pengintai"], ["florence-nightingale", "Florence Nightingale", "penyembuh"],
  ["benyamin-sueb", "Benyamin Sueb", "penghibur"], ["susi-susanti", "Susi Susanti", "garda"], ["frida-kahlo", "Frida Kahlo", "penyihir"],
  ["alan-turing", "Alan Turing", "siasat"], ["audrey-hepburn", "Audrey Hepburn", "penjaga"], ["freddie-mercury", "Freddie Mercury", "pemantik"],
  ["agatha-christie", "Agatha Christie", "pengintai"], ["dolly-parton", "Dolly Parton", "penyembuh"], ["didi-kempot", "Didi Kempot", "penghibur"],
  ["b-j-habibie", "B.J. Habibie", "siasat"], ["jane-goodall", "Jane Goodall", "penyembuh"], ["chairil-anwar", "Chairil Anwar", "pemantik"],
  ["walt-disney", "Walt Disney", "penyihir"], ["gus-dur", "Gus Dur", "penjaga"], ["jackie-chan", "Jackie Chan", "pemantik"],
];
/** The names behind the podium's tokoh (made up). */
export const SAMPLE_NAMES = ["Rani", "Sari", "Bima", "Dewi", "Fajar", "Ayu", "Raka", "Lina", "Dimas", "Tari", "Yoga", "Nadia"];

export const sampleAlias = (index: number): Alias => {
  if (index >= FIGURES.length) return { name: mysteryName(index - FIGURES.length + 1), figure: null, persona: "", colors: null, mystery: index - FIGURES.length + 1 };
  const [figure, name, persona] = FIGURES[index];
  return { name, figure, persona: PERSONAS[persona], colors: personaColors[persona] ?? null, mystery: null };
};
/** Player n's employee id in the sample (index 0 = "me"). */
export const sampleEmployee = (index: number) => `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`;
export const SAMPLE_ME = sampleEmployee(0);
export const SAMPLE_PLAYERS = 34;

export const SAMPLE_T0 = Date.parse("2027-01-05T19:30:00+07:00");

export function sampleRun(patch: Partial<QuizRun> = {}): QuizRun {
  return {
    id: "00000000-0000-4000-a000-000000000001", quizId: "00000000-0000-4000-a000-0000000000aa", number: 1, phase: "siap", index: -1, questions: SAMPLE_QUESTIONS,
    phaseAt: SAMPLE_T0, pauses: [], canceled: [], boards: [], podiumRevealed: 0, rev: 1, endedAt: null, ...patch,
  };
}

/** A small deterministic random (so previews and tests look the same every time). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Everyone's answers to question `index` (most right for easy ones, fewer for hard ones; me as given). */
export function sampleAnswers(index: number, players = SAMPLE_PLAYERS, mine: { choice: number; ms: number } | null = { choice: SAMPLE_QUESTIONS[index].correct, ms: 4_200 }): AnswerRow[] {
  const question = SAMPLE_QUESTIONS[index];
  const dur = soalTimes(question.level).durMs;
  const rand = random(index * 97 + 13);
  const chance = [0.95, 0.75, 0.45, 0.3][question.level - 1];
  const rows: AnswerRow[] = [];
  for (let player = 0; player < players; player += 1) {
    const choice = player === 0 ? mine?.choice ?? null : rand() < 0.06 ? null : rand() < chance ? question.correct : (question.correct + 1 + Math.floor(rand() * 3)) % 4;
    if (choice === null) continue;
    const ms = player === 0 ? mine!.ms : Math.round(dur * (0.15 + rand() * 0.7));
    const correct = choice === question.correct;
    rows.push({ employeeId: sampleEmployee(player), index, choice, ms, correct, points: correct ? correctPoints(ms, dur) : -100, tappedAt: SAMPLE_T0 + index * 60_000 + ms });
  }
  return rows;
}

/** Everyone's totals up to `upto`, and up to `prev`. */
export function sampleTallies(upto: number, prev: number, players = SAMPLE_PLAYERS): TallyRow[] {
  const all = Array.from({ length: Math.max(0, upto + 1) }, (_, index) => sampleAnswers(index, players)).flat();
  return Array.from({ length: players }, (_, player) => {
    const id = sampleEmployee(player);
    const mine = all.filter(answer => answer.employeeId === id);
    const sum = (rows: AnswerRow[], until: number) => {
      const shown = rows.filter(row => row.index <= until);
      const right = shown.filter(row => row.correct);
      return { total: shown.reduce((s, row) => s + row.points, 0), correct: right.length, correctMs: right.reduce((s, row) => s + row.ms, 0), last: right.length ? Math.max(...right.map(row => row.tappedAt)) : null };
    };
    const now = sum(mine, upto);
    const before = sum(mine, prev);
    return { employeeId: id, alias: sampleAlias(player), joinedAt: SAMPLE_T0 - 60_000 + player * 900, total: now.total, correct: now.correct, correctMs: now.correctMs, lastCorrectAt: now.last, prevTotal: before.total, prevCorrectMs: before.correctMs, prevLastCorrectAt: before.last };
  });
}

/** The sample run in a phase (and question), for previews: `phaseAt` at `now − offset`. */
export function sampleRunAt(phase: QuizPhase, index: number, offsetMs: number, now: number, patch: Partial<QuizRun> = {}): QuizRun {
  const boards = SAMPLE_QUESTIONS.map((_, i) => i).filter(i => i < index && (i === SAMPLE_QUESTIONS.length - 1 || SAMPLE_QUESTIONS[i + 1].level !== SAMPLE_QUESTIONS[i].level));
  return sampleRun({ phase, index, phaseAt: now - offsetMs, boards: phase === "skor" ? [...boards, index] : boards, rev: 7, ...patch });
}
