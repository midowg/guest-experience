import "server-only";
import { cache } from "react";
import { BUSINESS_UNITS, buCode, type Leads } from "@/lib/pra-wam/leads";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { rolesOf } from "./session";
import { listUnits } from "./units";

/*
 * Who heads what (migration 202611060002): a person may be HOD of several departments and lead of
 * a BU, set by hand in Akun dan peran or Data karyawan. Departments are the department names of
 * Data karyawan; BUs the business_unit names. The leads of the unit import, when it has run, count
 * as HOD of their department too.
 */

const MIGRATION = "202611060002_pra_wam_departments_bu.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_leads|business_unit/.test(error.message ?? "");

async function listLeadsUncached(): Promise<{ byPerson: Map<string, Leads>; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data, error }, units] = await Promise.all([
    client.from("pw_leads").select("employee_id,kind,name"),
    listUnits().catch(() => ({ units: [], memberships: [], migrated: false })),
  ]);
  if (error && !missing(error)) databaseError(error);
  const byPerson = new Map<string, Leads>();
  const add = (id: string, kind: keyof Leads, name: string) => {
    const current = byPerson.get(id) ?? { departments: [], businessUnits: [] };
    if (!current[kind].includes(name)) current[kind] = [...current[kind], name].sort((a, b) => a.localeCompare(b, "id"));
    byPerson.set(id, current);
  };
  for (const row of data ?? []) add(row.employee_id, row.kind === "bu" ? "businessUnits" : "departments", row.name);
  // The unit import's leads, by the unit's kind and name.
  const unitOf = new Map(units.units.map(unit => [unit.id, unit]));
  for (const member of units.memberships) {
    const unit = unitOf.get(member.unitId);
    if (member.isLead && unit) add(member.employeeId, unit.kind === "bu" ? "businessUnits" : "departments", unit.name);
  }
  return { byPerson, migrated: !error };
}
/** Read once per request, however many parts of the page ask. */
export const listLeads = cache(listLeadsUncached);

/** What one person heads; empty when nothing. */
export async function leadsOf(employeeId: string): Promise<Leads> {
  return (await listLeads()).byPerson.get(employeeId) ?? { departments: [], businessUnits: [] };
}

/** The departments and BUs to pick from: those of Data karyawan and those already led; BUs are the five codes (and any other already set). */
export async function leadOptions(): Promise<Leads> {
  const client = createPrivilegedClient();
  const read = (fields: string) => client.from("employees").select(fields).eq("active", true).limit(2000);
  let { data, error } = await read("department,business_unit");
  // Before migration 202611060002 there is no BU column yet: departments only.
  if (error && missing(error)) ({ data, error } = await read("department"));
  if (error) databaseError(error);
  const rows = (data ?? []) as unknown as { department?: string; business_unit?: string }[];
  const { byPerson } = await listLeads();
  const led = [...byPerson.values()];
  const tidy = (names: (string | undefined)[]) => [...new Set(names.map(name => (name ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  return {
    departments: tidy([...rows.map(row => row.department), ...led.flatMap(item => item.departments)]),
    businessUnits: [...new Set([...BUSINESS_UNITS, ...rows.map(row => buCode(row.business_unit)), ...led.flatMap(item => item.businessUnits.map(buCode))])],
  };
}

/** Saves what this person heads, replacing what was set by hand. A BOD heads nothing. */
export async function setLeads(employeeId: string, leads: Leads): Promise<void> {
  const departments = [...new Set(leads.departments.map(name => name.trim()).filter(Boolean))];
  const businessUnits = [...new Set(leads.businessUnits.map(name => name.trim()).filter(Boolean))];
  if ((departments.length || businessUnits.length) && (await rolesOf(employeeId)).includes("bod")) {
    throw new ServiceError(422, "BOD tidak bisa menjadi HOD departemen atau lead BU.");
  }
  const client = createPrivilegedClient();
  const { error } = await client.from("pw_leads").delete().eq("employee_id", employeeId);
  if (error) { if (missing(error)) throw new ServiceError(503, `HOD dan lead BU menunggu migrasi ${MIGRATION}.`); databaseError(error); }
  const rows = [
    ...departments.map(name => ({ employee_id: employeeId, kind: "departemen", name })),
    ...businessUnits.map(name => ({ employee_id: employeeId, kind: "bu", name })),
  ];
  if (!rows.length) return;
  const { error: insertError } = await client.from("pw_leads").insert(rows);
  if (insertError) databaseError(insertError);
}
