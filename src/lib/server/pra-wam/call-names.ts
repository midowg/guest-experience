import "server-only";
import { cache } from "react";
import { createPrivilegedClient } from "../supabase/admin";
import { hasPost, type Leads } from "@/lib/pra-wam/leads";
import { listLeads } from "./leads";

/**
 * Who is shown with Pak or Bu (6 Nov 2026): the BOD and everyone who heads a department or is a
 * Lead (9 Nov 2026, was "lead BU"). Read from the structure, so a new HOD gets it without anything else to set.
 */
async function seniorIdsUncached(): Promise<Set<string>> {
  const [leads, { data, error }] = await Promise.all([
    listLeads().catch(() => ({ byPerson: new Map<string, Leads>() })),
    createPrivilegedClient().from("pw_roles").select("employee_id").eq("role", "bod"),
  ]);
  const ids = new Set<string>(error ? [] : (data ?? []).map(row => row.employee_id as string));
  for (const [id, led] of leads.byPerson) if (hasPost(led)) ids.add(id);
  return ids;
}
/** Read once per request, however many parts of the page ask. */
export const seniorIds = cache(seniorIdsUncached);
