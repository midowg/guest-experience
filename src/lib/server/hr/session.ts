import "server-only";
import { redirect } from "next/navigation";
import { hrPath } from "@/lib/routes";
import { currentAdmin } from "../admin-session";
import { currentMember, type Member } from "../pra-wam/session";
import type { AdminActorRef } from "./attendance";

/*
 * Who is signed in to HR Werkudara (/hr, 20 Nov 2026). The account is the employee's own (the same
 * one WAM and Booking Kantor use: one email, one password, one session cookie), but a stranger is
 * sent to HR's own sign-in page. HR's admin is in Journey Admin (/admin/hr), behind the admin
 * sign-in and the "HR Werkudara" grant of Super admin → Akses admin.
 */

/** For pages: the signed-in person, or a trip to HR's sign-in that comes back here. */
export async function requireHrPage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(hrPath.login(here));
  return member;
}

/** Who acts in Admin HR, for "dicatat oleh" and "ditinjau oleh": their employee row when they have one, always a name. */
export async function hrAdminActor(): Promise<AdminActorRef> {
  const actor = await currentAdmin();
  if (!actor) return { employeeId: null, label: "Admin" };
  return { employeeId: actor.kind === "person" ? actor.employeeId : null, label: actor.kind === "super" ? "Super admin" : actor.name || "Admin" };
}
