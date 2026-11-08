import "server-only";
import { praWamPath } from "@/lib/routes";
import { cache } from "react";
import { managesSessions } from "@/lib/pra-wam/roles";
import { sessionWhen, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "./events";
import type { PushTopic } from "@/lib/pra-wam/push";
import { schedulePush } from "./push";
import type { Member } from "./session";

/*
 * Announcements and in-app notifications (migration 202611040006). Recipients are written down
 * when something is sent; each person reads their own list and marks it read. The notes the app
 * writes about sessions never stop the session from saving: before the migration, or on a hiccup,
 * the session is still saved and only the note is missing.
 */

const MIGRATION = "202611040006_pra_wam_announcements.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_announcements|pw_notification_receipts/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Pengumuman menunggu migrasi ${MIGRATION}.`);

export type Audience = { type: "semua" } | { type: "sesi"; sessionId: string } | { type: "unit"; unitIds: string[] } | { type: "orang"; employeeIds: string[]; label: string; sessionId?: string };
export type Notification = {
  id: string; kind: "pengumuman" | "sesi"; title: string; body: string; sessionId: string | null; createdAt: string; readAt: string | null;
  /** Where its button goes when it is not a session's (an older Meeting HOD note opens Book). */
  link?: { href: string; label: string };
  /** A note from Meeting HOD: its session's invitation can be answered on it (Terima, Tolak). */
  hod?: boolean;
};
/** The label Meeting HOD's notes carry, so each opens Meeting HOD. */
export const HOD_NOTE_LABEL = "Meeting HOD";
export type SentAnnouncement = { id: string; title: string; body: string; audienceLabel: string; createdAt: string; recipients: number; read: number };

async function eventId(): Promise<string> {
  const event = (await listEvents()).events.find(item => item.kind === "pra_wam");
  if (!event) throw new ServiceError(503, "Acara Pra WAM belum tersedia.");
  return event.id;
}

/** Who an audience means right now, and how to name it in the list. */
async function resolve(audience: Audience): Promise<{ ids: string[]; label: string; sessionId: string | null }> {
  const client = createPrivilegedClient();
  if (audience.type === "sesi") {
    const [{ data: session }, { data: links, error }] = await Promise.all([
      client.from("pw_sessions").select("title").eq("id", audience.sessionId).maybeSingle(),
      client.from("pw_session_participants").select("employee_id").eq("session_id", audience.sessionId),
    ]);
    if (error) databaseError(error);
    return { ids: (links ?? []).map(link => link.employee_id), label: `Peserta ${session?.title ?? "sesi"}`, sessionId: audience.sessionId };
  }
  if (audience.type === "orang") return { ids: [...new Set(audience.employeeIds)], label: audience.label, sessionId: audience.sessionId ?? null };
  if (audience.type === "unit") {
    const [{ data: units }, { data: members, error }] = await Promise.all([
      client.from("org_units").select("id,name,code").in("id", audience.unitIds),
      client.from("unit_members").select("employee_id").in("unit_id", audience.unitIds),
    ]);
    if (error) databaseError(error);
    return { ids: [...new Set((members ?? []).map(member => member.employee_id))], label: (units ?? []).map(unit => unit.code || unit.name).join(", "), sessionId: null };
  }
  const { data, error } = await client.from("employees").select("id").eq("active", true).limit(2000);
  if (error) databaseError(error);
  return { ids: (data ?? []).map(person => person.id), label: "Semua peserta", sessionId: null };
}

/**
 * Writes the note to every recipient's bell, and pushes it to the phones of those whose choices
 * allow its `topic` (null: the bell only). Notes with the same `tag` replace each other on a phone
 * (the latest news about one session), instead of piling up; without one, each note stands alone.
 */
async function send(input: { kind: "pengumuman" | "sesi"; title: string; body: string; audience: Audience; createdBy: string | null; except?: string; topic: PushTopic | null; tag?: string }): Promise<number> {
  const { ids: everyone, label, sessionId } = await resolve(input.audience);
  const ids = input.except ? everyone.filter(id => id !== input.except) : everyone;
  if (!ids.length) throw new ServiceError(422, "Belum ada penerima untuk pilihan ini.");
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_announcements")
    .insert({ event_id: await eventId(), kind: input.kind, title: input.title, body: input.body, session_id: sessionId, audience_label: label, created_by: input.createdBy })
    .select("id").single();
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  const { error: receiptError } = await client.from("pw_notification_receipts").insert(ids.map(employee_id => ({ announcement_id: data.id, employee_id })));
  if (receiptError) databaseError(receiptError);
  // The same note on the phones that turned it on (Notifikasi di HP); tapping it opens Notifikasi.
  await schedulePush(ids, { title: input.title, body: input.body, url: praWamPath.notifications, tag: input.tag ?? data.id }, input.topic).catch(() => undefined);
  return ids.length;
}

/** Panitia sends an announcement now. */
export async function sendAnnouncement(input: { title: string; body: string; audience: Audience }, viewer: Member): Promise<number> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa mengirim pengumuman.");
  return send({ kind: "pengumuman", ...input, createdBy: viewer.id, topic: "pengumuman" });
}

