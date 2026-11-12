import "server-only";
import type { MinuteAttendee } from "@/lib/pra-wam/minutes";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";

/** The people in the meeting, with what Data karyawan says of them and whether they checked in. */
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
  const { data: staff } = await client.from("employees").select("id,full_name,department,position").in("id", ids);
  const rows = new Map(((staff ?? []) as { id: string; full_name: string; department: string | null; position: string | null }[]).map(row => [row.id, row]));
  const names = new Map(people.map(person => [person.id, person]));
  const checked = new Set(checks.error ? [] : (checks.data ?? []).map(row => row.employee_id as string));
  return ids.map(id => {
    const row = rows.get(id);
    const person = names.get(id);
    return {
      id, name: person?.name ?? row?.full_name ?? "Tanpa nama", fullName: row?.full_name ?? person?.fullName ?? person?.name ?? "Tanpa nama",
      department: row?.department ?? person?.department ?? "", position: row?.position ?? "", checkedIn: checked.has(id),
    };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
}

