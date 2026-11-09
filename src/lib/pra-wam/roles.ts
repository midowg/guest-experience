/*
 * Pra WAM roles. Everyone with an account is a peserta; a role adds to that and a person can hold
 * several (migration 202611040002). What a role allows is decided here, used by the server for
 * every request and by the pages only to show or hide what the server would refuse anyway.
 */

export const praWamRoles = ["panitia", "bod", "admin"] as const;
export type PraWamRole = (typeof praWamRoles)[number];
export const roleLabels: Record<PraWamRole, string> = { panitia: "Panitia", bod: "BOD", admin: "Admin WAM" };

type WithRoles = { roles: readonly PraWamRole[] };
const has = (who: WithRoles, ...roles: PraWamRole[]) => roles.some(role => who.roles.includes(role));

/** Sees who takes part in every appraisal booking, not only in their own. */
export const seesAllParticipants = (who: WithRoles) => has(who, "panitia", "bod", "admin");
/** May cancel someone else's booking (for a forum that needs the room, say). */
export const cancelsAnyBooking = (who: WithRoles) => has(who, "panitia", "admin");
/** Makes, publishes and cancels sessions, picks their rooms, and uploads any document. */
export const managesSessions = (who: WithRoles) => has(who, "panitia", "admin");
/** Sees every session, drafts included (BOD reads, panitia and admin also change). */
export const seesAllSessions = (who: WithRoles) => has(who, "panitia", "bod", "admin");
/**
 * A BOD lands on Ringkasan and gets the BOD menu (Penpot "Panduan · BOD"). BOD now stands alone
 * (see `roleConflicts`); the panitia/admin check only keeps a row saved before that rule on the
 * app it had, until the super admin removes one of the two.
 */
export const bodOnly = (who: WithRoles) => has(who, "bod") && !has(who, "panitia", "admin");
/**
 * Kebutuhan peserta (food and allergies by name, prayer, readiness, shirts): the panitia who serve
 * and run the activities, and admin. Not BOD, who reads summaries, never people one by one.
 */
export const readsNeeds = (who: WithRoles) => has(who, "panitia", "admin");
/** Accounts, roles and rooms. */
export const managesApp = (who: WithRoles) => has(who, "admin");
/**
 * HOD (6 Nov 2026): not a role to tick but who heads at least one department (pw_leads, set in
 * Akun dan peran or Data karyawan; or a lead of the unit import). Opens Meeting HOD in Book.
 */
export const isHod = ({ isLead = false }: Standing = {}) => isLead;

/*
 * Which roles go together. Peserta is everyone's base. Panitia, Admin WAM and HOD (who heads a
 * department, or is a Lead) combine freely. BOD combines with nothing:
 * a BOD still attends sessions and books rooms as a peserta, but is never panitia, admin or lead.
 */
export type RoleConflict = { with: "panitia" | "admin" | "lead"; message: string };
type Standing = { isLead?: boolean };

/** Each thing a BOD also holds, with why it cannot be; empty when the combination is allowed. */
export function roleConflicts(roles: readonly PraWamRole[], { isLead = false }: Standing = {}): RoleConflict[] {
  if (!roles.includes("bod")) return [];
  const conflicts: RoleConflict[] = [];
  if (roles.includes("panitia")) conflicts.push({ with: "panitia", message: "BOD tidak bisa digabung dengan Panitia." });
  if (roles.includes("admin")) conflicts.push({ with: "admin", message: "BOD tidak bisa digabung dengan Admin WAM." });
  if (isLead) conflicts.push({ with: "lead", message: "BOD tidak bisa menjadi HOD atau Lead." });
  return conflicts;
}

/** One sentence for a refused combination, or null when it is allowed. */
export function roleProblem(roles: readonly PraWamRole[], standing: Standing = {}): string | null {
  const conflicts = roleConflicts(roles, standing);
  if (!conflicts.length) return null;
  const roleClash = conflicts.some(conflict => conflict.with !== "lead");
  const leadClash = conflicts.some(conflict => conflict.with === "lead");
  return [
    roleClash && "BOD tidak bisa digabung dengan Panitia atau Admin WAM.",
    leadClash && "BOD tidak bisa menjadi HOD atau Lead.",
  ].filter(Boolean).join(" ");
}

/** Known roles, each once, in the usual order. */
export const normalizeRoles = (roles: readonly string[]): PraWamRole[] => praWamRoles.filter(role => roles.includes(role));

/**
 * Whether the super admin may save `next` for someone who holds `current`. A change may not add a
 * conflict; one that only removes is always allowed, so a row saved before the rule can be fixed
 * one tick at a time.
 */
export function checkRoleChange(current: readonly PraWamRole[], next: readonly PraWamRole[], standing: Standing = {}): string | null {
  const before = new Set(roleConflicts(current, standing).map(conflict => conflict.with));
  const added = roleConflicts(next, standing).filter(conflict => !before.has(conflict.with));
  return added.length ? roleProblem(next, standing) : null;
}

/**
 * For the super admin's checkboxes: each role that cannot be ticked now, with the reason. A role
 * already held is never blocked, so it can always be unticked.
 */
export function blockedRoles(roles: readonly PraWamRole[], { isLead = false }: Standing = {}): Partial<Record<PraWamRole, string>> {
  const blocked: Partial<Record<PraWamRole, string>> = {};
  if (roles.includes("bod")) {
    for (const role of ["panitia", "admin"] as const) if (!roles.includes(role)) blocked[role] = "Panitia dan Admin WAM terkunci karena orang ini BOD.";
  } else if (has({ roles }, "panitia", "admin")) {
    blocked.bod = "BOD terkunci karena orang ini Panitia atau Admin WAM.";
  } else if (isLead) {
    blocked.bod = "BOD terkunci karena orang ini HOD atau Lead.";
  }
  return blocked;
}

/** "Peserta · Panitia" */
export const roleSummary = (who: WithRoles) => ["Peserta", ...praWamRoles.filter(role => who.roles.includes(role)).map(role => roleLabels[role])].join(" · ");
