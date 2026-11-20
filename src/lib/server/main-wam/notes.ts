import "server-only";
import { demoSample } from "@/lib/main-wam/demo-sample";
import { sampleNotifications } from "@/lib/main-wam/sample";
import { announcementKind, notePushTopic, noteTone } from "@/lib/main-wam/notify";
import { NOTE_KIND } from "@/lib/main-wam/rows";
import type { AnnouncementAudience, MainWamSettings, MwNotification, NoteKind, NoteTone, PinnedNote } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "../pra-wam/events";
import { schedulePush } from "../pra-wam/push";
import { HIDDEN_AUDIENCE_LABEL } from "@/lib/main-wam-visibility";
import { mainWamHidden } from "../main-wam-visibility";
import { demoOn } from "./demo";
import { mwFail, mwMissing } from "./errors";
import { mainWamEventPeople } from "./people";
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
  if (!wam) throw new ServiceError(503, "Acara WAM 2027 belum disiapkan. Hubungi tim CoE.");
  return wam.id;
}

/**
 * Who Main WAM is on for now, among everyone with an active WAM account (people.ts, the one list):
 * everyone in mode semua; else the penguji (listed, panitia, admin). While Main WAM is hidden from
 * Journey (until the super admin shows it): only the penguji an admin listed by name, whatever the mode,
 * never the committee or admins by role (they are Pra WAM's, not the WAM team).
 */
export async function mainWamAudience(settings?: MainWamSettings): Promise<string[]> {
  const [{ mode }, people, hidden] = await Promise.all([settings ?? readMainWamSettings(), mainWamEventPeople(), mainWamHidden()]);
  if (hidden) {
    const listed = await testerIds();
    return people.accounts.filter(id => listed.has(id));
  }
  if (mode === "semua") return [...people.accounts];
  const listed = await testerIds();
  return people.accounts.filter(id => listed.has(id) || people.panitia.has(id) || people.admin.has(id));
}