const sessionNotes = {
  terbit: (title: string) => `Sesi baru: ${title}`,
  berubah: (title: string) => `Jadwal berubah: ${title}`,
  batal: (title: string) => `Dibatalkan: ${title}`,
};

/**
 * The app tells a session's participants it was published, moved, or cancelled; `except` leaves
 * one person out (a booker who made the change). Pushed as `topic` (default "forum", panitia's
 * sessions; a booking passes its own, null for the bell only), tagged per session by default so
 * the latest news replaces the earlier one on the phone. Never throws.
 */
export async function notifySession(
  session: Pick<Session, "id" | "title" | "startsAt" | "endsAt" | "planFrom" | "planTo" | "roomName" | "location">,
  change: keyof typeof sessionNotes, by: Member, { except, topic = "forum", tag }: { except?: string; topic?: PushTopic | null; tag?: string } = {},
): Promise<void> {
  try {
    const body = change === "batal" ? "Sesi ini tidak jadi diadakan." : `${sessionWhen(session)} · ${sessionWhere(session)}`;
    await send({ kind: "sesi", title: sessionNotes[change](session.title), body, audience: { type: "sesi", sessionId: session.id }, createdBy: by.id, except, topic, tag: tag ?? `sesi-${session.id}` });
  } catch { /* the session is saved either way */ }
}

/** The person's notifications, newest first, and how many are unread. */
export async function myNotifications(member: Member): Promise<{ items: Notification[]; unread: number; migrated: boolean }> {
  const client = createPrivilegedClient();
  const { data: receipts, error } = await client.from("pw_notification_receipts").select("announcement_id,read_at").eq("employee_id", member.id);
  if (error) { if (missing(error)) return { items: [], unread: 0, migrated: false }; databaseError(error); }
  const ids = (receipts ?? []).map(receipt => receipt.announcement_id);
  if (!ids.length) return { items: [], unread: 0, migrated: true };
  const { data, error: noteError } = await client.from("pw_announcements").select("id,kind,title,body,session_id,created_at,audience_label").in("id", ids).order("created_at", { ascending: false }).limit(100);
  if (noteError) databaseError(noteError);
  const items = (data ?? []).map(row => ({
    id: row.id, kind: row.kind, title: row.title, body: row.body, sessionId: row.session_id, createdAt: row.created_at,
    ...(row.audience_label === HOD_NOTE_LABEL ? { hod: true, ...(row.session_id ? {} : { link: { href: praWamPath.appraisal(), label: "Buka Book" } }) } : {}),
    readAt: receipts?.find(receipt => receipt.announcement_id === row.id)?.read_at ?? null,
  }));
  return { items, unread: (receipts ?? []).filter(receipt => !receipt.read_at).length, migrated: true };
}

