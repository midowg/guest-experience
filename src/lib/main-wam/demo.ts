import type { PraWamRole } from "@/lib/pra-wam/roles";
import { mainWamCan, mainWamRole, type MainWamAction } from "./access";
import { DEMO_ROLES, MAIN_WAM_MODULES, type DemoRole, type MainWamModule, type MainWamViewer, type ModuleSwitches, type ViewerDemo } from "./types";

/*
 * Mode demo (docs/main-wam/KONTRAK.md §12): Admin WAM → Main WAM → Pengaturan can show every screen with
 * sample data, to try the app before the event. The flag lives in mw_settings.module_config.demo (no
 * migration). While it is on:
 *  - every module is drawn on (the saved choice is not changed), Silent Meeting excepted (it is Pra WAM's);
 *  - a penguji (admin, panitia, the list) can pick "Lihat sebagai: Peserta / Panitia / BOD" (a cookie on
 *    the device) and sees the app as that role; the server still checks the account's real roles, and a
 *    chosen role only draws and reads: its writes are refused with a friendly message (gate.ts);
 *  - readers fall back to sample data where the real tables are empty (src/lib/server/main-wam/demo/).
 * Off (the default), none of this exists: the cookie is ignored and nothing changes. Pure.
 */

export const DEMO_ROLE_COOKIE = "mw_demo_role";
const ONE_YEAR = 60 * 60 * 24 * 365;

export const demoRoleLabels: Record<DemoRole, string> = { peserta: "Peserta", panitia: "Panitia", bod: "BOD" };

/** Anything unknown or missing is no choice. */
export const parseDemoRole = (value: string | null | undefined): DemoRole | null => ((DEMO_ROLES as readonly string[]).includes(value ?? "") ? value as DemoRole : null);

/**
 * The document.cookie string that keeps the choice for a year (and an empty one to forget it). Path `/`, not WAM's:
 * the APIs under /api/wam read it too, so a page and its data agree. The server ignores it for anyone who is not a penguji.
 */
export function demoRoleCookie(role: DemoRole | null, secure: boolean): string {
  return `${DEMO_ROLE_COOKIE}=${role ?? ""}; Path=/; Max-Age=${role ? ONE_YEAR : 0}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The account roles a chosen role stands for. */
export const demoRoles = (role: DemoRole): PraWamRole[] => (role === "panitia" ? ["panitia"] : role === "bod" ? ["bod"] : []);

/** The role an account is drawn as before anyone picks (BOD, panitia; admin and everyone else as peserta). */
export function ownDemoRole(roles: readonly PraWamRole[]): DemoRole {
  const role = mainWamRole({ roles });
  return role === "bod" || role === "panitia" ? role : "peserta";
}

/** The modules while Mode demo is on: all of them, Silent Meeting as saved. The saved choice itself is never rewritten. */
export function effectiveModules(saved: ModuleSwitches, demo: boolean): ModuleSwitches {
  if (!demo) return saved;
  return Object.fromEntries(MAIN_WAM_MODULES.map(key => [key, key === "silent" ? saved.silent : true])) as ModuleSwitches;
}

/**
 * The viewer's part in Mode demo. A penguji with a chosen role is drawn as that role (`simulated` when it
 * differs from the account's own); everyone else is drawn as they are, with no switch.
 */
export function demoViewer(account: { roles: PraWamRole[]; tester: boolean }, chosen: DemoRole | null): { roles: PraWamRole[]; demo: ViewerDemo } {
  const own = ownDemoRole(account.roles);
  if (!account.tester || !chosen) return { roles: account.roles, demo: { canSwitch: account.tester, role: own, simulated: false, realRoles: account.roles } };
  const roles = demoRoles(chosen);
  // Drawn as the chosen role; "simulated" when that is not what the account is (a BOD choosing BOD is not).
  const simulated = chosen !== own || (chosen === "peserta" && account.roles.length > 0);
  return { roles, demo: { canSwitch: true, role: chosen, simulated, realRoles: account.roles } };
}

/** Is the viewer drawn as a role the account is not (reading only: the server refuses its writes)? */
export const isSimulated = (viewer: Pick<MainWamViewer, "demo">): boolean => viewer.demo?.simulated === true;

/**
 * Does this read use sample data only? True when the viewer is drawn as a role whose right the account
 * does not have: the real panitia or BOD data is not theirs to read, so the screen shows the sample.
 */
export function sampleOnlyFor(viewer: Pick<MainWamViewer, "demo">, action: MainWamAction): boolean {
  return !!viewer.demo?.simulated && !mainWamCan({ roles: viewer.demo.realRoles }, action);
}

/** What a refused write says (an error toast). */
export const DEMO_WRITE_MESSAGE = "Contoh: tidak disimpan. Mode demo hanya untuk melihat tampilan.";

export type { MainWamModule };

/* ── The sample clock ─────────────────────────────────────────────────────────────────────────── */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
/** The sample rundown's second day (Sel, 5 Jan: the day most screens are drawn on). */
export const SAMPLE_ANCHOR_DATE = "2027-01-05";
const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** Today's WIB date as "YYYY-MM-DD". */
export const wibToday = (now: Date): string => new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

/** How many days to move the sample so its second day is today (WIB). */
export const sampleShiftDays = (now: Date): number => dayNumber(wibToday(now)) - dayNumber(SAMPLE_ANCHOR_DATE);

const shiftDate = (date: string, days: number) => new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
const SAMPLE_INSTANT = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}:\d{2}\+07:00)$/;
const SAMPLE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The sample moved by `days` (sample dates are WIB: "2027-01-05" and "2027-01-05T09:00:00+07:00"), so that
 * the demo shows "now" on a real day: sessions that are over, running and coming. Everything else is copied as it is.
 */
export function shiftSample<T>(value: T, days: number): T {
  if (days === 0) return value;
  const move = (item: unknown): unknown => {
    if (typeof item === "string") {
      const instant = SAMPLE_INSTANT.exec(item);
      if (instant) return `${shiftDate(instant[1], days)}${instant[2]}`;
      return SAMPLE_DATE.test(item) ? shiftDate(item, days) : item;
    }
    if (Array.isArray(item)) return item.map(move);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, move(inner)]));
    return item;
  };
  return move(value) as T;
}
