/*
 * How colleagues see a person in the WAM app (6 Nov 2026): their nama panggilan, not the full
 * name. Everyone the same: no "Pak" or "Bu" in front, BOD, HOD and Lead included (12 Nov 2026;
 * from 6 Nov they had it, the seniors asked to be called like everyone else). Admin pages keep
 * the full name. Jenis kelamin stays in Data karyawan for the questionnaire.
 */

export const GENDERS = ["", "L", "P"] as const;
export type Gender = (typeof GENDERS)[number];
export const genderLabels: Record<Gender, string> = { "": "Belum diisi", L: "Laki-laki", P: "Perempuan" };
export const asGender = (value: unknown): Gender => (value === "L" || value === "P" ? value : "");

/** "Bagus": the nama panggilan, else the first word of the full name. */
export function callName(person: { fullName: string; nickname?: string | null }): string {
  return (person.nickname ?? "").trim() || person.fullName.trim().split(/\s+/)[0] || person.fullName;
}

/** The name without a Pak or Bu someone typed in, for initials: "Pak Bagus" -> "Bagus". */
export const withoutHonorific = (name: string) => name.replace(/^(Pak|Bu)\s+/, "");
