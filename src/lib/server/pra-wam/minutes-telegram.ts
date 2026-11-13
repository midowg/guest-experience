import "server-only";
import { departmentShorts } from "@/lib/employees";
import { wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { minutesItems, type Minutes, type MinutesTelegram } from "@/lib/pra-wam/minutes";
import { minutesCode, type MinutesMessage } from "@/lib/pra-wam/minutes-message";
import type { Session } from "@/lib/pra-wam/sessions";
import { canonicalTitle, momTargets, type PersonPlace, type TelegramGroup } from "@/lib/pra-wam/telegram";
import { praWamPath } from "@/lib/routes";
import { shareUrl } from "@/lib/site-url";
import { createPrivilegedClient } from "../supabase/admin";
import { telegramConfig } from "../telegram";
import { listPeople, memberDepartments } from "./appraisal";
import { attendeesOf } from "./minutes-people";
import { minutesPdf } from "./minutes-pdf";
import { minutePhotoBytes } from "./minutes-photos";
import { groupShorts, listGroups, postMinutes, sendMinutePhotos, teamsReady, withChatInfo } from "./telegram";

/*
 * Kirim MoM ke Telegram (12 Nov 2026, migration 202611120004): which groups a meeting's MoM goes to
 * (momTargets: the HOD group for a Meeting HOD or ITEM, else each participant's department or team),
 * the message and PDF it goes as, and the post of each group, kept so a later version changes the
 * same message. Sending never undoes a save: a group that fails is noted and tried again on the
 * next save.
 */

type MessageRow = { chat_id: number | string; title: string; message_id: number | null; version: number; status: "terkirim" | "gagal"; error: string | null; sent_at: string | null };

const clock = (iso: string | null) => (iso ? wibTime(iso).replace(":", ".") : null);

async function participantIds(sessionId: string): Promise<string[]> {
  const { data } = await createPrivilegedClient().from("pw_session_participants").select("employee_id").eq("session_id", sessionId);
  return (data ?? []).map(row => row.employee_id as string);
}

/** Each person's places: the department and team of every job; without job rows, their department. */
async function placesOf(ids: readonly string[]): Promise<PersonPlace[]> {
  if (!ids.length) return [];
  const client = createPrivilegedClient();
  const { data: jobs } = await client.from("employee_jobs").select("employee_id,department,unit").in("employee_id", [...ids]);
  const withJobs = new Set((jobs ?? []).map(row => row.employee_id as string));
  const places: PersonPlace[] = (jobs ?? []).map(row => ({ department: String(row.department ?? ""), unit: String((row as { unit?: string | null }).unit ?? "") }));
  const rest = ids.filter(id => !withJobs.has(id));
  if (rest.length) {
    const { data } = await client.from("employees").select("department").in("id", rest);
    places.push(...(data ?? []).map(row => ({ department: String(row.department ?? ""), unit: "" })));
  }
  return places.filter(place => place.department.trim());
}

/** Whether a BOD member is in the meeting: its MoM then also goes to the CoS, who forwards it (13 Nov 2026). */
async function withBod(ids: readonly string[]): Promise<boolean> {
  if (!ids.length) return false;
  const { data, error } = await createPrivilegedClient().from("pw_roles").select("employee_id").eq("role", "bod").in("employee_id", [...ids]).limit(1);
  return !error && (data ?? []).length > 0;
}

/** A Meeting HOD or ITEM (a booking made as HOD): its MoM goes to the HOD group only. */
export async function isHodMeeting(session: Session): Promise<boolean> {
  if (!session.booking) return false;
  const { isHodBooking } = await import("./hod");
  return isHodBooking(session.booking.id).catch(() => false);
}

/** Where this meeting's MoM goes now, or why it cannot go to Telegram. */
export async function minutesTargets(session: Session): Promise<{ ready: boolean; reason: string | null; groups: TelegramGroup[]; all: TelegramGroup[] }> {
  if (!telegramConfig()) return { ready: false, reason: "Bot Telegram belum disiapkan.", groups: [], all: [] };
  const [ready, { migrated, groups }] = await Promise.all([teamsReady().catch(() => false), listGroups().catch(() => ({ migrated: false, groups: [] as TelegramGroup[] }))]);
  if (!ready || !migrated) return { ready: false, reason: "Pengiriman MoM ke Telegram menunggu pembaruan sistem.", groups: [], all: [] };
  const ids = await participantIds(session.id);
  const [places, hod, bod, shorts] = await Promise.all([placesOf(ids), isHodMeeting(session), withBod(ids), groupShorts()]);
  // WAM names each group one way (13 Nov 2026), whatever it is called in Telegram now.
  // Every group the bot can post in, for the notetaker to pick (13 Nov 2026): WAM's own pick first, then A–Z.
  const live = groups.filter(group => group.botStatus !== "dikeluarkan");
  const picked = new Set(momTargets(groups, places, hod, bod).map(group => group.chatId));
  const all = (await withChatInfo(live)).map(group => ({ ...group, title: canonicalTitle(group, shorts) }))
    .sort((a, b) => Number(picked.has(b.chatId)) - Number(picked.has(a.chatId)) || a.title.localeCompare(b.title, "id"));
  return { ready: true, reason: null, groups: all.filter(group => picked.has(group.chatId)), all };
}

/** What a MoM's message and PDF say. The department is the booker's (the HOD group's for a Meeting HOD). */
export async function minutesMessage(session: Session, minutes: Minutes, hod: boolean): Promise<MinutesMessage> {
  const [people, ids, owner, attendees, photos] = await Promise.all([
    listPeople(), participantIds(session.id), session.booking ? memberDepartments(session.booking.bookedBy.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
    attendeesOf(session.id).catch(() => []), photoCount(session.id),
  ]);
  const away = new Set(minutes.absentIds);
  const department = hod ? "Meeting HOD" : owner[0] ?? "WAM Werkudara";
  const short = hod ? "HOD" : owner[0] ? departmentShorts([owner[0]]).get(owner[0]) ?? owner[0] : "WAM";
  const names = people.filter(person => ids.includes(person.id)).map(person => person.name).sort((a, b) => a.localeCompare(b, "id"));
  const date = session.startsAt ? wibDate(session.startsAt) : wibDate(minutes.submittedAt);
  return {
    // The nomor surat typed (13 Nov 2026), else the automatic number (FRM form); before it, the code.
    code: minutes.docNumber ?? minutes.number ?? minutesCode(short, date, session.id),
    numbered: !!(minutes.docNumber || minutes.number),
    title: session.title, departmentShort: short, department, date,
    from: clock(session.startsAt), to: clock(session.endsAt), place: session.roomName ?? session.location ?? "",
    participants: names, notetaker: minutes.submittedBy,
    summary: minutes.summary, decisions: minutes.decisions,
    actions: minutes.actions.map(action => ({ task: action.task, pic: action.picNames?.length ? action.picNames.join(", ") : action.picName ?? null, dueDate: action.dueDate, done: action.done })),
    version: Math.max(1, minutes.version), at: minutes.version > 1 ? minutes.updatedAt : minutes.sentAt ?? minutes.updatedAt,
    changedBy: minutes.version > 1 ? minutes.updatedBy : null,
    link: new URL(praWamPath.session(session.id), shareUrl()).toString().replace(/^https?:\/\//, ""),
    chair: minutes.chairName, items: minutesItems(minutes),
    // Who came is kept from the FRM form on (a MoM with a number); before it, only who was in it.
    // The position is the form's (Head of Department, Staff…), not the job title.
    attendance: minutes.number ? attendees.map(person => ({ name: person.fullName, department: person.department, position: person.frmPosition, present: !away.has(person.id) })) : undefined,
    guests: minutes.guests, next: minutes.next, photoCount: photos,
  };
}

/** How many photos the meeting has (0 before migration 202611120005). */
async function photoCount(sessionId: string): Promise<number> {
  const { count, error } = await createPrivilegedClient().from("pw_session_minute_photos").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  return error ? 0 : count ?? 0;
}

/** A MoM's PDF with the meeting's photos: what Telegram gets and what Unduh PDF gives. */
export async function minutesPdfWithPhotos(sessionId: string, message: MinutesMessage): Promise<Uint8Array> {
  return minutesPdf(message, await minutePhotoBytes(sessionId).catch(() => []));
}

/** The posts of a MoM so far, per group (empty before migration 202611120004). */
export async function minutesDeliveries(sessionId: string): Promise<MinutesTelegram["deliveries"]> {
  const { data, error } = await createPrivilegedClient().from("pw_telegram_messages").select("chat_id,title,message_id,version,status,error,sent_at").eq("session_id", sessionId);
  if (error) return [];
  return ((data ?? []) as MessageRow[]).map(row => ({ title: row.title, status: row.status, error: row.error, version: row.version, at: row.sent_at }))
    .sort((a, b) => a.title.localeCompare(b.title, "id"));
}

/**
 * Sends (or changes) a sent MoM in each of its groups. Never throws: each group's outcome is kept
 * in pw_telegram_messages and shown under the MoM.
 */
export async function deliverMinutes(session: Session, minutes: Minutes, now = new Date()): Promise<void> {
  if (!minutes.sentAt || minutes.telegramOff) return;
  try {
    const targets = await minutesTargets(session);
    // The groups the notetaker picked, when they picked (13 Nov 2026); else WAM's pick.
    const chosen = minutes.telegramChats ? new Set(minutes.telegramChats) : null;
    const groups = chosen ? targets.all.filter(group => chosen.has(group.chatId)) : targets.groups;
    if (!targets.ready || !groups.length) return;
    const message = await minutesMessage(session, minutes, await isHodMeeting(session));
    const pdf = await minutesPdfWithPhotos(session.id, message);
    const client = createPrivilegedClient();
    const { data: before } = await client.from("pw_telegram_messages").select("chat_id,message_id,version,status").eq("session_id", session.id);
    const earlier = new Map((before ?? []).map(row => [String(row.chat_id), row.message_id as number | null]));
    // The version each group last received: a newer one is a revision, sent anew so the group hears of it (13 Nov 2026).
    const received = new Map((before ?? []).filter(row => row.status === "terkirim").map(row => [String(row.chat_id), row.version as number]));
    // The photos go once, as an album under the MoM, to a group the MoM reaches for the first time.
    const firstTime = groups.some(group => !earlier.get(group.chatId));
    const photos = firstTime ? await minutePhotoBytes(session.id).catch(() => [] as Uint8Array[]) : [];
    for (const group of groups) {
      const at = new Date().toISOString();
      try {
        const last = received.get(group.chatId);
        const posted = await postMinutes(group, message, earlier.get(group.chatId) ?? null, now, pdf, last !== undefined && message.version > last);
        if (!earlier.get(group.chatId) && photos.length) {
          await sendMinutePhotos(group, posted.chatId, message.code, photos).catch(error => console.error("minutes photos", error instanceof Error ? error.message : error));
        }
        if (posted.chatId !== group.chatId) await client.from("pw_telegram_messages").delete().eq("session_id", session.id).eq("chat_id", group.chatId);
        await client.from("pw_telegram_messages").upsert({
          session_id: session.id, chat_id: posted.chatId, title: group.title, message_id: posted.messageId, version: message.version,
          status: "terkirim", error: posted.topicLost ? "Topik MoM tidak bisa dipakai bot; MoM masuk ke grup." : null, sent_at: at, updated_at: at,
        }, { onConflict: "session_id,chat_id" });
      } catch (error) {
        await client.from("pw_telegram_messages").upsert({
          session_id: session.id, chat_id: group.chatId, title: group.title, message_id: earlier.get(group.chatId) ?? null, version: message.version,
          status: "gagal", error: (error instanceof Error ? error.message : "Gagal mengirim.").slice(0, 500), updated_at: at,
        }, { onConflict: "session_id,chat_id" });
      }
    }
  } catch (error) {
    console.error("minutes telegram", error instanceof Error ? error.message : error);
  }
}
