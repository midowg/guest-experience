import { fold } from "./tsv";

/*
 * People as Admin WAM → Main WAM picks them (aturan-wam §4: admin views show the full name), and
 * how a name typed in a sheet finds its person. Pure.
 */

/** An active employee for the admin's pickers and imports: full name first, the nama panggilan for search. */
export type AdminPerson = { id: string; fullName: string; name: string; department: string };

export type PersonMatch = { person: AdminPerson; error?: undefined } | { person?: undefined; error: string };

/**
 * The person a cell names: the full name (any case, accents, spacing), or else a nama panggilan
 * that only one person has. Two people with that name, or nobody, is an error that says so.
 */
export function matchPerson(text: string, people: readonly AdminPerson[]): PersonMatch {
  const wanted = fold(text);
  if (!wanted) return { error: "Nama kosong." };
  const byFull = people.filter(person => fold(person.fullName) === wanted);
  if (byFull.length === 1) return { person: byFull[0] };
  if (byFull.length > 1) return { error: `Ada ${byFull.length} karyawan bernama ${text}. Tulis nama lengkap yang lain atau pilih manual.` };
  const byCall = people.filter(person => fold(person.name) === wanted);
  if (byCall.length === 1) return { person: byCall[0] };
  if (byCall.length > 1) return { error: `Panggilan ${text} dipakai ${byCall.length} orang (${byCall.slice(0, 3).map(person => person.fullName).join(", ")}). Tulis nama lengkap.` };
  return { error: `${text} tidak ada di Data karyawan.` };
}

/** Search the picker by full name, nama panggilan or department (every word must match). */
export function searchPeople<T extends AdminPerson>(people: readonly T[], query: string): T[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return [...people];
  return people.filter(person => {
    const haystack = fold(`${person.fullName} ${person.name} ${person.department}`);
    return words.every(word => haystack.includes(word));
  });
}

/** By full name (Indonesian order). */
export const byFullName = (a: AdminPerson, b: AdminPerson) => a.fullName.localeCompare(b.fullName, "id");
