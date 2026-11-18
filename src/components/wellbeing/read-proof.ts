import type { WbCatalogDaily, WbCatalogSport } from "@/lib/wellbeing/app-types";
import { addDays, dateProblem } from "@/lib/wellbeing/rules";

/*
 * Catat dari foto (18 Nov 2026): what a proof photo says, from the text Tesseract read on the phone.
 * Screens of watches and fitness apps (Samsung Health, Google Fit, Apple Fitness, Strava, Garmin,
 * Huawei, Mi Fitness...) in Indonesian or English: the sport, the date, the steps, the kcal and the
 * duration. Pure and forgiving: whatever it cannot tell stays empty, and the person checks it all
 * before saving.
 */

export type ProofContext = { today: string; backdateDays: number | null; programStart?: string; sports: readonly Pick<WbCatalogSport, "code" | "name">[]; daily: readonly Pick<WbCatalogDaily, "code" | "name" | "mode">[] };
export type ProofReading = {
  /** What to log: a sport (its code, or null when only the kcal were read), a daily type, or nothing found. */
  kind: "sport" | "daily" | null;
  code: string | null;
  date: string | null;
  /** "HH:MM" when the screen gives the time of day (17 Nov 2026). */
  time: string | null;
  steps: number | null;
  kcal: number | null;
  minutes: number | null;
  /** The activity's own name on the screen ("Morning Run"), for the note. */
  title: string | null;
};

/* ---------- numbers ---------- */

const NUMBER = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

/** "9.128" and "9,128" are thousands, "5,2" and "412.6" decimals, "1.234,5" both. */
export function toNumber(raw: string): number | null {
  const text = raw.replace(/\s/g, "");
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text)) return Number(text.replace(/[.,]/g, ""));
  const both = /^(\d{1,3}(?:([.,])\d{3})+)([.,])(\d+)$/.exec(text);
  if (both && both[2] !== both[3]) return Number(`${both[1].replace(/[.,]/g, "")}.${both[4]}`);
  if (/^\d+[.,]\d+$/.test(text)) return Number(text.replace(",", "."));
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

type Found = { value: number; start: number; end: number };
const numbersIn = (text: string): Found[] => [...text.matchAll(NUMBER)].flatMap(match => {
  const value = toNumber(match[0]);
  // A goal ("9.128 / 10.000 langkah", "Target 8.000") is not what was done.
  const before = text.slice(Math.max(0, match.index - 10), match.index);
  if (value == null || /\/\s*$|(goal|target|tujuan|sasaran)\W*$/.test(before)) return [];
  // Part of a clock or a duration ("28:01", "5:23"): not a count.
  if (text[match.index - 1] === ":" || text[match.index + match[0].length] === ":") return [];
  return [{ value, start: match.index, end: match.index + match[0].length }];
});

/**
 * The number nearest a label (on the same line, or the line just above or below: apps print
 * "Kalori" over "412"), within reach. The labels are tried in order: earlier ones win.
 */
function nearLabel(text: string, numbers: readonly Found[], labels: readonly RegExp[], accept: (value: number) => boolean, reach = 28): number | null {
  for (const label of labels) {
    for (const match of text.matchAll(new RegExp(label.source, "g"))) {
      const start = match.index, end = start + match[0].length;
      let best: { value: number; gap: number } | null = null;
      for (const found of numbers) {
        if (!accept(found.value)) continue;
        const between = found.end <= start ? text.slice(found.end, start) : found.start >= end ? text.slice(end, found.start) : "";
        if ((between.match(/\n/g)?.length ?? 0) > 1 || between.length > reach) continue;
        // Before the label reads first ("9.128 langkah"), so it wins a tie.
        const gap = between.length + (found.end <= start ? 0 : 0.5);
        if (!best || gap < best.gap) best = { value: found.value, gap };
      }
      if (best) return best.value;
    }
  }
  return null;
}

/* ---------- duration ---------- */

