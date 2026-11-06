import { z } from "zod";

/*
 * Departemen dan BU (6 Nov 2026): who heads what. A person may be HOD of several departments and
 * lead of a BU. Shared by the server, Akun dan peran and Data karyawan.
 */

/** Departments led (HOD) and BUs led, by name. */
export type Leads = { departments: string[]; businessUnits: string[] };

/** The business units, by their codes (6 Nov 2026). */
export const BUSINESS_UNITS = ["MRP", "WNS", "TEE", "NMU", "WNN"] as const;
/** Everyone's BU until the super admin sets theirs. */
export const DEFAULT_BUSINESS_UNIT = "WNS";
/** A BU as its code: the full names saved before migration 202611060004 read as their codes. */
export function buCode(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  return ({ "Werkudara Nirwana Sakti": "WNS", "Maha Raja Pratama": "MRP" } as Record<string, string>)[value] ?? (value || DEFAULT_BUSINESS_UNIT);
}

const names = z.array(z.string().trim().min(1).max(120)).max(30);
export const leadsSchema = z.object({ departments: names, businessUnits: names });

/** "HOD Center of Excellence, Art & Creative Support · Lead BU Maha Raja Pratama", or "" when nothing. */
export function leadsLabel(leads: Leads): string {
  return [
    leads.departments.length ? `HOD ${leads.departments.join(", ")}` : "",
    leads.businessUnits.length ? `Lead BU ${leads.businessUnits.join(", ")}` : "",
  ].filter(Boolean).join(" · ");
}
