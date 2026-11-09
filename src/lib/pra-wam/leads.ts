import { z } from "zod";

/*
 * Who heads what, shared by the server, Akun dan peran and Data karyawan:
 *   - HOD: heads one or several departments (6 Nov 2026).
 *   - Lead (9 Nov 2026, replaces "lead BU"): a team lead inside their department, just under the
 *     HOD (almost the same level), with their own people under them through "Atasan langsung".
 *     A BU is only the business unit a person belongs to inside Werkudara Group; nobody leads one.
 */

/** Departments headed (HOD), and whether the person is a Lead in their department. */
export type Leads = { departments: string[]; lead: boolean };
/** What can be picked: the departments of Data karyawan (and those already headed). */
export type LeadOptions = { departments: string[] };
export const NO_LEADS: Leads = { departments: [], lead: false };
/** Heads a department or is a Lead: a structural post (no BOD with it, Pak or Bu in the app). */
export const hasPost = (leads: Leads) => leads.departments.length > 0 || leads.lead;

/** The business units, by their codes (6 Nov 2026). */
export const BUSINESS_UNITS = ["MRP", "WNS", "TEE", "NMU", "WNN"] as const;
/** Everyone's BU until the super admin sets theirs. */
export const DEFAULT_BUSINESS_UNIT = "WNS";
/** HR's "office" already names the BU (WNS, TEE, MRP...): its code when it is one of the five, else null. */
export function buFromOffice(office: string | null | undefined): string | null {
  const code = (office ?? "").trim().toUpperCase();
  return (BUSINESS_UNITS as readonly string[]).includes(code) ? code : null;
}
/** A BU as its code: the full names saved before migration 202611060004 read as their codes. */
export function buCode(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  return ({ "Werkudara Nirwana Sakti": "WNS", "Maha Raja Pratama": "MRP" } as Record<string, string>)[value] ?? (value || DEFAULT_BUSINESS_UNIT);
}

const names = z.array(z.string().trim().min(1).max(120)).max(30);
export const leadsSchema = z.object({ departments: names, lead: z.boolean().default(false) });

/** "HOD Center of Excellence, Art & Creative Support", "Lead", or "" when nothing. */
export function leadsLabel(leads: Leads): string {
  return [leads.departments.length ? `HOD ${leads.departments.join(", ")}` : "", leads.lead ? "Lead" : ""].filter(Boolean).join(" · ");
}
