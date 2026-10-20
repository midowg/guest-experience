import type { AccessNeed, Dietary, RsvpRecord } from "./types";

// Panitia-facing labels (admin is Indonesian only), shared by the RSVP table and the CSV.
export const dietaryAdminLabels: Record<Dietary, string> = { vegetarian: "Vegetarian", allergy: "Alergi", other: "Makanan lainnya" };
export const accessAdminLabels: Record<AccessNeed, string> = { wheelchair: "Kursi roda", companion: "Pendamping", sign_interpreter: "Juru bahasa isyarat", other: "Akses lainnya" };

/** Rows saved before 202610200004 have no lists; their allergy answer still counts. */
export function dietaryOf(row: RsvpRecord): Dietary[] {
  return row.dietary ?? (row.has_allergy ? ["allergy"] : []);
}

export function foodText(row: RsvpRecord): string {
  return dietaryOf(row).map(item => item === "allergy" ? `Alergi: ${row.allergy_details}` : item === "other" ? `Lainnya: ${row.dietary_other ?? ""}` : dietaryAdminLabels[item]).join("; ");
}
export function accessText(row: RsvpRecord): string {
  return (row.access ?? []).map(item => item === "other" ? `Lainnya: ${row.access_other ?? ""}` : accessAdminLabels[item]).join("; ");
}
export function partyText(row: RsvpRecord): string {
  const size = row.party_size ?? 1;
  if (row.attendance !== "yes") return "";
  const names = (row.companion_names ?? []).filter(Boolean);
  return size > 1 ? `${size} orang${names.length ? ` (${names.join(", ")})` : ""}` : "1 orang";
}
