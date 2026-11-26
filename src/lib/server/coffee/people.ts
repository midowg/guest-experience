import "server-only";
import { quotaGroupOf } from "@/lib/coffee/quota";
import type { CoffeePerson } from "@/lib/coffee/types";
import { databaseError } from "../http";
import { coffeeError, countingClaims, db } from "./store";

/* The people WG Coffee's pickers offer, and who holds its admin grant. */

type PersonRow = { id: string; full_name: string; nickname: string | null; position: string | null; business_unit: string | null; category: string | null };

/** Every active employee, by name. `month`: also how many of their claims count in that WIB month. */
export async function activePeople(month?: string): Promise<CoffeePerson[]> {
  const { data, error } = await db().from("employees").select("id,full_name,nickname,position,business_unit,category").eq("active", true).order("full_name").limit(2000);
  if (error) databaseError(error);
  const used = new Map<string, number>();
  if (month) for (const claim of await countingClaims({ months: [month] })) used.set(claim.employeeId, (used.get(claim.employeeId) ?? 0) + 1);
  return ((data ?? []) as PersonRow[]).map(person => ({
    id: person.id, name: person.full_name, nickname: person.nickname ?? "", position: person.position ?? "", bu: person.business_unit ?? "",
    group: quotaGroupOf(person.category), ...(month ? { used: used.get(person.id) ?? 0 } : {}),
  }));
}

export type CoffeeHolder = { id: string; name: string; position: string };
/** Who holds the WG Coffee grant (Pengaturan shows them; F4 notifies them). Changed in Super admin → Akses admin. */
export async function holders(): Promise<CoffeeHolder[]> {
  const { data: grants, error } = await db().from("admin_grants").select("employee_id").contains("apps", ["coffee"]).limit(500);
  // Before the grants table exists there is nobody to show; any other fault is said, not shown as "nobody".
  if (error) { if (["42P01", "PGRST205"].includes(error.code ?? "")) return []; coffeeError(error); }
  if (!grants?.length) return [];
  const ids = (grants as { employee_id: string }[]).map(row => row.employee_id);
  const { data: people, error: failed } = await db().from("employees").select("id,full_name,position").in("id", ids).eq("active", true).order("full_name");
  if (failed) coffeeError(failed);
  return ((people ?? []) as { id: string; full_name: string; position: string | null }[]).map(person => ({ id: person.id, name: person.full_name, position: person.position ?? "" }));
}
