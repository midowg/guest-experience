import "server-only";
import { cache } from "react";
import { NO_LEADS, type LeadOptions, type Leads } from "@/lib/pra-wam/leads";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { rolesOf } from "./session";
import { listUnits } from "./units";

/*
 * Who heads what (pw_leads): HOD of one or several departments (kind 'departemen', migration
 * 202611060002) and, since 9 Nov 2026, Lead (kind 'lead', migration 202611090002): a team lead
 * in their department, under the HOD, with their own people through Atasan langsung. The old
 * "lead BU" rows (kind 'bu') stay in the table but no longer count: nobody leads a BU. The leads
 * of the unit import, when it has run, count as HOD of their department.
 */

const MIGRATION = "202611060002_pra_wam_departments_bu.sql";
export const LEAD_MIGRATION = "202611090002_pra_wam_lead.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_leads|business_unit/.test(error.message ?? "");

async function listLeadsUncached(): Promise<{ byPerson: Map<string, Leads>; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data, error }, units] = await Promise.all([
    client.from("pw_leads").select("employee_id,kind,name"),
    listUnits().catch(() => ({ units: [], memberships: [], migrated: false })),
  ]);
  if (error && !missing(error)) databaseError(error);
  const byPerson = new Map<string, Leads>();
  const current = (id: string) => byPerson.get(id) ?? { departments: [], lead: false };
  const addDepartment = (id: string, name: string) => {
    const led = current(id);
    if (!led.departments.includes(name)) led.departments = [...led.departments, name].sort((a, b) => a.localeCompare(b, "id"));
    byPerson.set(id, led);
  };
  for (const row of data ?? []) {
    if (row.kind === "departemen") addDepartment(row.employee_id, row.name);
    else if (row.kind === "lead") byPerson.set(row.employee_id, { ...current(row.employee_id), lead: true });
  }
  // The unit import's leads of a department (a BU has no lead).
  const unitOf = new Map(units.units.map(unit => [unit.id, unit]));
  for (const member of units.memberships) {
    const unit = unitOf.get(member.unitId);
    if (member.isLead && unit && unit.kind !== "bu") addDepartment(member.employeeId, unit.name);
  }
  return { byPerson, migrated: !error };
}
/** Read once per request, however many parts of the page ask. */
export const listLeads = cache(listLeadsUncached);

/** What one person heads; empty when nothing. */
export async function leadsOf(employeeId: string): Promise<Leads> {
  return (await listLeads()).byPerson.get(employeeId) ?? { ...NO_LEADS };
}

/** The departments to pick from: those of Data karyawan and those already headed. */
export async function leadOptions(): Promise<LeadOptions> {
  const { data, error } = await createPrivilegedClient().from("employees").select("department").eq("active", true).limit(2000);
  if (error) databaseError(error);
  const { byPerson } = await listLeads();
  const names = [...(data ?? []).map(row => row.department as string | null), ...[...byPerson.values()].flatMap(item => item.departments)];
  return { departments: [...new Set(names.map(name => (name ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")) };
}

/**
 * Saves what this person heads, replacing what was set by hand. A BOD heads nothing. The HOD rows
 * go in first, so a Lead tick waiting for its migration never loses them.
 */
export async function setLeads(employeeId: string, leads: Leads): Promise<void> {
  const departments = [...new Set(leads.departments.map(name => name.trim()).filter(Boolean))];
  if ((departments.length || leads.lead) && (await rolesOf(employeeId)).includes("bod")) {
    throw new ServiceError(422, "BOD tidak bisa menjadi HOD atau Lead.");
  }
  const client = createPrivilegedClient();
  const { error } = await client.from("pw_leads").delete().eq("employee_id", employeeId).in("kind", ["departemen", "lead", "bu"]);
  if (error) { if (missing(error)) throw new ServiceError(503, `HOD dan Lead menunggu migrasi ${MIGRATION}.`); databaseError(error); }
  if (departments.length) {
    const { error: insertError } = await client.from("pw_leads").insert(departments.map(name => ({ employee_id: employeeId, kind: "departemen", name })));
    if (insertError) databaseError(insertError);
  }
  if (!leads.lead) return;
  // The row names the Lead's own department, for reading the table by hand.
  const { data: person } = await client.from("employees").select("department").eq("id", employeeId).maybeSingle();
  const name = ((person?.department as string | undefined) ?? "").trim() || "Lead";
  const { error: leadError } = await client.from("pw_leads").insert({ employee_id: employeeId, kind: "lead", name });
  if (leadError) {
    // 23514: the kind check of 202611060002 does not know 'lead' yet.
    if (leadError.code === "23514") throw new ServiceError(503, `HOD tersimpan; Lead menunggu migrasi ${LEAD_MIGRATION}.`);
    databaseError(leadError);
  }
}