/** For the badge in the menu; 0 before the migration. */
async function unreadCountUncached(employeeId: string): Promise<number> {
  const { count, error } = await createPrivilegedClient().from("pw_notification_receipts").select("announcement_id", { count: "exact", head: true }).eq("employee_id", employeeId).is("read_at", null);
  return error ? 0 : count ?? 0;
}
/** Read once per request, however many parts of the page ask. */
export const unreadCount = cache(unreadCountUncached);

export async function markRead(member: Member, announcementId?: string): Promise<void> {
  let query = createPrivilegedClient().from("pw_notification_receipts").update({ read_at: new Date().toISOString() }).eq("employee_id", member.id).is("read_at", null);
  if (announcementId) query = query.eq("announcement_id", announcementId);
  const { error } = await query;
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
}

/** Panitia's announcements with how many have read them. */
export async function sentAnnouncements(viewer: Member): Promise<{ items: SentAnnouncement[]; migrated: boolean }> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa melihat pengumuman terkirim.");
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_announcements").select("id,title,body,audience_label,created_at").eq("kind", "pengumuman").order("created_at", { ascending: false }).limit(100);
  if (error) { if (missing(error)) return { items: [], migrated: false }; databaseError(error); }
  if (!data?.length) return { items: [], migrated: true };
  const { data: receipts, error: receiptError } = await client.from("pw_notification_receipts").select("announcement_id,read_at").in("announcement_id", data.map(row => row.id));
  if (receiptError) databaseError(receiptError);
  return {
    migrated: true,
    items: data.map(row => {
      const mine = (receipts ?? []).filter(receipt => receipt.announcement_id === row.id);
      return { id: row.id, title: row.title, body: row.body, audienceLabel: row.audience_label, createdAt: row.created_at, recipients: mine.length, read: mine.filter(receipt => receipt.read_at).length };
    }),
  };
}

/**
 * A note from the app to some people (e.g. the answer to their request), pushed as `topic` (null:
 * the bell only) and, with a `tag`, replacing the earlier note of that tag on the phone. Never throws.
 */
export async function notifyPeople(employeeIds: string[], note: { title: string; body: string; sessionId?: string; label?: string; topic: PushTopic | null; tag?: string }, by: Member): Promise<void> {
  try { await send({ kind: "sesi", title: note.title, body: note.body, audience: { type: "orang", employeeIds, label: note.label ?? "Pribadi", sessionId: note.sessionId }, createdBy: by.id, topic: note.topic, tag: note.tag }); }
  catch { /* the answer is saved either way */ }
}

/**
 * A note from the app itself, not from a person (Admin WAM has no WAM account): the questionnaire
 * reminder. Unlike notifyPeople it throws, so the admin hears when it did not go out. Pushed as
 * Pengingat kuesioner, one at a time on the phone (a new reminder replaces the last).
 */
export async function notifyFromApp(employeeIds: string[], note: { title: string; body: string; label: string }): Promise<number> {
  return send({ kind: "sesi", title: note.title, body: note.body, audience: { type: "orang", employeeIds, label: note.label }, createdBy: null, topic: "kuesioner", tag: "kuesioner" });
}

/** The latest app note sent under this label: when, and to how many; null if none (or before the migration). */
export async function lastAppNote(label: string): Promise<{ at: string; recipients: number } | null> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_announcements").select("id,created_at").eq("audience_label", label).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const { count } = await client.from("pw_notification_receipts").select("employee_id", { count: "exact", head: true }).eq("announcement_id", data.id);
  return { at: data.created_at, recipients: count ?? 0 };
}

/** Panitia removes an announcement (a test, a mistake); it leaves every recipient's list too. */
export async function deleteAnnouncement(id: string, viewer: Member): Promise<void> {
  if (!managesSessions(viewer)) throw new ServiceError(403, "Hanya panitia yang bisa menghapus pengumuman.");
  const { data, error } = await createPrivilegedClient().from("pw_announcements").delete().eq("id", id).select("id");
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  if (!data?.length) throw new ServiceError(404, "Pengumuman tidak ditemukan.");
}
