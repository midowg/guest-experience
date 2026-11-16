import type { WbMyActivity, WbRules } from "@/lib/wellbeing/app-types";
import { addDays, claimedPoints, DIMENSIONS, dateProblem, dimensionLabels, MIN_STEPS, type DimensionId } from "@/lib/wellbeing/rules";

/*
 * Wellbeing app (17 Nov 2026): the small pure pieces the screens share. Numbers in id-ID, dates in
 * WIB (Asia/Jakarta) from the server's YYYY-MM-DD, and the checks of the Catat form.
 */

export const TZ = "Asia/Jakarta";
const numbers = new Intl.NumberFormat("id-ID");
/** 12480 → "12.480". */
export const num = (value: number) => numbers.format(Math.round(value || 0));
/** 450 → "+450", -200 → "−200". */
export const signed = (value: number) => `${value < 0 ? "−" : "+"}${num(Math.abs(value))}`;

const noonWib = (date: string) => new Date(`${date}T12:00:00+07:00`);
export const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...options }).format(noonWib(date));
/** "Hari ini", "Kemarin", or "Sen, 9 Nov". */
export const dayLabel = (date: string, today: string) =>
  date === today ? "Hari ini" : date === addDays(today, -1) ? "Kemarin" : formatDate(date, { weekday: "short", day: "numeric", month: "short" });
/** "Selasa, 17 November 2026". */
export const fullDate = (date: string) => formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
/** "Sen" (without the dot some engines add). */
export const weekday = (date: string) => formatDate(date, { weekday: "short" }).replace(".", "");
/** The hour now in WIB, 0 to 23. */
export const wibHour = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
export const currentWibHour = () => wibHour(new Date());
export const greeting = (hour: number) => hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";

/** "Dewi Contoh" → "DC". */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** A steady colour for a person's round mark, from their name. */
export const toneOf = (name: string): DimensionId => DIMENSIONS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DIMENSIONS.length];
/** 5200 → "5,2 km". */
export const distance = (meters: number) => `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;

export const sourceLabels: Record<WbMyActivity["source"], string> = { manual: "Dicatat sendiri", strava: "Strava (otomatis)", import: "Dari aplikasi lama" };
export const activityTitle = (activity: WbMyActivity) => activity.title.trim() || activity.typeName;

/** The grey line under an activity: what kind, how far or how long, or how many steps. */
export function activityMeta(activity: WbMyActivity) {
  if (activity.kind === "sport") {
    const bits = [activity.source === "strava" ? "Strava" : "Olahraga"];
    if (activity.distanceM) bits.push(distance(activity.distanceM));
    if (activity.minutes) bits.push(`${num(activity.minutes)} mnt`);
    return bits.join(" · ");
  }
  if (activity.steps != null) return `${num(activity.steps)} langkah`;
  return dimensionLabels[activity.dimension];
}

/** Activities by day for Riwayat, in the order the server sent them (newest day first). */
export function groupByDay(items: readonly WbMyActivity[]) {
  const days = new Map<string, WbMyActivity[]>();
  for (const item of items) {
    const list = days.get(item.date);
    if (list) list.push(item); else days.set(item.date, [item]);
  }
  return [...days.entries()].map(([date, list]) => ({ date, items: list }));
}

/** First pages and "muat lagi" pages together, once each (the fresher copy wins). */
export function mergePages(first: readonly WbMyActivity[], more: readonly WbMyActivity[]) {
  const seen = new Set(first.map(item => item.id));
  return [...first, ...more.filter(item => !seen.has(item.id))];
}

/* ---------- Catat ---------- */

export type CatatKind = "daily" | "sport";
export type CatatDraft = { kind: CatatKind; code: string | null; mode: "fixed" | "steps" | "kcal"; fixedPoints: number; date: string; steps: string; kcal: string; minutes: string; photos: number;
  /** Days this daily type is already logged (one per day); a sport has none. */
  loggedOn?: readonly string[] };
export const ALREADY_LOGGED = "Sudah kamu catat pada tanggal ini. Pilih tanggal lain.";
export type CatatField = "sport" | "date" | "steps" | "kcal" | "minutes" | "photos";
export type CatatErrors = Partial<Record<CatatField, string>>;

const whole = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;

/** What is wrong with the form, per field (empty when it may be sent). */
export function catatErrors(draft: CatatDraft, rules: WbRules, today: string): CatatErrors {
  const errors: CatatErrors = {};
  if (draft.kind === "sport" && !draft.code) errors.sport = "Pilih jenis olahraga.";
  const date = dateProblem(draft.date, today, rules.backdateDays) ?? (draft.loggedOn?.includes(draft.date) ? ALREADY_LOGGED : null);
  if (date) errors.date = date;
  if (draft.mode === "steps") {
    const steps = whole(draft.steps);
    if (!draft.steps.trim()) errors.steps = "Isi jumlah langkah.";
    else if (!(steps >= MIN_STEPS && steps <= rules.maxSteps)) errors.steps = `Isi ${num(MIN_STEPS)} sampai ${num(rules.maxSteps)} langkah.`;
  }
  if (draft.mode === "kcal") {
    const kcal = whole(draft.kcal);
    if (!(kcal >= 1 && kcal <= rules.maxKcal)) errors.kcal = `Isi kalori 1 sampai ${num(rules.maxKcal)}.`;
    if (draft.minutes.trim()) {
      const minutes = whole(draft.minutes);
      if (!(minutes >= 1 && minutes <= 1440)) errors.minutes = "Durasi 1 sampai 1.440 menit.";
    }
  }
  if (draft.photos < 1) errors.photos = "Tambahkan minimal 1 foto bukti.";
  else if (draft.photos > rules.maxPhotos) errors.photos = `Maksimal ${num(rules.maxPhotos)} foto.`;
  return errors;
}

/** The points the form would claim now (shown on the save button and under the steps). */
export function previewPoints(draft: Pick<CatatDraft, "mode" | "fixedPoints" | "steps" | "kcal">, rules: WbRules) {
  const steps = whole(draft.steps), kcal = whole(draft.kcal);
  return claimedPoints(draft.mode, draft.fixedPoints, { steps: Number.isNaN(steps) ? 0 : steps, kcal: Number.isNaN(kcal) ? 0 : kcal }, rules);
}

/** The first field with a problem, in the order they appear on the form. */
export const firstError = (errors: CatatErrors): CatatField | null =>
  (["sport", "date", "steps", "kcal", "minutes", "photos"] as const).find(field => errors[field]) ?? null;
