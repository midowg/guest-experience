import "server-only";
import { redirect } from "next/navigation";
import { managesHr, normalizeRoles } from "@/lib/pra-wam/roles";
import { hrPath } from "@/lib/routes";
import { ServiceError } from "../config";
import { listAccounts, setRoles } from "../pra-wam/accounts";
import { currentMember, requireApiMember, rolesOf, type Member } from "../pra-wam/session";
import type { AdminActorRef } from "./attendance";

/*
 * Who is signed in to HR Werkudara (/hr, 20 Nov 2026). The account is the employee's own (the same
 * one WAM and Booking Kantor use: one email, one password, one session cookie), but a stranger is
 * sent to HR's own sign-in page. Kelola is for Admin HR (role "hr") only, apart from WAM's roles.
 */

/** For pages: the signed-in person, or a trip to HR's sign-in that comes back here. */
export async function requireHrPage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(hrPath.login(here));
  return member;
}
/** For Kelola pages: Admin HR, else back to Absen. */
export async function requireHrAdminPage(here: string): Promise<Member> {
  const member = await requireHrPage(here);
  if (!managesHr(member)) redirect(hrPath.home);
  return member;
}
export async function requireApiHrAdmin(): Promise<Member> {
  const member = await requireApiMember();
  if (!managesHr(member)) throw new ServiceError(403, "Hanya Admin HR yang bisa membuka ini.");
  return member;
}
/** Who acts in Kelola, for "dicatat oleh" and "ditinjau oleh". */
export const actorOf = (member: Member): AdminActorRef => ({ employeeId: member.id, label: member.name });

export type HrAccessRow = { employeeId: string; name: string; department: string; hasAccount: boolean; hr: boolean };

/** Everyone active, with whether they are Admin HR. */
export async function hrAccessList(): Promise<HrAccessRow[]> {
  const { rows } = await listAccounts();
  return rows.filter(row => row.active).map(row => ({ employeeId: row.employeeId, name: row.name, department: row.department, hasAccount: row.hasAccount, hr: row.roles.includes("hr") }));
}

/** Gives or takes Admin HR, keeping the person's other roles. Nobody takes their own away (someone else must). */
export async function setHrAdmin(employeeId: string, on: boolean, viewer: Member): Promise<void> {
  if (!on && employeeId === viewer.id) throw new ServiceError(422, "Akses sendiri tidak bisa dicabut. Minta Admin HR lain.");
  const current = await rolesOf(employeeId);
  const next = on ? [...current, "hr" as const] : current.filter(role => role !== "hr");
  // Before migration 202611200702 the database refuses the role; setRoles answers with its own error then.
  await setRoles(employeeId, normalizeRoles(next));
}
