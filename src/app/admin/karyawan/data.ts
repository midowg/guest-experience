import "server-only";
import type { WamAccounts } from "@/components/admin/super/EmployeeDirectory";
import type { LeadOptions, Leads } from "@/lib/pra-wam/leads";
import { currentAdmin } from "@/lib/server/admin-session";
import { actorHasApp } from "@/lib/server/admin-actor";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { leadOptions, listLeads } from "@/lib/server/pra-wam/leads";

/** Who has a WAM sign-in. A failure here leaves the rest of Data karyawan working (null). */
export async function wamAccounts(): Promise<WamAccounts | null> {
  try {
    const { rows, migrated } = await listAccounts();
    return { migrated, passwordReady: defaultPasswordReady(), withAccount: rows.filter(row => row.hasAccount).map(row => row.employeeId),
      roles: Object.fromEntries(rows.filter(row => row.roles.length).map(row => [row.employeeId, row.roles])) };
  } catch { return null; }
}

/** Who heads which departments and who is a Lead, and the departments to pick from; null before migration 202611060002. */
export async function leadData(): Promise<{ byPerson: Record<string, Leads>; options: LeadOptions } | null> {
  try {
    const [{ byPerson, migrated }, options] = await Promise.all([listLeads(), leadOptions()]);
    return migrated ? { byPerson: Object.fromEntries(byPerson), options } : null;
  } catch { return null; }
}

/** WAM accounts, roles and units are Admin Pra WAM's: a Data karyawan admin without it sees them only. */
export async function managesWam(): Promise<boolean> {
  const actor = await currentAdmin();
  return !!actor && actorHasApp(actor, "wam");
}