/** "1:02:45", "34:12" next to Durasi/Time, "1 j 5 mnt", "1h 5m", "34 menit" → whole minutes. */
function minutesIn(text: string): number | null {
  const fits = (value: number) => value >= 1 && value <= 1440 ? Math.round(value) : null;
  // Tesseract often reads the "j" of "1 j 5 mnt" as ")", "]" or "}".
  const hm = /(\d{1,2})\s*(?:j|jam|h|hr|hrs|hour|hours|\)|\]|\})\.?\s*(\d{1,2})\s*(?:m|mnt|menit|min|mins|minutes)\b/.exec(text);
  if (hm) return fits(Number(hm[1]) * 60 + Number(hm[2]));
  const label = /\b(moving time|elapsed time|workout time|total time|durasi|duration|waktu|time|lama)\b/g;
  for (const match of text.matchAll(label)) {
    const after = text.slice(match.index, match.index + 40);
    const clock = /(\d{1,2}):(\d{2}):(\d{2})|(\d{1,3}):(\d{2})(?!\s*(?:\/|am|pm|wib|per))/.exec(after.slice(match[0].length));
    if (clock) return fits(clock[1] ? Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3]) / 60 : Number(clock[4]) + Number(clock[5]) / 60);
  }
  const hms = /(\d{1,2}):(\d{2}):(\d{2})(?!\s*(?:\/|am|pm|wib))/.exec(text);
  if (hms && Number(hms[1]) < 10) return fits(Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60);
  const plain = /(\d{1,4})\s*(?:mnt|menit|min|mins|minutes)\b/.exec(text);
  if (plain) return fits(Number(plain[1]));
  const hours = /(\d{1,2}(?:[.,]\d)?)\s*(?:jam|hours?|hrs?)\b/.exec(text);
  if (hours) return fits((toNumber(hours[1]) ?? 0) * 60);
  return null;
}

/* ---------- date ---------- */

const MONTHS: [RegExp, number][] = [
  [/^jan/, 1], [/^feb|^peb/, 2], [/^mar/, 3], [/^apr/, 4], [/^mei|^may/, 5], [/^jun/, 6], [/^jul/, 7],
  [/^agu|^agt|^ags|^aug/, 8], [/^sep/, 9], [/^okt|^oct/, 10], [/^nov|^nop/, 11], [/^des|^dec/, 12],
];
const MONTH_WORD = "(jan|feb|peb|mar|apr|mei|may|jun|jul|agu|agt|ags|aug|sep|okt|oct|nov|nop|des|dec)[a-z]*\\.?";
const monthOf = (word: string) => MONTHS.find(([pattern]) => pattern.test(word))?.[1] ?? null;
const pad = (value: number) => String(value).padStart(2, "0");

/** The date on the screen within the backdate window (today, kemarin, "17 Nov", "Nov 17, 2026", "17/11/2026"). */
function dateIn(text: string, context: ProofContext): string | null {
  const { today, backdateDays, programStart } = context;
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const guessYear = (m: number) => m > month ? year - 1 : year;
  const candidates: { at: number; date: string }[] = [];
  const add = (at: number, y: number | null, m: number | null, d: number) => {
    if (!m || m > 12 || d < 1 || d > 31) return;
    candidates.push({ at, date: iso(y ?? guessYear(m), m, d) });
  };
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_WORD},?(?:\\s+(\\d{4}))?`, "g"))) add(match.index, match[3] ? Number(match[3]) : null, monthOf(match[2]), Number(match[1]));
  for (const match of text.matchAll(new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2})(?:\\s?(?:st|nd|rd|th))?\\b,?(?:\\s+(\\d{4}))?`, "g"))) add(match.index, match[3] ? Number(match[3]) : null, monthOf(match[1]), Number(match[2]));
  for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
    const y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    add(match.index, y, Number(match[2]), Number(match[1]));
  }
  for (const match of text.matchAll(/\b(hari ini|today)\b/g)) candidates.push({ at: match.index, date: today });
  for (const match of text.matchAll(/\b(kemarin|yesterday)\b/g)) candidates.push({ at: match.index, date: addDays(today, -1) });
  const valid = candidates.filter(candidate => !dateProblem(candidate.date, today, backdateDays, programStart)).sort((a, b) => a.at - b.at);
  return valid[0]?.date ?? null;
}

/* ---------- what kind of activity ---------- */

