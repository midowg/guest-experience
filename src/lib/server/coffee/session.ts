import "server-only";
import { redirect } from "next/navigation";
import { opensGaMode, processorLabel } from "@/lib/coffee/access";
import { coffeePath } from "@/lib/routes";
import { currentAdmin } from "../admin-session";
import { ServiceError } from "../config";
import { currentMember, requireApiMember, type Member } from "../pra-wam/session";
import { createPrivilegedClient } from "../supabase/admin";
import type { CoffeeActor } from "./store";

/*
 * Who is signed in to WG Coffee (25 Nov 2026). The account is the employee's own (the same
 * one WAM, Booking Kantor and WG People use: one email, one password, one session cookie), but a
 * stranger is sent to Coffee's own sign-in page. Mode GA (the tablet) opens for the GA group, Admin
 * Booking, and whoever holds the WG Coffee grant. The pengelola work in Journey Admin
 * (/admin/coffee), behind the admin sign-in and that grant.
 */

/** For pages: the signed-in person, or a trip to Coffee's sign-in that comes back here. */
export async function requireCoffeePage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(coffeePath.login(here));
  return member;
}

/** Does this person hold the WG Coffee admin grant? Unknown (no table yet, a database hiccup) is no. */
export async function holdsCoffeeGrant(employeeId: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().from("admin_grants").select("apps").eq("employee_id", employeeId).maybeSingle();
  if (error || !data) return false;
  return ((data as { apps: string[] | null }).apps ?? []).includes("coffee");
}

/** May this person use Mode GA? The GA group (category dw/ga), Admin Booking, or a holder of the WG Coffee grant. */
export const opensGa = async (member: Member) => opensGaMode({ category: member.category, roles: member.roles, holdsCoffee: await holdsCoffeeGrant(member.id) });
export const GA_ONLY = "Mode GA hanya untuk tim GA dan pengelola WG Coffee.";

/**
 * For the tablet page: someone signed in who may use Mode GA. A stranger goes to the tablet's own
 * sign-in (26 Nov 2026) and comes back here; someone signed in without Mode GA goes there too,
 * where the page says so and offers to sign out (never a silent bounce to the employee app).
 */
export async function requireGaPage(here: string): Promise<Member> {
  const member = await currentMember();
  if (!member) redirect(coffeePath.gaLogin(here === coffeePath.ga ? undefined : here));
  if (!(await opensGa(member))) redirect(coffeePath.gaLogin());
  return member;
}

export async function requireApiGa(): Promise<Member> {
  const member = await requireApiMember();
  if (!(await opensGa(member))) throw new ServiceError(403, GA_ONLY);
  return member;
}

/**
 * Who acts in /admin/coffee, for "diproses oleh": their employee row when they have one, and the
 * name the claimant sees (the nickname; "Super admin" for the super admin).
 */
export async function coffeeActor(): Promise<CoffeeActor> {
  const actor = await currentAdmin();
  if (!actor) return { employeeId: null, label: "Admin" };
  if (actor.kind !== "person") return { employeeId: null, label: processorLabel({ name: actor.name, superAdmin: actor.kind === "super" }) };
  const { data } = await createPrivilegedClient().from("employees").select("nickname").eq("id", actor.employeeId).maybeSingle();
  return { employeeId: actor.employeeId, label: processorLabel({ name: actor.name, nickname: (data as { nickname?: string | null } | null)?.nickname }) };
}
