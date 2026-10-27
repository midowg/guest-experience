import { beoSummary, emptyBeo, type BeoStatus } from "@/lib/beo";
import { emptyBrief, type HostingBrief } from "@/lib/hosting-brief";
import { createSeedEvent } from "@/lib/seed-event";
import type { RsvpRecord } from "@/lib/types";

/** Sample BEO for the development previews only. */
export function sampleBeo(asked: string | undefined) {
  const status: BeoStatus = asked === "set" || asked === "final" ? asked : "draft";
  const event = { ...createSeedEvent(), guest_estimate: 25 };
  const answer = (name: string, over: Partial<RsvpRecord>): RsvpRecord => ({ id: crypto.randomUUID(), event_id: event.id, name, organization: "", attendance: "yes", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: "2026-10-20T00:00:00Z", ...over });
  const rsvps = [
    answer("Contoh Tamu Satu", { party_size: 2, dietary: ["vegetarian", "allergy"], has_allergy: true, allergy_details: "Kacang tanah" }),
    answer("Contoh Tamu Dua", { dietary: ["vegetarian"], access: ["wheelchair"] }),
    answer("Contoh Tamu Tiga", { dietary: ["other"], dietary_other: "Tanpa gula", access: ["other"], access_other: "Perlu kursi dekat pintu", created_at: "2026-10-25T00:00:00Z" }),
    answer("Contoh Tamu Empat", { party_size: 3 }),
    answer("Contoh Tidak Hadir", { attendance: "no" }),
  ];
  const state = status === "draft" ? { ...emptyBeo, notes: "Contoh catatan: makan siang prasmanan." }
    : { ...emptyBeo, status, version: 2, prepared_count: 9, notes: "Contoh catatan: makan siang prasmanan.", locked_at: "2026-10-22T00:00:00Z" };
  const revisions = status === "draft" ? [] : [{ id: "r1", version: 2, status: "set" as const, prepared_count: 9, attending: 7, reason: "", device_id: "3f0c2a9e-0000-4000-8000-000000000000", at: "2026-10-22T00:00:00Z" }];
  const brief: HostingBrief = {
    ...emptyBrief(), host_name: "Contoh PIC", host_role: "Business Development", guest_name: "Contoh Tamu Satu", guest_preferred: "Pak Contoh",
    guest_position: "Head of Operations, PT Contoh Sejahtera", relation: "client", first_visit: false, history: "Contoh: event tahunan 2025",
    purpose: "Contoh: presentasi konsep acara 2027", outcome: "Contoh: konsep dan jadwal disetujui", meals: ["snack"], meal_notes: "Sekitar 2–3 jam",
  };
  return { event, state, revisions, brief: { brief, version: 1, migrated: true }, summary: beoSummary(event, rsvps, state.locked_at) };
}