/** Who an announcement's audience means now, within Main WAM's audience. */
export async function resolveAudience(audience: AnnouncementAudience, settings?: MainWamSettings): Promise<{ ids: string[]; label: string }> {
  const within = new Set(await mainWamAudience(settings));
  const keep = (ids: string[]) => [...new Set(ids)].filter(id => within.has(id));
  switch (audience.type) {
    // Hidden: "everyone" is the listed penguji, and says so (the TV and Pra WAM's lists read "Semua peserta").
    case "semua": return { ids: [...within], label: (await mainWamHidden()) ? HIDDEN_AUDIENCE_LABEL : "Semua peserta" };
    case "panitia": return { ids: keep([...(await mainWamEventPeople()).panitia]), label: "Panitia" };
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
  /** Beranda's banner: warning for a change to act on; none = the app decides (noteTone). */
  tone?: NoteTone;
};

/** Writes the note to every recipient's bell and pushes it; how many got it. Throws (503 before the migration). */
export async function sendMainWamNote(input: NoteInput): Promise<number> {
  const settings = await readMainWamSettings();
  const [resolved, within, eventId, hidden] = await Promise.all([
    "audience" in input.to ? resolveAudience(input.to.audience, settings) : { ids: input.to.people, label: input.to.label },
    "audience" in input.to ? null : mainWamAudience(settings).then(ids => new Set(ids)),
    // No recipients is said first (422); the missing event only matters when there are some.
    wamEventId().catch((error: unknown) => ({ error })),
    mainWamHidden(),
  ]);
  const ids = resolved.ids.filter(id => id !== input.except && (!within || within.has(id)));
  if (!ids.length) throw new ServiceError(422, "Belum ada penerima untuk pilihan ini.");
  if (typeof eventId !== "string") throw eventId.error;
  const { data, error } = await db().from("pw_announcements")
    // Hidden: never a committee announcement (kind pengumuman shows in Pra WAM's sent list, BOD's numbers and the office TV).
    .insert({ event_id: eventId, kind: hidden ? "sesi" : announcementKind(input.kind), title: input.title, body: input.body, audience_label: resolved.label.slice(0, 300), created_by: input.by })
    .select("id").single();
  if (error) databaseError(error);
  const link = input.link ?? "";
  const { error: noteError } = await db().from("mw_notes").insert({
    announcement_id: data.id, kind: input.kind, link, pinned_until: input.pinnedUntil ?? null, tone: input.tone ?? null,
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

type NoteMeta = { kind: string; link: string; pinned_until: string | null; tone: string | null };
type NoteRow = {
  id: string; title: string; body: string; created_at: string;
  pw_notification_receipts: { read_at: string | null } | { read_at: string | null }[] | null;
  mw_notes?: NoteMeta | NoteMeta[] | null;
};
const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const NOTE_META = "mw_notes(kind,link,pinned_until,tone)";

function itemOf(row: NoteRow): MwNotification {
  const note = one(row.mw_notes);
  const kind = note ? NOTE_KIND(note.kind) : "lain";
  return {
    id: row.id, kind, title: row.title, body: row.body, createdAt: row.created_at, readAt: one(row.pw_notification_receipts)?.read_at ?? null,
    link: note?.link || null, pinnedUntil: note?.pinned_until ?? null, fromPraWam: !note, tone: noteTone({ kind, title: row.title, tone: note?.tone }),
  };
}

/**
 * The person's notifications (Main WAM's and Pra WAM's), the newest 100 first, and how many are
 * unread. One query from the announcements through the person's receipts, ordered by the
 * announcement's time (audit S8: never a cut of receipts in no order, which could drop the newest).
 */
export async function myMainWamNotifications(employeeId: string): Promise<{ items: MwNotification[]; unread: number; migrated: boolean }> {
  const real = await realNotifications(employeeId);
  if (real.items.length || !(await demoOn())) return real;
  // Mode demo: the sample's notifications while the inbox is empty.
  const items = demoSample(sampleNotifications).map(item => ({ ...item, tone: noteTone(item) }));
  return { items, unread: items.filter(item => !item.readAt).length, migrated: true };
}

async function realNotifications(employeeId: string): Promise<{ items: MwNotification[]; unread: number; migrated: boolean }> {
  const inbox = (withNotes: boolean) => db().from("pw_announcements")
    .select(`id,title,body,created_at,pw_notification_receipts!inner(read_at)${withNotes ? `,${NOTE_META}` : ""}`)
    .eq("pw_notification_receipts.employee_id", employeeId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  const [first, unread] = await Promise.all([
    inbox(true),
    db().from("pw_notification_receipts").select("announcement_id", { count: "exact", head: true }).eq("employee_id", employeeId).is("read_at", null),
  ]);
  let { data, error } = first;
  // Before Main WAM's migration: Pra WAM's notes, plainly.
  if (error && mwMissing(error)) ({ data, error } = await inbox(false));
  if (error || unread.error) {
    const failed = error ?? unread.error!;
    if (mwMissing(failed)) return { items: [], unread: 0, migrated: false };
    databaseError(failed);
  }
  return { items: ((data ?? []) as unknown as NoteRow[]).map(itemOf), unread: unread.count ?? 0, migrated: true };
}

/**
 * Pengumuman penting still pinned for this person now, newest first (Beranda's banner), each with
 * its tone. Read on their own (the pin's index), so a long inbox never pushes a pinned one out (S8).
 */
export async function pinnedForMe(employeeId: string, now = new Date()): Promise<PinnedNote[]> {
  const real = await realPinned(employeeId, now);
  if (real.length || !(await demoOn())) return real;
  return demoSample(sampleNotifications, now).map(item => ({ ...item, tone: noteTone(item) }))
    .filter((item): item is PinnedNote => item.kind === "pengumuman" && !!item.pinnedUntil && Date.parse(item.pinnedUntil) > now.getTime());
}

async function realPinned(employeeId: string, now: Date): Promise<PinnedNote[]> {
  try {
    const { data, error } = await db().from("pw_announcements")
      .select("id,title,body,created_at,pw_notification_receipts!inner(read_at),mw_notes!inner(kind,link,pinned_until,tone)")
      .eq("pw_notification_receipts.employee_id", employeeId).eq("mw_notes.kind", "pengumuman").gt("mw_notes.pinned_until", now.toISOString())
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20);
    if (error) return [];
    return ((data ?? []) as unknown as NoteRow[]).map(itemOf)
      .filter((item): item is PinnedNote => item.kind === "pengumuman" && !!item.pinnedUntil && Date.parse(item.pinnedUntil) > now.getTime());
  } catch { return []; }
}

/** Mark one, or all, read. */
export async function markMainWamRead(employeeId: string, announcementId?: string): Promise<void> {
  let query = db().from("pw_notification_receipts").update({ read_at: new Date().toISOString() }).eq("employee_id", employeeId).is("read_at", null);
  if (announcementId) query = query.eq("announcement_id", announcementId);
  const { error } = await query;
  if (error) databaseError(error);
}
