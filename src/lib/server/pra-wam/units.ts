import "server-only";
import { cache } from "react";
import type { ParsedUnits, UnitKind } from "@/lib/pra-wam/units";
import { ServiceError } from "../config";
import { listEmployees } from "../employees";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated } from "./session";

/*
 * Departments and BUs with their people (migration 202611040003). The import from the Data
 * karyawan workbook is the source: it replaces every membership, so running it again after HR
 * changes the sheet leaves exactly what the sheet says.
 */

export type Unit = { id: string; kind: UnitKind; name: string; code: string | null };
export type Membership = { unitId: string; employeeId: string; jobTitle: string; isLead: boolean; isPrimary: boolean };

const waiting = () => new ServiceError(503, "Unit dan jabatan menunggu migrasi 202611040003_pra_wam_events_units.sql.");

/** Every unit and membership; empty (and `migrated: false`) before the migration. */
async function listUnitsUncached(): Promise<{ units: Unit[]; memberships: Membership[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const [{ data: units, error }, { data: members, error: memberError }] = await Promise.all([
    client.from("org_units").select("id,kind,name,code").order("kind").order("sort_order").order("name"),
    client.from("unit_members").select("unit_id,employee_id,job_title,is_lead,is_primary"),
  ]);
  const problem = error ?? memberError;
  if (problem) { if (notMigrated(problem) || /org_units|unit_members/.test(problem.message)) return { units: [], memberships: [], migrated: false }; databaseError(problem); }
  return {
    migrated: true,
    units: (units ?? []) as Unit[],
    memberships: (members ?? []).map(row => ({ unitId: row.unit_id, employeeId: row.employee_id, jobTitle: row.job_title, isLead: row.is_lead, isPrimary: row.is_primary })),
  };
}
/** Read once per request, however many parts of the page ask. */
export const listUnits = cache(listUnitsUncached);

/** One person's units, for their profile: "Lead · Business & Administrative Services". */
export async function unitsOf(employeeId: string): Promise<(Unit & Omit<Membership, "unitId" | "employeeId">)[]> {
  const { units, memberships } = await listUnits();
  return memberships.filter(member => member.employeeId === employeeId).flatMap(member => {
    const unit = units.find(item => item.id === member.unitId);
    return unit ? [{ ...unit, jobTitle: member.jobTitle, isLead: member.isLead, isPrimary: member.isPrimary }] : [];
  });
}

/** The departments each person leads (HOD), by employee id. A BU lead is not a HOD. */
export async function departmentLeads(): Promise<Map<string, string[]>> {
  const { units, memberships } = await listUnits();
  const departments = new Map(units.filter(unit => unit.kind === "departemen").map(unit => [unit.id, unit.name]));
  const leads = new Map<string, string[]>();
  for (const member of memberships) {
    const name = departments.get(member.unitId);
    if (member.isLead && name) leads.set(member.employeeId, [...(leads.get(member.employeeId) ?? []), name]);
  }
  return leads;
}

/**
 * Saves units and memberships from the sheet. People are found by NIP, else by nickname; anyone
 * not found in Data karyawan is reported, not guessed. A BOD stands alone, so a sheet that makes a
 * BOD the lead of a department keeps them as a member, without the lead, and says so.
 */
export async function importUnits(parsed: ParsedUnits): Promise<{ units: number; members: number; unmatched: string[]; warnings: string[] }> {
  const { employees, migrated } = await listEmployees();
  if (!migrated) throw new ServiceError(503, "Data karyawan menunggu migrasi 202611030001_employees.sql.");
  const byNip = new Map(employees.filter(person => person.nip).map(person => [person.nip.toLowerCase(), person.id]));
  const nicknames = new Map<string, string[]>();
  for (const person of employees) {
    const key = person.nickname.trim().toLowerCase();
    if (key) nicknames.set(key, [...(nicknames.get(key) ?? []), person.id]);
  }
  const client = createPrivilegedClient();
  const { data: saved, error } = await client.from("org_units")
    .upsert(parsed.units.map((unit, index) => ({ kind: unit.kind, name: unit.name, code: unit.code, sort_order: index })), { onConflict: "kind,name" })
    .select("id,kind,name");
  if (error) { if (notMigrated(error) || /org_units/.test(error.message)) throw waiting(); databaseError(error); }
  const unitId = new Map((saved ?? []).map(unit => [`${unit.kind}|${unit.name}`, unit.id]));
  // Roles arrive with migration 202611040002; before it nobody is a BOD.
  const { data: bodRows, error: bodError } = await client.from("pw_roles").select("employee_id").eq("role", "bod");
  if (bodError && !notMigrated(bodError)) databaseError(bodError);
  const bods = new Set((bodRows ?? []).map(row => row.employee_id));

  const unmatched = new Set<string>();
  const warnings: string[] = [];
  const rows = new Map<string, { unit_id: string; employee_id: string; job_title: string; is_lead: boolean; is_primary: boolean }>();
  for (const member of parsed.members) {
    const byName = nicknames.get(member.nickname.toLowerCase()) ?? [];
    const employeeId = (member.nip && byNip.get(member.nip.toLowerCase())) || (byName.length === 1 ? byName[0] : undefined);
    const unit = unitId.get(`${member.kind}|${member.unit}`);
    if (!employeeId) { unmatched.add(byName.length > 1 ? `${member.nickname} (nama panggilan dipakai lebih dari satu orang; isi NIP)` : member.nip || member.nickname); continue; }
    if (!unit) continue;
    const bodLead = member.isLead && member.kind === "departemen" && bods.has(employeeId);
    if (bodLead) warnings.push(`${member.nickname || member.nip} adalah BOD; BOD tidak bisa menjadi lead departemen. Tanda lead di ${member.unit} dilewati.`);
    rows.set(`${unit}|${employeeId}`, { unit_id: unit, employee_id: employeeId, job_title: member.jobTitle, is_lead: member.isLead && !bodLead, is_primary: member.isPrimary });
  }
  const { error: clearError } = await client.from("unit_members").delete().not("unit_id", "is", null);
  if (clearError) databaseError(clearError);
  if (rows.size) {
    const { error: insertError } = await client.from("unit_members").insert([...rows.values()]);
    if (insertError) databaseError(insertError);
  }
  return { units: parsed.units.length, members: rows.size, unmatched: [...unmatched], warnings };
}
