import "server-only";
import { announcementKind, notePushTopic } from "@/lib/main-wam/notify";
import { NOTE_KIND } from "@/lib/main-wam/rows";
import type { AnnouncementAudience, MainWamSettings, MwNotification, NoteKind } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "../pra-wam/events";
import { schedulePush } from "../pra-wam/push";
import { mwFail, mwMissing } from "./errors";
import { readMainWamSettings, testerIds } from "./settings";

/*
 * Main WAM's notes on WAM's one inbox (docs/main-wam/KONTRAK.md §4): a note is a pw_announcements
 * row (event WAM 2027) with a receipt per person, so the bell, "dibaca", and Pra WAM's own
 * Notifikasi keep working; mw_notes adds its kind, link, pin and audience. Phones get it through
 * the existing Web Push with the topic notePushTopic gives. Only people Main WAM is on for receive
 * a note: everyone in mode semua, the penguji otherwise (so a test never reaches the whole office).
 */

const db = () => createPrivilegedClient();

async function wamEventId(): Promise<string> {
  const wam = (await listEvents()).events.find(event => event.kind === "wam");
  if (!wam) throw new ServiceError(503, "Acara WAM 2027 belum tersedia (pw_events).");
  return wam.id;
}

/** Everyone with an active WAM account (and an active Data karyawan row). */
async function activeAccountIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("pw_accounts").select("employee_id,employees!inner(active)").eq("active", true).eq("employees.active", true).order("employee_id").range(from, from + 999);
    if (error) databaseError(error);
    ids.push(...(data ?? []).map(row => row.employee_id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  return ids;
}

/** Who Main WAM is on for now: everyone in mode semua; else the penguji (listed, panitia, admin). */
export async function mainWamAudience(settings?: MainWamSettings): Promise<string[]> {
  const mode = (settings ?? await readMainWamSettings()).mode;
  const everyone = await activeAccountIds();
  if (mode === "semua") return everyone;
  const [listed, { data: roles }] = await Promise.all([testerIds(), db().from("pw_roles").select("employee_id").in("role", ["panitia", "admin"])]);
  const testers = new Set([...listed, ...(roles ?? []).map(row => row.employee_id as string)]);
  return everyone.filter(id => testers.has(id));
}

/** Who an announcement's audience means now, within Main WAM's audience. */
export async function resolveAudience(audience: AnnouncementAudience, settings?: MainWamSettings): Promise<{ ids: string[]; label: string }> {
  const within = new Set(await mainWamAudience(settings));
  const keep = (ids: string[]) => [...new Set(ids)].filter(id => within.has(id));
  switch (audience.type) {
    case "semua": return { ids: [...within], label: "Semua peserta" };
    case "panitia": {
      const { data } = await db().from("pw_roles").select("employee_id").eq("role", "panitia");
      return { ids: keep((data ?? []).map(row => row.employee_id as string)), label: "Panitia" };
    }
    case "kelompok": {
      const [{ data: members }, { data: groups }] = await Promise.all([
        db().from("mw_group_members").select("employee_id").in("group_id", audience.groupIds),
        db().from("mw_groups").select("number,name").in("id", audience.groupIds).order("number"),
      ]);
      return { ids: keep((members ?? []).map(row => row.employee_id as string)), label: (groups ?? []).map(group => `Kelompok ${group.number} · ${group.name}`).join(", ") || "Kelompok" };
    }
    case "departemen": {
      const { data } = await db().from("employees").select("id").in("department", audience.departments).eq("active", true);
      return { ids: keep((data ?? []).map(row => row.id as string)), label: audience.departments.join(", ") };
    }
  }
}

export type NoteInput = {
  kind: NoteKind;
  title: string;
  body: string;
  /** Who gets it: an audience (announcements) or exact people (the app's own notes). */
  to: { audience: AnnouncementAudience } | { people: string[]; label: string };
  /** Where a tap goes (a Main WAM path); none = Notifikasi. */
  link?: string;
  /** Pengumuman penting: pinned on Beranda until then. */
  pinnedUntil?: string | null;
  /** The person sending (panitia), or null for the app itself. */
  by: string | null;
  /** Notes with the same tag replace each other on a phone (the latest about one session). */
  tag?: string;
  /** Leave one person out (who made the change). */
  except?: string;
  /** For kind momen: a photo hidden by panitia (pushed; likes are not). */
  photoHidden?: boolean;
};

/** Writes the note to every recipient's bell and pushes it; how many got it. Throws (503 before the migration). */
export async function sendMainWamNote(input: NoteInput): Promise<number> {
  const settings = await readMainWamSettings();
  const resolved = "audience" in input.to ? await resolveAudience(input.to.audience, settings) : { ids: input.to.people, label: input.to.label };
  const within = "audience" in input.to ? null : new Set(await mainWamAudience(settings));
  const ids = resolved.ids.filter(id => id !== input.except && (!within || within.has(id)));
  if (!ids.length) throw new ServiceError(422, "Belum ada penerima untuk pilihan ini.");
  const { data, error } = await db().from("pw_announcements")
    .insert({ event_id: await wamEventId(), kind: announcementKind(input.kind), title: input.title, body: input.body, audience_label: resolved.label.slice(0, 300), created_by: input.by })
    .select("id").single();
  if (error) databaseError(error);
  const link = input.link ?? "";
  const { error: noteError } = await db().from("mw_notes").insert({
    announcement_id: data.id, kind: input.kind, link, pinned_until: input.pinnedUntil ?? null,
    audience: "audience" in input.to ? input.to.audience : { type: "orang" }, updated_by: input.by,
  });
  if (noteError) { await db().from("pw_announcements").delete().eq("id", data.id); mwFail(noteError); }
  for (let at = 0; at < ids.length; at += 500) {
    const { error: receiptError } = await db().from("pw_notification_receipts").insert(ids.slice(at, at + 500).map(employee_id => ({ announcement_id: data.id, employee_id })));
    if (receiptError) databaseError(receiptError);
  }
  await schedulePush(ids, { title: input.title, body: input.body, url: link || mainWamPath.notifications, tag: input.tag ?? data.id }, notePushTopic(input.kind, { photoHidden: input.photoHidden })).catch(() => undefined);
  return ids.length;
}

/** The same, but never throws (a note about a change never stops the change). */
export async function trySendMainWamNote(input: NoteInput): Promise<number> {
  try { return await sendMainWamNote(input); } catch { return 0; }
}

type NoteRow = { id: string; title: string; body: string; created_at: string; mw_notes: { kind: string; link: string; pinned_until: string | null } | { kind: string; link: string; pinned_until: string | null }[] | null };
const noteOf = (row: NoteRow) => (Array.isArray(row.mw_notes) ? row.mw_notes[0] ?? null : row.mw_notes);

/** The person's notifications (Main WAM's and Pra WAM's), newest first, and how many are unread. */
export async function myMainWamNotifications(employeeId: string): Promise<{ items: MwNotification[]; unread: number; migrated: boolean }> {
  const { data: receipts, error } = await db().from("pw_notification_receipts").select("announcement_id,read_at").eq("employee_id", employeeId).limit(1000);
  if (error) { if (mwMissing(error) || error.code === "42P01" || error.code === "PGRST205") return { items: [], unread: 0, migrated: false }; databaseError(error); }
  const ids = (receipts ?? []).map(receipt => receipt.announcement_id as string);
  if (!ids.length) return { items: [], unread: 0, migrated: true };
  const select = (withNotes: boolean) => db().from("pw_announcements").select(withNotes ? "id,title,body,created_at,mw_notes(kind,link,pinned_until)" : "id,title,body,created_at")
    .in("id", ids.slice(0, 300)).order("created_at", { ascending: false }).limit(100);
  let { data, error: noteError } = await select(true);
  // Before Main WAM's migration: Pra WAM's notes, plainly.
  if (noteError && mwMissing(noteError)) ({ data, error: noteError } = await select(false));
  if (noteError) databaseError(noteError);
  const readAt = new Map((receipts ?? []).map(receipt => [receipt.announcement_id as string, (receipt.read_at as string | null) ?? null]));
  const items = ((data ?? []) as unknown as NoteRow[]).map(row => {
    const note = noteOf(row);
    return {
      id: row.id, kind: note ? NOTE_KIND(note.kind) : "lain", title: row.title, body: row.body, createdAt: row.created_at, readAt: readAt.get(row.id) ?? null,
      link: note?.link || null, pinnedUntil: note?.pinned_until ?? null, fromPraWam: !note,
    } satisfies MwNotification;
  });
  return { items, unread: (receipts ?? []).filter(receipt => !receipt.read_at).length, migrated: true };
}

/** Pengumuman penting still pinned for this person now, newest first (Beranda's banner). */
export async function pinnedForMe(employeeId: string, now = new Date()): Promise<MwNotification[]> {
  try {
    const { items } = await myMainWamNotifications(employeeId);
    return items.filter(item => item.kind === "pengumuman" && item.pinnedUntil && Date.parse(item.pinnedUntil) > now.getTime());
  } catch { return []; }
}

/** Mark one, or all, read. */
export async function markMainWamRead(employeeId: string, announcementId?: string): Promise<void> {
  let query = db().from("pw_notification_receipts").update({ read_at: new Date().toISOString() }).eq("employee_id", employeeId).is("read_at", null);
  if (announcementId) query = query.eq("announcement_id", announcementId);
  const { error } = await query;
  if (error) databaseError(error);
}
