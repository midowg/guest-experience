import { accessAdminLabels, dietaryAdminLabels } from "./rsvp-labels";
import type { AccessNeed, AgendaItem, Dietary, EventRecord, RsvpRecord } from "./types";

/** Draf → Ditetapkan (H-3) → Revisi → Final (H-1) → Selesai. */
export const beoStatuses = ["draft", "set", "revised", "final", "done"] as const;
export type BeoStatus = (typeof beoStatuses)[number];
export const beoStatusLabels: Record<BeoStatus, string> = { draft: "Draf", set: "Ditetapkan", revised: "Revisi", final: "Final", done: "Selesai" };

export type BeoState = {
  status: BeoStatus; prepared_count: number | null; notes: string; version: number;
  locked_at: string | null; updated_at: string | null;
};
export const emptyBeo: BeoState = { status: "draft", prepared_count: null, notes: "", version: 0, locked_at: null, updated_at: null };

export type BeoRevision = { id: string; version: number; status: BeoStatus; prepared_count: number | null; attending: number; reason: string; device_id: string | null; at: string };

export type BeoAction = "save" | "set" | "revise" | "final" | "done" | "reopen";

/** Which buttons a status offers. A set number only changes through a revision with a reason. */
export function beoActions(status: BeoStatus): BeoAction[] {
  switch (status) {
    case "draft": return ["save", "set"];
    case "set": case "revised": return ["revise", "final"];
    case "final": return ["revise", "done"];
    case "done": return ["reopen"];
  }
}

/** The status after an action, or null when the action is not allowed from here. */
export function nextBeoStatus(status: BeoStatus, action: BeoAction): BeoStatus | null {
  if (!beoActions(status).includes(action)) return null;
  return ({ save: "draft", set: "set", revise: "revised", final: "final", done: "done", reopen: "revised" } as const)[action];
}

const dietOf = (rsvp: RsvpRecord): Dietary[] => rsvp.dietary ?? (rsvp.has_allergy ? ["allergy"] : []);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export type BeoSummary = {
  estimate: number | null;
  /** Guests answering yes, companions included. */
  attending: number;
  answeredYes: number;
  dietary: { key: Dietary; label: string; count: number }[];
  allergies: { name: string; firstName: string; details: string }[];
  otherFood: { name: string; details: string }[];
  access: { name: string; needs: string[]; other: string }[];
  schedule: AgendaItem[];
  /** Answers created or changed after the numbers were set. */
  changedSinceLock: number;
};

/**
 * What hospitality prepares for, read from the RSVPs. Food counts are per answer, not people:
 * one guest can be vegetarian and allergic, so the counts are not added up as heads.
 */
export function beoSummary(event: EventRecord, rsvps: RsvpRecord[], lockedAt: string | null = null): BeoSummary {
  const yes = rsvps.filter(rsvp => rsvp.attendance === "yes");
  const counts = new Map<Dietary, number>();
  for (const rsvp of yes) for (const diet of new Set(dietOf(rsvp))) counts.set(diet, (counts.get(diet) ?? 0) + 1);
  const locked = lockedAt ? Date.parse(lockedAt) : null;
  return {
    estimate: event.guest_estimate ?? null,
    attending: yes.reduce((sum, rsvp) => sum + Math.max(1, rsvp.party_size ?? 1), 0),
    answeredYes: yes.length,
    dietary: (Object.keys(dietaryAdminLabels) as Dietary[]).filter(key => counts.get(key)).map(key => ({ key, label: dietaryAdminLabels[key], count: counts.get(key)! })),
    allergies: yes.filter(rsvp => dietOf(rsvp).includes("allergy")).map(rsvp => ({ name: rsvp.name, firstName: firstName(rsvp.name), details: rsvp.allergy_details.trim() })),
    otherFood: yes.filter(rsvp => dietOf(rsvp).includes("other")).map(rsvp => ({ name: rsvp.name, details: (rsvp.dietary_other ?? "").trim() })),
    access: yes.filter(rsvp => (rsvp.access ?? []).length).map(rsvp => ({
      name: rsvp.name,
      needs: (rsvp.access ?? []).filter((need): need is AccessNeed => need !== "other").map(need => accessAdminLabels[need]),
      other: (rsvp.access ?? []).includes("other") ? (rsvp.access_other ?? "").trim() : "",
    })),
    schedule: [...event.agenda].sort((a, b) => a.sort_order - b.sort_order),
    changedSinceLock: locked === null ? 0 : rsvps.filter(rsvp => Date.parse(rsvp.updated_at ?? rsvp.created_at) > locked).length,
  };
}
