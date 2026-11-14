import { z } from "zod";

/*
 * Akses admin per orang (13 Nov 2026, migration 202611130012). The shared admin password is
 * retired: each admin signs in with their own WAM account, and the super admin decides what each
 * one opens: whole admin apps, and which events. Someone who is an event's PIC (Tim Werkudara,
 * linked to their Data karyawan row) always opens that event. Pure, so it is tested without a server.
 */

export const ADMIN_GRANTS_MIGRATION = "202611130012_admin_grants.sql";
/** Set by src/proxy.ts on every admin request (any value a browser sends is replaced): the path asked for. */
export const ADMIN_PATH_HEADER = "x-wk-admin-path";

// "kuesioner" (14 Nov 2026, migration 202611140001): the WAM questionnaire inside Admin WAM, given
// on its own, for Admin WAM holders too (Admin WAM alone no longer opens it).
export const ADMIN_APPS = ["acara", "friday_sharing", "your_visit", "wam", "kuesioner", "tv"] as const;
export type AdminApp = (typeof ADMIN_APPS)[number];
export const ADMIN_KUESIONER_MIGRATION = "202611140001_admin_grants_kuesioner.sql";
export const adminAppLabels: Record<AdminApp, string> = {
  acara: "Acara", friday_sharing: "Friday Sharing", your_visit: "Your Visit", wam: "Admin WAM", kuesioner: "Kuesioner WAM", tv: "TV kantor",
};
export const adminAppHints: Record<AdminApp, string> = {
  acara: "Undangan, kartu, e-guide, dan kunjungan: membuat acara dan membuka acara yang dipilih di bawah.",
  friday_sharing: "Halaman donasi Friday Sharing dan laporannya.",
  your_visit: "Panduan kunjungan kantor (Your Visit).",
  wam: "Admin WAM: akun, ruang, MoM, Telegram, tema, dan lainnya. Kuesioner diatur sendiri di bawah.",
  kuesioner: "Kuesioner di Admin WAM: isi, pengaturan, progres, rekap, Data HR, kamar, dan kartu. Bisa diberikan tanpa Admin WAM; Admin WAM tanpa centang ini tidak bisa membuka kuesioner.",
  tv: "TV kantor: layar, tayangan, dan tampilan.",
};
/** Opens the WAM questionnaire: only with its own grant. */
export const opensQuestionnaire = (apps: readonly AdminApp[]) => apps.includes("kuesioner");

export type AdminGrant = {
  employeeId: string;
  apps: AdminApp[];
  /** With Acara: every event, not only the ones picked. */
  allEvents: boolean;
  /** Events this admin opens by name (any kind), on top of the apps. */
  eventIds: string[];
};

export const adminGrantSchema = z.object({
  apps: z.array(z.enum(ADMIN_APPS)).max(ADMIN_APPS.length).default([]),
  allEvents: z.boolean().default(false),
  eventIds: z.array(z.uuid()).max(500).default([]),
});
export type AdminGrantInput = z.infer<typeof adminGrantSchema>;

/** One order and no repeats; without Acara there is no "every event". */
export function tidyGrant(input: AdminGrantInput): Omit<AdminGrant, "employeeId"> {
  const apps = ADMIN_APPS.filter(app => input.apps.includes(app));
  const allEvents = apps.includes("acara") && input.allEvents;
  return { apps, allEvents, eventIds: allEvents ? [] : [...new Set(input.eventIds)] };
}

/**
 * Which part of the admin a path is, so one check in the session guard covers every page and API
 * of an app. "events" pages and APIs check the event itself; "home" is open to every admin;
 * "super" only to the super admin; null (unknown) is closed to a personal admin.
 */
