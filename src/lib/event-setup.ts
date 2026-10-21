import { z } from "zod";
import { parseContactPhone } from "./contact-phone";
import { standardQuestions, templateKeys, templateOf } from "./event-templates";
import { createSeedEvent } from "./seed-event";
import { eventTimezones } from "./timezones";
import type { EventRecord, SectionKey } from "./types";

const text = (max: number) => z.string().trim().max(max);
const timestamp = z.iso.datetime({ offset: true });
const httpsUrl = z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(8000)]);
export const setupSectionKeys = ["about", "experience", "agenda", "location", "prepare", "team", "rsvp", "contact", "feedback"] as const;

/** Answers from the "Buat acara" survey. Text answers may stay empty: the editor fills them later. */
export const setupSchema = z.object({
  template: z.enum([...templateKeys, "blank"]),
  title: text(180).min(1, "Isi nama acara."),
  starts_at: timestamp,
  ends_at: timestamp.nullable(),
  timezone: z.enum(eventTimezones),
  audience: z.enum(["external", "internal"]),
  language: z.enum(["id", "en", "id_en"]),
  invitation_mode: z.enum(["open", "personal"]),
  location: z.enum(["werkudara", "other", "later"]),
  venue_name: text(200), address: text(1000), location_url: httpsUrl,
  greeting: text(150), introduction: text(5000), closing: text(2000),
  modules: z.array(z.enum(setupSectionKeys)).max(9),
  guest_estimate: z.number().int().min(1, "Isi angka 1 atau lebih.").max(5000).nullable(),
  rsvp_closes_at: timestamp.nullable(),
  contact_name: text(150),
  contact_phone: text(30).refine(value => !value || parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890."),
}).superRefine((setup, ctx) => {
  if (setup.ends_at && Date.parse(setup.ends_at) <= Date.parse(setup.starts_at)) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Waktu selesai harus setelah waktu mulai." });
  if (setup.rsvp_closes_at && Date.parse(setup.rsvp_closes_at) > Date.parse(setup.starts_at)) ctx.addIssue({ code: "custom", path: ["rsvp_closes_at"], message: "Batas RSVP sebaiknya sebelum acara dimulai." });
  if (Boolean(setup.contact_name) !== Boolean(setup.contact_phone)) ctx.addIssue({ code: "custom", path: [setup.contact_name ? "contact_phone" : "contact_name"], message: "Isi nama dan nomor PIC bersama-sama." });
});
export type EventSetup = z.infer<typeof setupSchema>;

export function slugify(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "acara";
}

/** No sample content at all: a new event starts from empty fields, not from another event's text. */
export function createBlankEvent(): EventRecord {
  const seed = createSeedEvent();
  return {
    ...seed,
    title: "", subtitle: "", organizer: "", greeting: "", introduction: "", closing: "",
    venue_name: "", address: "", location_url: "", location_embed_url: "", location_display: "manual", arrival_notes: "",
    topics: [], agenda: [], feedback_questions: [], rsvp_closes_at: null, feedback_enabled: false,
    sections: seed.sections.map(section => ({ ...section, enabled: false })),
  };
}

type Ids = { id: string; uuid: () => string; now: string };

function apply(base: EventRecord, setup: EventSetup, ids: Ids): EventRecord {
  const modules = new Set<SectionKey>(setup.modules);
  const office = setup.location === "werkudara";
  return {
    ...base,
    id: ids.id, status: "draft", slug: `${slugify(setup.title)}-${ids.id.slice(0, 8)}`,
    title: setup.title, starts_at: setup.starts_at, ends_at: setup.ends_at, timezone: setup.timezone,
    audience: setup.audience, language: setup.language, invitation_mode: setup.invitation_mode,
    greeting: setup.greeting || base.greeting, introduction: setup.introduction || base.introduction, closing: setup.closing || base.closing,
    venue_name: office || setup.venue_name ? setup.venue_name : base.venue_name,
    address: office || setup.address ? setup.address : base.address,
    location_url: office || setup.location_url ? setup.location_url : base.location_url,
    sections: base.sections.map(section => ({ ...section, enabled: modules.has(section.key) })),
    rsvp_enabled: modules.has("rsvp"), rsvp_closes_at: modules.has("rsvp") ? setup.rsvp_closes_at : null,
    guest_estimate: setup.guest_estimate,
    contact: setup.contact_name ? { ...base.contact, name: setup.contact_name, phone: setup.contact_phone } : base.contact,
    // Internal events have no Google review (decision of 15 Oct).
    review_enabled: setup.audience === "internal" ? false : base.review_enabled,
    created_at: ids.now, updated_at: ids.now,
  };
}

export function buildEventFromSetup(setup: EventSetup, ids: Ids): EventRecord {
  const template = templateOf(setup.template);
  const base = createBlankEvent();
  const event = apply({
    ...base,
    event_kind: template?.kind ?? "acara",
    theme: { key: template?.theme ?? "werkudara", corners: "square" },
    prepare: { ...base.prepare, items: (template?.prepare ?? []).map(card => ({ icon: card.icon, title: card.title, description: "", list: [] })) },
  }, setup, ids);
  const feedback = setup.modules.includes("feedback");
  return {
    ...event,
    feedback_enabled: feedback,
    feedback_questions: feedback ? standardQuestions().map((question, sort_order) => ({ id: ids.uuid(), ...question, options: [], sort_order })) : [],
  };
}

/**
 * A copy of an earlier event under a new name and date. Every other time in it (rundown, RSVP
 * deadline, survey opening) moves by the same amount, so the schedule keeps its shape.
 */
export function copyEventWithSetup(source: EventRecord, setup: EventSetup, ids: Ids): EventRecord {
  const shiftBy = Date.parse(setup.starts_at) - Date.parse(source.starts_at);
  const shift = (value: string | null) => value ? new Date(Date.parse(value) + shiftBy).toISOString() : value;
  const moved: EventRecord = {
    ...source,
    agenda: source.agenda.map(item => ({ ...item, id: ids.uuid(), starts_at: shift(item.starts_at)!, ends_at: shift(item.ends_at)! })),
    feedback_questions: source.feedback_questions.map(question => ({ ...question, id: ids.uuid() })),
    feedback_opens_at: shift(source.feedback_opens_at),
    phase_override: "auto",
    translations: { ...source.translations, en: { ...source.translations.en, agenda: {} } },
  };
  const copy = apply(moved, { ...setup, rsvp_closes_at: setup.rsvp_closes_at ?? shift(source.rsvp_closes_at) }, ids);
  // English rundown texts and activity details follow their sessions to the new ids.
  const remap = <T,>(byId: Record<string, T>) => Object.fromEntries(source.agenda.flatMap((item, index) => byId[item.id] ? [[copy.agenda[index].id, byId[item.id]]] : []));
  return { ...copy, agenda_details: remap(source.agenda_details ?? {}), translations: { ...copy.translations, en: { ...copy.translations.en, agenda: remap(source.translations.en.agenda) } } };
}

/** What still needs writing after the survey, for its last step and the editor's first visit. */
export function setupTodo(setup: EventSetup): string[] {
  const has = (key: SectionKey) => setup.modules.includes(key);
  const template = templateOf(setup.template);
  const todo: string[] = [];
  if (!setup.introduction) todo.push("Isi undangan (blok Identitas & undangan)");
  if (has("agenda")) todo.push("Rundown: sesi dan jamnya");
  if (setup.location === "later" || (setup.location === "other" && (!setup.venue_name || !setup.address))) todo.push("Lokasi: nama tempat, alamat, dan tautan Maps");
  if (has("experience")) todo.push("Pengalaman kunjungan: cerita singkat dan momen");
  if (has("prepare")) todo.push(template?.prepare.length ? `Kartu persiapan: ${template.prepare.map(card => card.title).join(", ")}` : "Kartu persiapan tamu");
  if (has("contact") && !setup.contact_name) todo.push("Kontak PIC");
  if (setup.language !== "id") todo.push("Terjemahan English (blok Bahasa & terjemahan)");
  todo.push("Foto latar pembuka (opsional)");
  return todo;
}
