import "server-only";
import { wibDate, wibInstant } from "@/lib/pra-wam/appraisal";
import type { Session } from "@/lib/pra-wam/sessions";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { openRequestCount } from "./requests";
import type { Member } from "./session";
import { listSessions } from "./sessions";
import { listUnits } from "./units";

/*
 * Ringkasan operasional for panitia and BOD (Penpot "D1"): counts, the published sessions from
 * today on with how many have checked in, and the drafts still waiting for a time.
 */

export type SessionReadiness = Session & { present: number };
export type Overview = {
  migrated: boolean;
  people: number; published: number; drafts: number; openRequests: number;
  todayPresent: number; todayExpected: number;
  upcoming: SessionReadiness[]; waiting: Session[];
};

export async function overview(viewer: Member, now = new Date()): Promise<Overview> {
  const today = wibDate(now.toISOString());
  const [{ sessions, migrated }, people, openRequests] = await Promise.all([listSessions(viewer), listPeople(), openRequestCount()]);
  const published = sessions.filter(session => session.status === "terbit");
  const upcoming = published.filter(session => session.endsAt && session.startsAt && new Date(session.endsAt) >= new Date(wibInstant(today, "00:00")));
  const counts = new Map<string, number>();
  if (upcoming.length) {
    const { data } = await createPrivilegedClient().from("pw_attendance").select("session_id").in("session_id", upcoming.map(session => session.id));
    for (const row of data ?? []) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
  }
  const withPresent = upcoming.map(session => ({ ...session, present: counts.get(session.id) ?? 0 }));
  const todays = withPresent.filter(session => session.startsAt && wibDate(session.startsAt) === today);
  const waiting = sessions.filter(session => session.status === "draf")
    .sort((a, b) => (a.planFrom ?? "9999").localeCompare(b.planFrom ?? "9999"));
  return {
    migrated, people: people.filter(person => person.active).length, published: published.length, drafts: waiting.length, openRequests,
    todayPresent: todays.reduce((sum, session) => sum + session.present, 0), todayExpected: todays.reduce((sum, session) => sum + session.participantCount, 0),
    upcoming: withPresent.slice(0, 10), waiting: waiting.slice(0, 6),
  };
}

/*
 * Ringkasan Pra WAM for BOD (Penpot "E3"): read only. Counts people, units and sign-ins, and for
 * the published sessions that have started: attendance per forum and per department.
 */

export type ForumAttendance = { id: string; title: string; present: number; expected: number; live: boolean };
export type UnitAttendance = { id: string; name: string; present: number; expected: number; leads: string[] };
export type BodSummary = {
  migrated: boolean;
  people: number; departments: number; businessUnits: number;
  present: number; expected: number;
  accounts: number; signedIn: number;
  published: number; drafts: number;
  forums: ForumAttendance[]; units: UnitAttendance[];
};

export async function bodSummary(viewer: Member, now = new Date()): Promise<BodSummary> {
  const client = createPrivilegedClient();
  const [{ sessions, migrated }, people, units, { data: accounts }] = await Promise.all([
    listSessions(viewer), listPeople(), listUnits(),
    client.from("pw_accounts").select("employee_id,last_login_at,active"),
  ]);
  const active = people.filter(person => person.active);
  const published = sessions.filter(session => session.status === "terbit");
  // Only sessions that have started count towards attendance; a later forum is not "absent" yet.
  const started = published.filter(session => session.startsAt && session.endsAt && new Date(session.startsAt).getTime() - 30 * 60_000 <= now.getTime())
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const presentBy = new Map<string, Set<string>>();
  if (started.length) {
    const { data } = await client.from("pw_attendance").select("session_id,employee_id").in("session_id", started.map(session => session.id));
    for (const row of data ?? []) presentBy.set(row.session_id, (presentBy.get(row.session_id) ?? new Set()).add(row.employee_id));
  }
  const forums = started.map(session => ({
    id: session.id, title: session.title, present: presentBy.get(session.id)?.size ?? 0, expected: session.participantCount,
    live: new Date(session.startsAt!) <= now && new Date(session.endsAt!) > now,
  }));

  // Per department: units when imported, else the department column of Data karyawan.
  const departments = units.units.filter(unit => unit.kind === "departemen");
  const groups: { id: string; name: string; members: Set<string>; leads: string[] }[] = departments.length
    ? departments.map(unit => {
      const members = units.memberships.filter(member => member.unitId === unit.id);
      return {
        id: unit.id, name: unit.name, members: new Set(members.map(member => member.employeeId)),
        leads: members.filter(member => member.isLead).map(member => people.find(person => person.id === member.employeeId)?.name.split(" ")[0] ?? "").filter(Boolean),
      };
    })
    : [...new Set(active.map(person => person.department).filter(Boolean))].map(name => ({ id: name, name, members: new Set(active.filter(person => person.department === name).map(person => person.id)), leads: [] }));
  const unitRows = groups.map(group => {
    let present = 0, expected = 0;
    for (const session of started) {
      const invited = (session.participants ?? []).filter(person => group.members.has(person.id));
      expected += invited.length;
      present += invited.filter(person => presentBy.get(session.id)?.has(person.id)).length;
    }
    return { id: group.id, name: group.name, present, expected, leads: group.leads };
  }).filter(row => row.expected > 0 || row.leads.length > 0).sort((a, b) => b.expected - a.expected || a.name.localeCompare(b.name));

  return {
    migrated, people: active.length,
    departments: departments.length || groups.length, businessUnits: units.units.filter(unit => unit.kind === "bu").length,
    present: forums.reduce((sum, forum) => sum + forum.present, 0), expected: forums.reduce((sum, forum) => sum + forum.expected, 0),
    accounts: (accounts ?? []).filter(account => account.active).length, signedIn: (accounts ?? []).filter(account => account.active && account.last_login_at).length,
    published: published.length, drafts: sessions.filter(session => session.status === "draf").length,
    forums, units: unitRows,
  };
}
