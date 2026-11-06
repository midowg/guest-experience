/*
 * How colleagues see a person in the WAM app (6 Nov 2026): their nama panggilan, not the full
 * name. BOD, HOD and lead BU get "Pak" or "Bu" in front (from Jenis kelamin in Data karyawan);
 * everyone else is just the nama panggilan. Admin pages keep the full name.
 */

export const GENDERS = ["", "L", "P"] as const;
export type Gender = (typeof GENDERS)[number];
export const genderLabels: Record<Gender, string> = { "": "Belum diisi", L: "Laki-laki", P: "Perempuan" };
export const asGender = (value: unknown): Gender => (value === "L" || value === "P" ? value : "");

/** "Bagus", or "Pak Bagus" for a BOD, HOD or lead BU whose Jenis kelamin is filled. */
export function callName(person: { fullName: string; nickname?: string | null; gender?: string | null }, senior: boolean): string {
  const short = (person.nickname ?? "").trim() || person.fullName.trim().split(/\s+/)[0] || person.fullName;
  const gender = asGender(person.gender);
  return senior && gender ? `${gender === "L" ? "Pak" : "Bu"} ${short}` : short;
}

/** The name without its Pak or Bu, for initials: "Pak Bagus" -> "Bagus". */
export const withoutHonorific = (name: string) => name.replace(/^(Pak|Bu)\s+/, "");
