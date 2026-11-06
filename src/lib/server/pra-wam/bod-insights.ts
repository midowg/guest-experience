import "server-only";
import { OUTSIDE_ROOM, wibDate } from "@/lib/pra-wam/appraisal";
import { adoptionBy, checkInMix, officeDaysAround, roomUse, type Adoption, type CheckInWay, type RoomUse } from "@/lib/pra-wam/bod";
import { sessionKinds, type SessionKind } from "@/lib/pra-wam/sessions";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople, weekSchedule } from "./appraisal";
import { departmentGroups } from "./dashboard";
import { listDocuments } from "./documents";
import { currentPhase } from "./events";
import type { Member } from "./session";
import { listSessions } from "./sessions";

/*
 * Ringkasan BOD, the wider picture (6 Nov 2026): everything a CEO may want at a glance beyond the
 * forums, read only and from real rows. Each part fails on its own: a table that is not there yet
 * (a migration) leaves that part empty (null) instead of breaking the page.
 */

export type UpcomingSession = { id: string; title: string; kind: SessionKind; startsAt: string; endsAt: string; where: string; participants: number };
export type BodInsights = {
  today: string;
  phase: { name: string; startDate: string; endDate: string; daysToWam: number | null; day: number | null; days: number | null } | null;
  sessions: { kind: SessionKind; published: number; drafts: number; cancelled: number }[];
  upcoming: UpcomingSession[];
  rooms: RoomUse | null;
  checkIns: { way: CheckInWay; count: number }[] | null;
  adoption: Adoption[];
  signedInWeek: number;
  documents: { total: number; general: number; perSession: number; recent: { id: string; title: string; by: string; at: string; session: string | null }[] } | null;
  announcements: { sent: number; recipients: number; read: number; latest: { title: string; at: string; recipients: number; read: number } | null } | null;
  requests: { open: number; approved: number; rejected: number; withdrawn: number } | null;
  hod: { waiting: number; scheduled: number; rejected: number; cancelled: number } | null;
  businessUnits: { name: string; people: number; signedIn: number }[];
};

/** A part that may fail (a table not there yet): null instead of an error. */
const quiet = <T,>(promise: PromiseLike<T>): Promise<T | null> => Promise.resolve(promise).then(value => value, () => null);
/** The rows of a query that worked, else null. */
const rowsOf = <R,>(result: { data: R[] | null; error: unknown } | null): R[] | null => (result && !result.error ? result.data ?? [] : null);
const tally = <K extends string>(rows: { status: string }[], keys: readonly K[]) =>
  Object.fromEntries(keys.map(key => [key, rows.filter(row => row.status === key).length])) as Record<K, number>;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

