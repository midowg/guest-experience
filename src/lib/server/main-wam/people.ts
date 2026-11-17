import "server-only";
import { cache } from "react";
import { photoPath } from "@/lib/pra-wam/photo";
import type { MwPerson } from "@/lib/main-wam/types";
import { databaseError } from "../http";
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

/*
 * The people of the event (audit R5: one definition for every count): everyone with an active WAM
 * account and an active Data karyawan row; BOD, panitia and admin by role. "Orang acara" (who checks
 * in, "Hadir 96 dari 120", Kehadiran) is that minus BOD. Read once per request; a database failure
 * throws (the caller decides: a count left out, or a 5xx).
 */
export type MainWamEventPeople = {
  /** Every active WAM account (BOD included), sorted by id. */
  accounts: readonly string[];
  bod: ReadonlySet<string>;
  panitia: ReadonlySet<string>;
  admin: ReadonlySet<string>;
};

async function activeAccountsUncached(): Promise<string[]> {
  const ids: string[] = [];
  const client = createPrivilegedClient();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("pw_accounts").select("employee_id,employees!inner(active)").eq("active", true).eq("employees.active", true).order("employee_id").range(from, from + 999);
    if (error) databaseError(error);
    ids.push(...(data ?? []).map(row => row.employee_id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  return ids;
}

async function eventPeopleUncached(): Promise<MainWamEventPeople> {
  const [accounts, roles] = await Promise.all([
    activeAccountsUncached(),
    createPrivilegedClient().from("pw_roles").select("employee_id,role").in("role", ["bod", "panitia", "admin"]),
  ]);
  if (roles.error) databaseError(roles.error);
  const of = (role: string) => new Set((roles.data ?? []).filter(row => row.role === role).map(row => row.employee_id as string));
  return { accounts, bod: of("bod"), panitia: of("panitia"), admin: of("admin") };
}

/** The event's people and roles (see MainWamEventPeople), once per request. */
export const mainWamEventPeople = cache(eventPeopleUncached);

/** "Orang acara": every active WAM account except BOD (who do not check in). The one count for absen, Kehadiran and Detail sesi. */
export const mainWamAttendees = cache(async (): Promise<string[]> => {
  const { accounts, bod } = await mainWamEventPeople();
  return accounts.filter(id => !bod.has(id));
});

/** One person, or a stand-in when they are not in Data karyawan (any more). */
export async function personOf(id: string | null | undefined): Promise<MwPerson | null> {
  if (!id) return null;
  const found = (await mainWamPeople()).get(id);
  return found ? { id: found.id, name: found.name, department: found.department, photo: found.photo } : null;
}