/** Words for each sport, matched against the catalog's own codes and names (the catalog may change). */
const SPORT_WORDS: readonly (readonly string[])[] = [
  ["table tennis", "tenis meja", "ping pong", "pingpong"],
  ["running", "run", "lari", "jogging", "jog", "treadmill"],
  ["walking", "walk", "jalan kaki", "jalan santai", "berjalan"],
  ["cycling", "ride", "bike", "biking", "bersepeda", "sepeda", "gowes", "spinning", "cycle"],
  ["swimming", "swim", "renang", "berenang"],
  ["hiking", "hike", "mendaki", "trekking"],
  ["yoga"],
  ["pilates"],
  ["badminton", "bulu tangkis", "bulutangkis"],
  ["futsal", "football", "soccer", "sepak bola", "sepakbola", "mini soccer"],
  ["basketball", "basket"],
  ["tennis", "tenis"],
  ["volleyball", "voli", "bola voli"],
  ["zumba", "dance", "aerobic", "aerobik", "senam"],
  ["boxing", "tinju", "muay thai", "silat", "karate", "taekwondo", "martial"],
  ["golf"],
  ["padel"],
  ["rowing", "dayung"],
  ["climbing", "panjat"],
  ["strength", "angkat beban", "gym", "hiit", "crossfit", "functional"],
];
/** Catalog names too general to look for on a screen ("Lainnya" is everywhere in Indonesian apps). */
const GENERIC = new Set(["lainnya", "others", "other", "olahraga", "sport", "sports", "workout", "latihan", "aktivitas"]);
const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const has = (haystack: string, word: string) => haystack.includes(` ${word} `);

function sportIn(text: string, sports: ProofContext["sports"]): { code: string; term: string } | null {
  const plain = words(text);
  let best: { code: string; at: number; term: string } | null = null;
  for (const sport of sports) {
    const own = words(`${sport.code.replace(/^sport\./, "").replace(/[_-]/g, " ")} ${sport.name}`);
    // The sport's own name first, then the words of its kind.
    const group = SPORT_WORDS.find(list => list.some(word => has(own, word)));
    const name = sport.name.toLowerCase().trim();
    // Its own name beats a word of its kind at the same place ("Aerobik" over Zumba's "aerobik").
    const terms: [string, number][] = [...(GENERIC.has(name) ? [] : [[name, 0] as [string, number]]), ...(group ?? []).map(word => [word, 0.5] as [string, number])];
    for (const [term, penalty] of terms) {
      if (term.length < 3) continue;
      const found = plain.indexOf(` ${words(term).trim()} `);
      const at = found + penalty;
      if (found >= 0 && (!best || at < best.at)) best = { code: sport.code, at, term };
    }
  }
  return best ? { code: best.code, term: best.term } : null;
}

const STOPWORDS = new Set(["mengikuti", "kegiatan", "harian", "kantor", "dengan", "untuk", "bersama", "dalam", "online", "offline", "lainnya"]);
/** A daily type whose name is on the screen (most of its own words), e.g. a podcast app for "Mendengarkan Podcast". */
function dailyIn(text: string, daily: ProofContext["daily"]): { code: string; term: string } | null {
  const plain = words(text);
  let best: { code: string; score: number; term: string } | null = null;
  for (const item of daily) {
    if (item.mode === "steps") continue;
    const own = words(item.name).trim().split(" ").filter(word => word.length >= 4 && !STOPWORDS.has(word));
    if (!own.length) continue;
    const hits = own.filter(word => has(plain, word));
    const score = hits.length / own.length;
    if (hits.length && score >= 0.5 && (!best || score > best.score)) best = { code: item.code, score, term: hits[0] };
  }
  return best ? { code: best.code, term: best.term } : null;
}

/* ---------- the time of day, and the activity's own name ---------- */