export type AdminArea = AdminApp | "events" | "home" | "super";
const areas: [RegExp, AdminArea][] = [
  [/^\/admin\/?$/, "home"],
  [/^\/admin\/(super|akses)(\/|$)/, "super"],
  [/^\/admin\/wam\/tv(\/|$)/, "tv"],
  [/^\/admin\/wam\/kuesioner(\/|$)/, "kuesioner"],
  [/^\/admin\/wam(\/|$)/, "wam"],
  [/^\/admin\/tv(\/|$)/, "tv"],
  [/^\/admin\/friday-sharing(\/|$)/, "friday_sharing"],
  [/^\/admin\/your-visit(\/|$)/, "your_visit"],
  [/^\/admin\/(acara|checkin|events|hero-preview|pratinjau-langsung)(\/|$)/, "events"],
  [/^\/api\/admin\/wam\/tv(\/|$)/, "tv"],
  [/^\/api\/admin\/wam\/questionnaire(\/|$)/, "kuesioner"],
  [/^\/api\/admin\/wam(\/|$)/, "wam"],
  [/^\/api\/admin\/(events|featured|photos|poster-designs|staff)(\/|$)/, "events"],
  [/^\/api\/admin\/(employees|modules|templates|visibility|grants)(\/|$)/, "super"],
];
export function areaOfPath(path: string | null | undefined): AdminArea | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0];
  return areas.find(([pattern]) => pattern.test(clean))?.[1] ?? null;
}

/** May a personal admin open this part of the admin at all? */
export function mayOpenArea(grant: AdminGrant, area: AdminArea | null): boolean {
  if (area === "home" || area === "events") return true;
  if (area === null || area === "super") return false;
  if (area === "kuesioner") return opensQuestionnaire(grant.apps);
  return grant.apps.includes(area);
}

export type EventForAccess = { id: string; kind: string; hidden: boolean; picStaffId: string };

/**
 * May a personal admin open this event? Their own (PIC) and picked events always; then by app:
 * Friday Sharing and Your Visit open their kind; Acara with "every event" opens the rest. An event
 * the super admin hid stays hidden unless it is theirs or picked.
 */
export function mayOpenEvent(grant: AdminGrant, staffIds: ReadonlySet<string>, event: EventForAccess): boolean {
  if (event.picStaffId && staffIds.has(event.picStaffId)) return true;
  if (grant.eventIds.includes(event.id)) return true;
  if (event.hidden) return false;
  if (event.kind === "csr") return grant.apps.includes("friday_sharing");
  if (event.kind === "panduan") return grant.apps.includes("your_visit");
  return grant.apps.includes("acara") && grant.allEvents;
}

/**
 * Which app cards the admin home shows (Aplikasi): everything for the super admin (grant null);
 * for a personal admin only WAM and TV kantor when given. Booking Kantor is never theirs here: it
 * is managed inside the booking app by Admin Booking.
 */
export function showsAppCard(grant: Pick<AdminGrant, "apps"> | null, key: string): boolean {
  if (!grant) return true;
  if (key === "wam") return grant.apps.includes("wam") || opensQuestionnaire(grant.apps);
  return key === "tv" && grant.apps.includes("tv");
}

/**
 * The Admin WAM menu sections a personal admin does not get (14 Nov 2026): Kuesioner without its
 * grant, TV kantor without its grant, and the rest of Admin WAM without Admin WAM.
 */
export function wamSectionsWithout<K extends string>(apps: readonly AdminApp[], keys: readonly K[]): K[] {
  return keys.filter(key => key === "kuesioner" ? !apps.includes("kuesioner") : key === "tv" ? !apps.includes("tv") : !apps.includes("wam"));
}

/** "Acara: semua", "3 acara", "hanya acara PIC-nya" — the events part of a grant in a few words. */
export function grantEventsLabel(grant: Pick<AdminGrant, "apps" | "allEvents" | "eventIds">): string {
  if (grant.allEvents) return "Semua acara";
  if (grant.eventIds.length) return `${grant.eventIds.length} acara dipilih`;
  return grant.apps.includes("acara") ? "Hanya acara PIC-nya" : "—";
}
