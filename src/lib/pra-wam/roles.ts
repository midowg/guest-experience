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
/** Accounts, roles and rooms. */
export const managesApp = (who: WithRoles) => has(who, "admin");

/** "Peserta · Panitia" */
export const roleSummary = (who: WithRoles) => ["Peserta", ...praWamRoles.filter(role => who.roles.includes(role)).map(role => roleLabels[role])].join(" · ");
