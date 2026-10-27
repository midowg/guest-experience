import { z } from "zod";

/**
 * The hosting brief: what the person who invited the guest tells hospitality before the visit.
 * Server only (service role), never in the event document the guest page reads. The guest's
 * numbers, food and access needs are not asked here: they come from the confirmations.
 */
export const briefRelations = ["client", "prospect", "partner", "vendor", "other"] as const;
export type BriefRelation = (typeof briefRelations)[number];
export const briefRelationLabels: Record<BriefRelation, string> = { client: "Klien", prospect: "Calon klien", partner: "Mitra", vendor: "Vendor", other: "Lainnya" };

export const briefMeals = ["snack", "lunch", "coffee"] as const;
export type BriefMeal = (typeof briefMeals)[number];
export const briefMealLabels: Record<BriefMeal, string> = { snack: "Minuman & snack", lunch: "Makan siang", coffee: "Kopi/teh saja" };

const text = (max: number) => z.string().trim().max(max).default("");
export const hostingBriefSchema = z.object({
  host_name: text(150), host_role: text(150),
  guest_name: text(150), guest_preferred: text(100), guest_position: text(250),
  relation: z.union([z.enum(briefRelations), z.literal("")]).default(""), relation_other: text(150),
  first_visit: z.boolean().nullable().default(null),
  history: text(1000), purpose: text(1000), outcome: text(1000),
  meals: z.array(z.enum(briefMeals)).max(briefMeals.length).default([]), meal_notes: text(500),
  interests: text(1000), comfort: text(1000),
});
export type HostingBrief = z.infer<typeof hostingBriefSchema>;
export const emptyBrief = (): HostingBrief => hostingBriefSchema.parse({});
/** The brief with its version for the save check; `migrated` is false before its table exists. */
export type BriefState = { brief: HostingBrief; version: number; migrated: boolean };

/** A brief read from the database, whatever shape it was saved in. */
export function readBrief(value: unknown): HostingBrief {
  const parsed = hostingBriefSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : emptyBrief();
}

export const briefFilled = (brief: HostingBrief) =>
  Object.entries(brief).some(([, value]) => Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim() !== "" : value !== null);

export type BriefGroup = { title: string; rows: [string, string][] };

/** The brief as printed: three groups, empty answers shown as a dash so the sheet keeps its shape. */
export function briefGroups(brief: HostingBrief, party: string): BriefGroup[] {
  const or = (value: string) => value.trim() || "—";
  const guest = brief.guest_name.trim()
    ? `${brief.guest_name.trim()}${brief.guest_preferred.trim() && brief.guest_preferred.trim() !== brief.guest_name.trim() ? ` (panggil “${brief.guest_preferred.trim()}”)` : ""}`
    : "—";
  const relation = brief.relation === "other" ? brief.relation_other.trim() || briefRelationLabels.other : brief.relation ? briefRelationLabels[brief.relation] : "";
  const visit = brief.first_visit === null ? "" : brief.first_visit ? "kunjungan pertama" : "bukan kunjungan pertama";
  const meals = [brief.meals.map(meal => briefMealLabels[meal]).join(", "), brief.meal_notes.trim()].filter(Boolean).join(" · ");
  return [
    { title: "Tamu", rows: [["Tamu utama", guest], ["Jabatan & perusahaan", or(brief.guest_position)], ["Rombongan", party], ["Diundang oleh", or([brief.host_name, brief.host_role].map(part => part.trim()).filter(Boolean).join(" · "))]] },
    { title: "Hubungan & tujuan", rows: [["Hubungan", or([relation, visit].filter(Boolean).join(" · "))], ["Riwayat kerja sama", or(brief.history)], ["Tujuan & agenda", or(brief.purpose)], ["Hasil yang diharapkan", or(brief.outcome)]] },
    { title: "Untuk hospitality", rows: [["Konsumsi", or(meals)], ["Minat & topik obrolan", or(brief.interests)], ["Kebutuhan kenyamanan", or(brief.comfort)]] },
  ];
}
