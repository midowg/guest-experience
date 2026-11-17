import "server-only";
import { cache } from "react";
import { photoPath } from "@/lib/pra-wam/photo";
import type { MwPerson } from "@/lib/main-wam/types";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "../pra-wam/appraisal";

/*
 * Everyone as Main WAM shows them (aturan-wam §4): the nama panggilan (callName, from listPeople),
 * the department, and the WAM profile photo when there is one. Read once per request; photos fail
 * soft (initials).
 */

async function photosUncached(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const client = createPrivilegedClient();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from("pw_accounts").select("employee_id,photo_key,photo_updated_at").not("photo_key", "is", null).order("employee_id").range(from, from + 999);
      if (error) return out;
      for (const row of (data ?? []) as { employee_id: string; photo_key: string | null; photo_updated_at: string | null }[]) {
        const path = photoPath({ id: row.employee_id, photoKey: row.photo_key, photoUpdatedAt: row.photo_updated_at });
        if (path) out.set(row.employee_id, path);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
  } catch { /* initials */ }
  return out;
}

async function peopleUncached(): Promise<Map<string, MwPerson & { fullName: string; active: boolean }>> {
  const [people, photos] = await Promise.all([listPeople(), photosUncached()]);
  return new Map(people.map(person => [person.id, { id: person.id, name: person.name, fullName: person.fullName, department: person.department, active: person.active, photo: photos.get(person.id) ?? null }]));
}

/** id → the person (nama panggilan, department, photo); `fullName` only for admin views. */
export const mainWamPeople = cache(peopleUncached);

/** One person, or a stand-in when they are not in Data karyawan (any more). */
export async function personOf(id: string | null | undefined): Promise<MwPerson | null> {
  if (!id) return null;
  const found = (await mainWamPeople()).get(id);
  return found ? { id: found.id, name: found.name, department: found.department, photo: found.photo } : null;
}
