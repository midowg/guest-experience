import type { PraWamRole } from "@/lib/pra-wam/roles";
import type { MainWamMode, MainWamRole, MainWamModule, ModuleSwitches } from "./types";

/*
 * Who sees Main WAM, and what each role may do in it (docs/main-wam/KONTRAK.md §3). Pure: the server
 * decides with these on every request (gate.ts), the screens use them only to hide what the server
 * would refuse anyway.
 *
 * Mode acara (Admin WAM 2027 → Pengaturan):
 *   pra    (bawaan) /wam is Pra WAM for everyone. Main WAM opens by its address for penguji only
 *          (to prepare it); for anyone else it does not exist (404).
 *   uji    /wam opens Main WAM for penguji; everyone else keeps Pra WAM and gets 404 on Main WAM.
 *   semua  /wam opens Main WAM for everyone. Pra WAM stays at its addresses (praWamPath.homePra).
 * Penguji: Panitia WAM and the people on the list an admin picks (mw_testers).
 *
 * The roles here are Main WAM's own (20 Nov 2026, KONTRAK §15), from mainWamRolesOf: "panitia" means Panitia
 * WAM (pw_event_staff of the WAM event), never Pra WAM's committee; Pra WAM's "admin" role means nothing
 * here; BOD stays the account's BOD role.
 */

type WithRoles = { roles: readonly PraWamRole[] };
const has = (who: WithRoles, ...roles: PraWamRole[]) => roles.some(role => who.roles.includes(role));

/**
 * A WAM account's roles as Main WAM sees them: BOD (and any other role but Pra WAM's panitia and admin) as
 * on the account, plus "panitia" when the person is on Panitia WAM.
 */
export function mainWamRolesOf(accountRoles: readonly PraWamRole[], onStaff: boolean): PraWamRole[] {
  const kept = accountRoles.filter(role => role !== "panitia" && role !== "admin");
  return onStaff ? [...kept, "panitia"] : kept;
}

/** Panitia WAM always test; anyone else only when on the list (Main WAM's roles, mainWamRolesOf). */
export const isTester = (who: WithRoles, listed: boolean) => listed || has(who, "panitia");

/** What a request to Main WAM gets. */
export type MainWamGate =
  /** Show Main WAM. */
  | { kind: "masuk" }
  /** Not signed in: to this sign-in page first (Main WAM's own only when it is on for everyone). */
  | { kind: "login"; page: "main" | "pra" }
  /** Main WAM is not on for this person: it does not exist for them (404). */
  | { kind: "tutup" };

/** The gate for one person (null: nobody signed in) in a mode. */
export function mainWamGate(mode: MainWamMode, viewer: { tester: boolean } | null): MainWamGate {
  if (!viewer) return { kind: "login", page: mode === "semua" ? "main" : "pra" };
  if (mode === "semua" || viewer.tester) return { kind: "masuk" };
  return { kind: "tutup" };
}

/** Whether /wam (Pra WAM's Beranda) sends this person on to Main WAM. Never in mode pra. */
export function opensMainWamHome(mode: MainWamMode, viewer: { tester: boolean } | null): boolean {
  if (mode === "semua") return true;
  return mode === "uji" && !!viewer?.tester;
}

/** Is Main WAM live for anyone who is not a penguji (notifications to everyone, the TV)? */
export const liveForEveryone = (mode: MainWamMode) => mode === "semua";

/** The role Main WAM draws for (one, even for someone with several): BOD, then panitia, then admin. */
export function mainWamRole(who: WithRoles): MainWamRole {
  if (has(who, "bod")) return "bod";
  if (has(who, "panitia")) return "panitia";
  if (has(who, "admin")) return "admin";
  return "peserta";
}

/**
 * Whether the bottom bar has the fifth tab, Panitia: only for Panitia WAM (20 Nov 2026: not Pra WAM's
 * committee or admins), not a BOD or a peserta. The hub page uses the same "kelola" gate.
 */
export const showsCommitteeTab = (who: WithRoles) => has(who, "panitia");

/** Everything a role may do in Main WAM. Peserta is everyone's base; roles add, they never change the tabs. */
export const MAIN_WAM_ACTIONS = [
  /** Absen: scan the QR (BOD do not check in). */
  "absen",
  /** Momen: send, like, report photos. */
  "foto",
  /** Silent Meeting: send anonymous feedback (BOD read the recap instead). */
  "silent-kirim",
  /** Awarding: vote (BOD approve instead). */
  "voting",
  /** Panitia's 4 tools: Rundown live, Absen manual, Pengumuman, Moderasi (Panitia WAM only). */
  "kelola",
  /** Open or close a Silent Meeting by hand. */
  "silent-kontrol",
  /** BOD's Ringkasan: Kehadiran, Awarding, Silent Meeting recap, Jejak karbon. */
  "ringkasan",
  /** Approve an award's winner. */
  "awarding-setujui",
  /** Read the Silent Meeting recap. */
  "silent-rekap",
] as const;
export type MainWamAction = (typeof MAIN_WAM_ACTIONS)[number];

/** May this person do this in Main WAM? (The server repeats it; modules are checked apart, moduleAllows.) */
export function mainWamCan(who: WithRoles, action: MainWamAction): boolean {
  const bod = has(who, "bod");
  const manages = has(who, "panitia");
  switch (action) {
    case "absen": case "silent-kirim": case "voting": return !bod;
    case "foto": return true;
    case "kelola": case "silent-kontrol": return manages;
    case "ringkasan": case "awarding-setujui": case "silent-rekap": return bod;
  }
}

/** The module an action belongs to; it is refused (and hidden) while that module is off. */
export const actionModule: Partial<Record<MainWamAction, MainWamModule>> = {
  absen: "absen", "silent-kirim": "silent", "silent-kontrol": "silent", "silent-rekap": "silent", voting: "voting", "awarding-setujui": "voting",
};

/** The action is allowed for the person and its module (if any) is on. */
export function moduleAllows(who: WithRoles, action: MainWamAction, modules: ModuleSwitches): boolean {
  const needs = actionModule[action];
  return mainWamCan(who, action) && (!needs || modules[needs]);
}
