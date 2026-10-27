import "server-only";
import { latestFridaySharing } from "@/lib/friday-sharing";
import { randomUUID } from "node:crypto";
import type { EventRecord, StaffMember } from "@/lib/types";
import { contactFromStaff } from "@/lib/staff";
import { buildEventFromSetup, copyEventWithSetup, type EventSetup } from "@/lib/event-setup";
import { withoutModules, type AdminModule } from "@/lib/admin-modules";
import { eventSchema } from "@/lib/validation";
import { createPrivilegedClient, createPublicClient } from "./supabase/admin";
import { normalizeEvent } from "@/lib/hero-framing";
import { databaseError, validate } from "./http";
import { ServiceError } from "./config";

/** The event shown at the bare domain. Published only; the view enforces that. */
export async function getFeaturedEvent(): Promise<EventRecord | null> {
  const { data, error } = await createPublicClient().from("featured_event").select("document").maybeSingle();
  if (error) databaseError(error);
  return data?.document ? normalizeEvent(data.document as EventRecord) : null;
}

export async function getFeaturedEventId(): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("site_settings").select("featured_event_id").maybeSingle();
  if (error) databaseError(error);
  return (data?.featured_event_id as string | null) ?? null;
}

export async function setFeaturedEvent(eventId: string | null): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().rpc("set_featured_event", { p_event: eventId });
  if (error) databaseError(error);
  return (data as string | null) ?? null;
}

export async function getPublicEvent(slug: string): Promise<EventRecord | null> {
  const { data, error } = await createPublicClient().from("event_documents").select("document").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) databaseError(error);
  return data?.document ? normalizeEvent(data.document as EventRecord) : null;
}
/** Not migrated yet (202610210004): there are no codes, so nothing is found by code. */
const noCodeColumn = (error: { code?: string; message?: string }) => error.code === "42703" || /code/.test(error.message ?? "") && /column/.test(error.message ?? "");

/** A published event by its short code (`AB23CD`). */
export async function getPublicEventByCode(code: string): Promise<EventRecord | null> {
  const { data, error } = await createPublicClient().from("event_documents").select("document").eq("code", code).eq("status", "published").maybeSingle();
  if (error) { if (noCodeColumn(error)) return null; databaseError(error); }
  return data?.document ? normalizeEvent(data.document as EventRecord) : null;
}

/**
 * The Friday Sharing behind /friday-sharing: of the published CSR events, the one dated latest
 * (by its date, else when it was made). One fixed link to share every week; each event keeps its
 * own code link too, which the WhatsApp news to donors uses.
 */
export async function getCurrentFridaySharing(): Promise<EventRecord | null> {
  const { data, error } = await createPublicClient().from("event_documents").select("document").eq("status", "published").eq("document->>event_kind", "csr").limit(100);
  if (error) databaseError(error);
  return latestFridaySharing((data ?? []).map(row => normalizeEvent(row.document as EventRecord)));
}

/** An admin address names an event by its code or its id; both lead to the id. */
export async function resolveEventRef(ref: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref.toLowerCase();
  const code = ref.toUpperCase();
  if (!/^[A-HJKMNP-Z2-9]{6}$/.test(code)) return null;
  const { data, error } = await createPrivilegedClient().from("events").select("id").eq("code", code).maybeSingle();
  if (error) { if (noCodeColumn(error)) return null; databaseError(error); }
  return (data?.id as string | undefined) ?? null;
}

export async function getAdminEvent(id: string): Promise<EventRecord | null> {
  return readAdminEvent(id);
}
export async function readAdminEvent(id: string): Promise<EventRecord | null> {
  const { data, error } = await createPrivilegedClient().from("event_documents").select("document").eq("id", id).maybeSingle();
  if (error) databaseError(error);
  return data?.document ? normalizeEvent(data.document as EventRecord) : null;
}
export async function listAdminEvents(): Promise<EventRecord[]> {
  const { data, error } = await createPrivilegedClient().from("event_documents").select("document").order("updated_at", { ascending: false }).limit(1000);
  if (error) databaseError(error);
  return (data ?? []).map(row => normalizeEvent(row.document as EventRecord));
}
export async function saveEvent(id: string, input: unknown, create = false): Promise<EventRecord> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ServiceError(422, "Konten acara tidak valid.");
  const now = new Date().toISOString();
  const event = validate(eventSchema, { ...input, id, created_at: now, updated_at: now });
  const { data, error } = await createPrivilegedClient().rpc("save_event", { p_id: id, p_document: event, p_create: create });
  if (error) databaseError(error);
  return normalizeEvent(data as EventRecord);
}
/** Permanent, and it takes the guest answers with it. The caller must have confirmed first. */
export async function deleteEvent(id: string): Promise<{ slug: string; rsvps: number; feedback: number }> {
  const { data, error } = await createPrivilegedClient().rpc("delete_event", { p_id: id });
  if (error) databaseError(error);
  return data as { slug: string; rsvps: number; feedback: number };
}

/**
 * A new draft: from the "Buat acara" answers (template or blank), or a copy of an earlier event,
 * optionally under the survey's new name and date. Guest data is never copied.
 */
export async function createEvent(duplicateId?: string, setup?: EventSetup, disabled: AdminModule[] = [], pic?: StaffMember | null): Promise<EventRecord> {
  // New drafts never start with a module the admin may not use, whatever the template or source had.
  // A PIC picked from the team fills the contact in the same save.
  const clean = (event: EventRecord) => {
    const allowed = disabled.length ? withoutModules(event, disabled) : event;
    return pic ? { ...allowed, contact: contactFromStaff(allowed.contact, pic) } : allowed;
  };
  const id = randomUUID();
  const ids = { id, uuid: () => randomUUID(), now: new Date().toISOString() };
  if (!duplicateId) {
    if (!setup) throw new ServiceError(422, "Isi survei Buat acara terlebih dahulu.");
    return saveEvent(id, clean(buildEventFromSetup(setup, ids)), true);
  }
  const source = await readAdminEvent(duplicateId);
  if (!source) throw new ServiceError(404, "Acara sumber tidak ditemukan.");
  if (setup) return saveEvent(id, clean(copyEventWithSetup(source, setup, ids)), true);
  const agenda = source.agenda.map(item => ({ ...item, id: randomUUID() }));
  // Details and English texts keyed by session id follow their sessions to the new ids.
  const remap = <T,>(byId: Record<string, T>) => Object.fromEntries(source.agenda.flatMap((item, index) => byId[item.id] ? [[agenda[index].id, byId[item.id]]] : []));
  const draft: EventRecord = { ...source, id, status: "draft", slug: `${source.slug.slice(0, 62)}-${id}`, agenda,
    agenda_details: remap(source.agenda_details ?? {}), translations: { ...source.translations, en: { ...source.translations.en, agenda: remap(source.translations.en.agenda) } },
    feedback_questions: source.feedback_questions.map(question => ({ ...question, id: randomUUID() })) };
  return saveEvent(id, clean(draft), true);
}