export async function bodInsights(viewer: Member, now = new Date()): Promise<BodInsights> {
  const today = wibDate(now.toISOString());
  const days = officeDaysAround(today);
  const client = createPrivilegedClient();
  const [{ sessions }, people, phase, schedule, attendance, accounts, documents, announcements, requests, hod, bu] = await Promise.all([
    listSessions(viewer), listPeople(), quiet(currentPhase(today)),
    quiet(weekSchedule(days, viewer)),
    quiet(client.from("pw_attendance").select("method").limit(20000)),
    quiet(client.from("pw_accounts").select("employee_id,last_login_at,active")),
    quiet(listDocuments(viewer)),
    quiet(client.from("pw_announcements").select("id,title,created_at").eq("kind", "pengumuman").order("created_at", { ascending: false }).limit(200)),
    quiet(client.from("pw_schedule_requests").select("status").limit(5000)),
    quiet(client.from("pw_hod_meetings").select("status").limit(5000)),
    quiet(client.from("employees").select("id,business_unit").eq("active", true).limit(2000)),
  ]);
  const { groups } = await departmentGroups(people);

  // Accounts: who signed in at all, and who in the last seven days.
  const activeAccounts = (rowsOf(accounts) ?? []).filter(account => account.active);
  const accountOf = new Map(activeAccounts.map(account => [account.employee_id as string, { signedIn: !!account.last_login_at }]));
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const signedInWeek = activeAccounts.filter(account => account.last_login_at && Date.parse(account.last_login_at) >= weekAgo).length;

  // Business units from Data karyawan's BU column (6 Nov 2026); none before that column exists.
  const buRows = (rowsOf(bu) ?? []) as { id: string; business_unit: string | null }[];
  const buNames = [...new Set(buRows.map(row => (row.business_unit ?? "").trim()).filter(Boolean))];
  const businessUnits = buNames.map(name => {
    const ids = buRows.filter(row => (row.business_unit ?? "").trim() === name).map(row => row.id);
    return { name, people: ids.length, signedIn: ids.filter(id => accountOf.get(id)?.signedIn).length };
  }).sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));

  // Announcements: how many were sent, and how many of their receipts are read.
  let announcementSummary: BodInsights["announcements"] = null;
  const sent = rowsOf(announcements);
  if (sent) {
    const receipts = sent.length ? rowsOf(await quiet(client.from("pw_notification_receipts").select("announcement_id,read_at").in("announcement_id", sent.map(row => row.id)))) ?? [] : [];
    const latest = sent[0];
    const latestRows = latest ? receipts.filter(row => row.announcement_id === latest.id) : [];
    announcementSummary = {
      sent: sent.length, recipients: receipts.length, read: receipts.filter(row => row.read_at).length,
      latest: latest ? { title: latest.title, at: latest.created_at, recipients: latestRows.length, read: latestRows.filter(row => row.read_at).length } : null,
    };
  }

  // What is next: published sessions of the panitia (bookings are people's own meetings), soonest first.
  const upcoming = sessions
    .filter(session => session.status === "terbit" && !session.booking && session.startsAt && session.endsAt && new Date(session.endsAt) > now)
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!)).slice(0, 5)
    .map(session => ({ id: session.id, title: session.title, kind: session.kind, startsAt: session.startsAt!, endsAt: session.endsAt!, where: session.roomName || session.location || "", participants: session.participantCount }));

  const requestRows = rowsOf(requests) as { status: string }[] | null;
  const hodRows = rowsOf(hod) as { status: string }[] | null;
  const requestCount = requestRows && tally(requestRows, ["diajukan", "disetujui", "ditolak", "ditarik"] as const);
  const hodCount = hodRows && tally(hodRows, ["menunggu", "terjadwal", "ditolak", "batal"] as const);
  const attendanceRows = rowsOf(attendance) as { method: string | null }[] | null;

  return {
    today,
    phase: phase ? {
      name: phase.name, startDate: phase.startDate, endDate: phase.endDate, daysToWam: phase.daysToWam,
      day: today >= phase.startDate && today <= phase.endDate ? dayNumber(today) - dayNumber(phase.startDate) + 1 : null,
      days: dayNumber(phase.endDate) - dayNumber(phase.startDate) + 1,
    } : null,
    sessions: sessionKinds.map(kind => {
      const own = sessions.filter(session => session.kind === kind && !session.booking);
      return { kind, published: own.filter(session => session.status === "terbit").length, drafts: own.filter(session => session.status === "draf").length, cancelled: own.filter(session => session.status === "batal").length };
    }),
    upcoming,
    rooms: schedule ? roomUse(schedule.bookings, schedule.rooms, days, wibDate, OUTSIDE_ROOM) : null,
    checkIns: attendanceRows ? checkInMix(attendanceRows.map(row => row.method)) : null,
    adoption: adoptionBy(groups, accountOf),
    signedInWeek,
    documents: documents?.migrated ? {
      total: documents.documents.length,
      general: documents.documents.filter(doc => !doc.sessionId).length,
      perSession: documents.documents.filter(doc => doc.sessionId).length,
      recent: documents.documents.slice(0, 4).map(doc => ({ id: doc.id, title: doc.title, by: doc.uploadedBy, at: doc.createdAt, session: doc.sessionTitle })),
    } : null,
    announcements: announcementSummary,
    requests: requestCount ? { open: requestCount.diajukan, approved: requestCount.disetujui, rejected: requestCount.ditolak, withdrawn: requestCount.ditarik } : null,
    hod: hodCount ? { waiting: hodCount.menunggu, scheduled: hodCount.terjadwal, rejected: hodCount.ditolak, cancelled: hodCount.batal } : null,
    businessUnits,
  };
}
