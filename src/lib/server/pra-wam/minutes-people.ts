import "server-only";
import type { MinuteAttendee } from "@/lib/pra-wam/minutes";
import { frmPosition } from "@/lib/pra-wam/minutes-message";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";

type Post = "gm" | "hod" | "lead" | "staf";

/**
 * The people in the meeting, with what Data karyawan says of them, whether they checked in, and
 * their position as form FRM.05.00.00.027 names it (12 Nov 2026): BOD from WAM's roles, otherwise
 * from the posts of all their jobs (GM or HOD → Head of Department, Lead → Coordinator, else Staff).
 */
export async function attendeesOf(sessionId: string): Promise<MinuteAttendee[]> {
  const client = createPrivilegedClient();
  const [{ data, error }, people, checks] = await Promise.all([
    client.from("pw_session_participants").select("employee_id").eq("session_id", sessionId),
    listPeople(),
    client.from("pw_attendance").select("employee_id").eq("session_id", sessionId),
  ]);
  if (error) databaseError(error);
  const ids = [...new Set((data ?? []).map(row => row.employee_id as string))];
  if (!ids.length) return [];
  // Roles and jobs only name the position: when either cannot be read, the position is left out.
  const [{ data: staff }, roles, jobs] = await Promise.all([
    client.from("employees").select("id,full_name,department,position").in("id", ids),
    client.from("pw_roles").select("employee_id").eq("role", "bod").in("employee_id", ids),
    client.from("employee_jobs").select("employee_id,post").in("employee_id", ids),
  ]);
  const rows = new Map(((staff ?? []) as { id: string; full_name: string; department: string | null; position: string | null }[]).map(row => [row.id, row]));
  const names = new Map(people.map(person => [person.id, person]));
  const checked = new Set(checks.error ? [] : (checks.data ?? []).map(row => row.employee_id as string));
  const bod = new Set(roles.error ? [] : (roles.data ?? []).map(row => row.employee_id as string));
  const posts = new Map<string, Post[]>();
  for (const row of jobs.error ? [] : (jobs.data ?? []) as { employee_id: string; post: Post }[]) posts.set(row.employee_id, [...(posts.get(row.employee_id) ?? []), row.post]);
  return ids.map(id => {
    const row = rows.get(id);
    const person = names.get(id);
    return {
      id, name: person?.name ?? row?.full_name ?? "Tanpa nama", fullName: row?.full_name ?? person?.fullName ?? person?.name ?? "Tanpa nama",
      department: row?.department ?? person?.department ?? "", position: row?.position ?? "",
      frmPosition: frmPosition(bod.has(id), posts.get(id) ?? []), checkedIn: checked.has(id),
    };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
}
