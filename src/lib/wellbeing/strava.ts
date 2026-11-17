import { claimedPoints, type WellbeingSettings } from "./rules";

/*
 * WLM Strava (18 Nov 2026, docs/rancangan-wellbeing.md "Strava"): the pure rules, without a database
 * or a network, so they are tested on their own. The server half is src/lib/server/wellbeing/strava.ts.
 */

export const MIGRATION_STRAVA = "202611180002_wellbeing_strava.sql";

/** What WLM asks of Strava: the profile (the name shown) and every activity, also "Only you" ones. */
export const STRAVA_SCOPE = "read,activity:read_all";

/** The person may untick permissions on Strava's page: without reading activities nothing can be counted. */
export const scopeOk = (scope: string | null | undefined) => /(^|[ ,])activity:read(_all)?($|[ ,])/.test(scope ?? "");

/**
 * Strava's sport_type → the WLM catalogue's sport code. The codes are the old app's sports, imported
 * 17 Nov 2026 (its Strava names: Walk → Walking, Ride → Cycling, Dance → Zumba/Aerobik, and so on).
 * Anything else, or a code switched off by the admin, counts as Olahraga lain (sport.other).
 */
export const STRAVA_SPORT_CODES: Readonly<Record<string, string>> = {
  Run: "sport.running", VirtualRun: "sport.running", TrailRun: "sport.trail_run",
  Walk: "sport.walking", Hike: "sport.hiking",
  Ride: "sport.cycling", EBikeRide: "sport.cycling", GravelRide: "sport.cycling", Velomobile: "sport.cycling", Handcycle: "sport.cycling",
  MountainBikeRide: "sport.mountain_bike", EMountainBikeRide: "sport.mountain_bike", VirtualRide: "sport.virtual_ride",
  Swim: "sport.swimming",
  Workout: "sport.workout", HighIntensityIntervalTraining: "sport.hiit", WeightTraining: "sport.weight_training", Crossfit: "sport.crossfit",
  Yoga: "sport.yoga", Pilates: "sport.pilates", Dance: "sport.zumba_aerobik",
  Soccer: "sport.soccer_futsal", Badminton: "sport.badminton", Tennis: "sport.tennis", Basketball: "sport.basketball", Volleyball: "sport.volleyball",
  Rowing: "sport.rowing", VirtualRow: "sport.rowing", Elliptical: "sport.elliptical",
};
export const STRAVA_FALLBACK_CODE = "sport.other";

/** The catalogue code for this Strava sport, among the active sport codes (the fallback, else the first active one). */
export function sportCodeFor(sportType: string | null | undefined, active: ReadonlySet<string>): string | null {
  const wanted = sportType ? STRAVA_SPORT_CODES[sportType] : undefined;
  if (wanted && active.has(wanted)) return wanted;
  if (active.has(STRAVA_FALLBACK_CODE)) return STRAVA_FALLBACK_CODE;
  return [...active][0] ?? null;
}

/** The part of Strava's DetailedActivity WLM keeps: what is shown and counted, nothing more. */
export type StravaActivity = {
  id: number; name?: string; sport_type?: string; type?: string;
  /** Local time of the start, written with a "Z" by Strava ("2026-11-18T06:05:00Z" = 06.05 where it happened). */
  start_date_local: string;
  moving_time?: number; elapsed_time?: number; distance?: number; calories?: number;
};

export type StravaRow = { happened_on: string; happened_time: string | null; title: string; kcal: number | null; minutes: number | null; distance_m: number | null; points: number };

/** One Strava activity as a WLM row: its local day and time, its name, and points from its calories (1 kcal = 1 poin, up to the daily cap). */
export function stravaRow(activity: StravaActivity, settings: Pick<WellbeingSettings, "maxKcal" | "maxSteps">): StravaRow {
  const kcal = typeof activity.calories === "number" && activity.calories > 0 ? Math.min(20_000, Math.round(activity.calories)) : null;
  const seconds = activity.moving_time ?? activity.elapsed_time;
  return {
    happened_on: activity.start_date_local.slice(0, 10),
    happened_time: /T\d{2}:\d{2}/.test(activity.start_date_local) ? activity.start_date_local.slice(11, 16) : null,
    title: (activity.name ?? "").trim().slice(0, 200),
    kcal,
    minutes: typeof seconds === "number" && seconds > 0 ? Math.min(1440, Math.round(seconds / 60)) : null,
    distance_m: typeof activity.distance === "number" && activity.distance > 0 ? Math.min(1_000_000, Math.round(activity.distance)) : null,
    points: claimedPoints("kcal", 0, { kcal }, settings),
  };
}

/** Who appears on Strava's page and in Profil: "Dewi C." from the athlete's first and last name. */
export const athleteName = (athlete: { firstname?: string | null; lastname?: string | null } | null | undefined) =>
  [athlete?.firstname?.trim(), athlete?.lastname?.trim()].filter(Boolean).join(" ").slice(0, 150);