const clock = (hour: number, minute: number, half?: string) => {
  let h = hour;
  if (half === "pm" && h < 12) h += 12;
  if (half === "am" && h === 12) h = 0;
  return h <= 23 && minute <= 59 ? `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : null;
};

/**
 * When it happened, only where the screen says so: "at 6:05 am", "pukul 06.05", "07:10 wib", "6:05 pm",
 * or a time right after a date ("16/11/2026 07.10", "17 nov 2026, 06:05"). A bare "09:41" (the phone's
 * clock at the top) or a duration is not a time of day.
 */
function timeIn(text: string): string | null {
  const after = "(?![:.]\\d)(?!\\s*(?:\\/|per\\b|km|mi\\b))";
  const patterns = [
    new RegExp(`\\b(?:at|pukul|pkl\\.?|jam)\\s*(\\d{1,2})[:.](\\d{2})${after}(?:\\s*(am|pm))?`),
    new RegExp(`\\b(\\d{1,2})[:.](\\d{2})\\s*(am|pm)\\b`),
    // An empty third group, so every pattern ends with hour, minute, am/pm.
    new RegExp(`\\b(\\d{1,2})[:.](\\d{2})${after}\\s*wib\\b()`),
    new RegExp(`(?:\\b\\d{1,2}[/.-]\\d{1,2}[/.-](?:\\d{4}|\\d{2})|\\b\\d{1,2}\\s+${MONTH_WORD},?(?:\\s+\\d{4})?|\\b${MONTH_WORD}\\s+\\d{1,2},?(?:\\s+\\d{4})?)[,\\s]+(?:at\\s+|pukul\\s+)?(\\d{1,2})[:.](\\d{2})${after}(?:\\s*(am|pm))?`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    // The last pattern has the date's own groups first: the time is in the last three.
    const [hour, minute, half] = match.slice(-3);
    const found = clock(Number(hour), Number(minute), half);
    if (found) return found;
  }
  return null;
}

/** The line that named the activity ("Morning Run", "Renang kolam"), for the note; not when it only repeats the type. */
function titleIn(raw: string, term: string, typeName: string | undefined): string | null {
  const line = raw.split(/\r?\n/).map(item => item.replace(/\s+/g, " ").trim()).find(item => has(words(item), words(term).trim()));
  if (!line) return null;
  const clean = line.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, "").slice(0, 80);
  if (clean.length < 3 || words(clean) === words(typeName ?? "")) return null;
  return clean;
}

/* ---------- all together ---------- */

export function readProof(raw: string, context: ProofContext): ProofReading {
  // "412kcal", "34min", "5.2km": a number and its unit apart, so both read as words.
  // Tesseract's sparse mode puts an empty line between pieces: one line break is enough.
  const text = raw.toLowerCase().replace(/ /g, " ").replace(/\r/g, "").replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n");
  const numbers = numbersIn(text);
  const steps = nearLabel(text, numbers, [/\b(steps?|langkah|lngkh)\b/], value => Number.isInteger(value) && value >= 100 && value <= 200_000);
  const kcalRaw = nearLabel(text, numbers, [
    /\b(active|aktif|move|gerak)\s*(kilo)?\s*(calories|kalori|kcal|kkal|cal)\b/,
    /\b(kcal|kkal|calories|kalori|kilocalories|kilokalori|cal|kal)\b/,
  ], value => value >= 1 && value <= 20_000);
  const kcal = kcalRaw == null ? null : Math.round(kcalRaw);
  const minutes = minutesIn(text);
  const date = dateIn(text, context);
  const time = timeIn(text);
  const sport = sportIn(text, context.sports);
  const sportName = sport ? context.sports.find(item => item.code === sport.code)?.name : undefined;
  const stepsType = context.daily.find(item => item.mode === "steps")?.code ?? null;
  const walking = !!sport && /walk|jalan/.test(`${sport.code} ${sportName ?? ""}`.toLowerCase());

  const base = { date, time, steps, kcal, minutes, title: null };
  // A walk with steps and no kcal counts best as daily steps (points from the steps).
  if (sport && !(walking && steps && stepsType && kcal == null)) return { ...base, kind: "sport", code: sport.code, title: titleIn(raw, sport.term, sportName) };
  if (steps != null && stepsType) return { ...base, kind: "daily", code: stepsType };
  if (kcal != null) return { ...base, kind: "sport", code: null };
  const daily = dailyIn(text, context.daily);
  if (daily) return { ...base, kind: "daily", code: daily.code, title: titleIn(raw, daily.term, context.daily.find(item => item.code === daily.code)?.name) };
  return { ...base, kind: null, code: null };
}
