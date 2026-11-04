import "server-only";
import { wibDate, wibInstant } from "@/lib/pra-wam/appraisal";
import { accountState, activeForum, attentionItems, forumMark, lowAttendance, type AccountState, type AttentionItem, type ForumAttendance, type ForumMark } from "@/lib/pra-wam/bod";
import type { PraWamRole } from "@/lib/pra-wam/roles";
import type { Session } from "@/lib/pra-wam/sessions";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { currentPhase } from "./events";
import { openRequestCount } from "./requests";
import { rolesOf, type Member } from "./session";
import { listSessions } from "./sessions";
import { listUnits, unitsOf } from "./units";

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
 * BOD (Penpot "B1", "B2", "E3"): read only. Attendance comes from pw_attendance (migration
 * 202611040005); where that table is missing, `attendanceReady` is false and the pages say so
 * instead of showing everyone as absent.
 */

export type UnitAttendance = { id: string; name: string; businessUnits: string[]; present: number; expected: number; leads: string[]; members: number };
export type BodSummary = {
  migrated: boolean; attendanceReady: boolean;
  people: number; departments: number; businessUnits: number;
  active: ForumAttendance | null;
  accounts: number; signedIn: number;
  published: number; drafts: number; openRequests: number;
  forums: ForumAttendance[]; units: UnitAttendance[];
  attention: AttentionItem[];
};

const attendanceMissing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_attendance/.test(error.message ?? "");

/** Who checked in to these sessions, by session; `ready: false` before migration 202611040005. */
async function presentBySession(sessionIds: string[], employeeId?: string): Promise<{ ready: boolean; present: Map<string, Set<string>> }> {
  const present = new Map<string, Set<string>>();
  if (!sessionIds.length) return { ready: true, present };
  let query = createPrivilegedClient().from("pw_attendance").select("session_id,employee_id").in("session_id", sessionIds);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) { if (attendanceMissing(error)) return { ready: false, present }; databaseError(error); }
  for (const row of data ?? []) present.set(row.session_id, (present.get(row.session_id) ?? new Set()).add(row.employee_id));
  return { ready: true, present };
}

/** Published sessions that have started (the check-in opens 30 minutes before), oldest first. */
const startedSessions = (sessions: Session[], now: Date) => sessions
  .filter(session => session.status === "terbit" && session.startsAt && session.endsAt && new Date(session.startsAt).getTime() - 30 * 60_000 <= now.getTime())
  .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

type People = Awaited<ReturnType<typeof listPeople>>;
type Group = { id: string; name: string; businessUnits: string[]; members: string[]; leads: string[] };

/** Departments with their people: units when imported, else the department column of Data karyawan. */
async function departmentGroups(people: People): Promise<{ groups: Group[]; businessUnits: number; unitsMigrated: boolean }> {
  const units = await listUnits();
  const active = people.filter(person => person.active);
  const firstName = (id: string) => people.find(person => person.id === id)?.name.split(" ")[0] ?? "";
  const bus = units.units.filter(unit => unit.kind === "bu");
  const departments = units.units.filter(unit => unit.kind === "departemen");
  const groups = departments.length
    ? departments.map(unit => {
      const members = units.memberships.filter(member => member.unitId === unit.id);
      const ids = new Set(members.map(member => member.employeeId));
      const businessUnits = bus.filter(bu => units.memberships.some(member => member.unitId === bu.id && ids.has(member.employeeId))).map(bu => bu.code || bu.name);
      return { id: unit.id, name: unit.name, businessUnits, members: [...ids], leads: members.filter(member => member.isLead).map(member => firstName(member.employeeId)).filter(Boolean) };
    })
    : [...new Set(active.map(person => person.department).filter(Boolean))].map(name => ({
      id: name, name, businessUnits: [], members: active.filter(person => person.department === name).map(person => person.id), leads: [],
    }));
  return { groups, businessUnits: bus.length, unitsMigrated: units.migrated };
}

export async function bodSummary(viewer: Member, now = new Date()): Promise<BodSummary> {
  const today = wibDate(now.toISOString());
  const [{ sessions, migrated }, people, { data: accounts }, openRequests, phase] = await Promise.all([
    listSessions(viewer), listPeople(),
    createPrivilegedClient().from("pw_accounts").select("employee_id,last_login_at,active"),
    openRequestCount(), currentPhase(today).catch(() => null),
  ]);
  const active = people.filter(person => person.active);
  const published = sessions.filter(session => session.status === "terbit");
  const started = startedSessions(sessions, now);
  const [{ ready, present }, { groups, businessUnits }] = await Promise.all([presentBySession(started.map(session => session.id)), departmentGroups(people)]);
  const forums: ForumAttendance[] = started.map(session => ({
    id: session.id, title: session.title, present: present.get(session.id)?.size ?? 0, expected: session.participantCount, startsAt: session.startsAt!,
    live: new Date(session.startsAt!) <= now && new Date(session.endsAt!) > now,
  }));

  const units = groups.map(group => {
    const members = new Set(group.members);
    let presentCount = 0, expected = 0;
    for (const session of started) {
      const invited = (session.participants ?? []).filter(person => members.has(person.id));
      expected += invited.length;
      presentCount += invited.filter(person => present.get(session.id)?.has(person.id)).length;
    }
    return { id: group.id, name: group.name, businessUnits: group.businessUnits, present: presentCount, expected, leads: group.leads, members: members.size };
  }).sort((a, b) => b.expected - a.expected || b.members - a.members || a.name.localeCompare(b.name));

  const activeAccounts = (accounts ?? []).filter(account => account.active);
  const signedIn = activeAccounts.filter(account => account.last_login_at).length;
  const drafts = sessions.filter(session => session.status === "draf").length;
  return {
    migrated, attendanceReady: ready,
    people: active.length, departments: groups.length, businessUnits,
    active: activeForum(forums),
    accounts: activeAccounts.length, signedIn,
    published: published.length, drafts, openRequests,
    forums, units,
    attention: attentionItems({
      lowUnits: ready ? units.filter(lowAttendance).map(unit => unit.name) : [],
      openRequests, drafts, notSignedIn: activeAccounts.length - signedIn,
      deadline: phase?.kind === "pra_wam" ? phase.endDate : null, today,
    }),
  };
}

/* Peserta (BOD): everyone, by department, with their account state. */

export type PersonRow = { id: string; name: string; jobTitle: string; isLead: boolean; account: AccountState };
export type PeopleGroup = { id: string; name: string; businessUnits: string[]; leads: string[]; people: PersonRow[] };

export async function bodPeople(): Promise<{ groups: PeopleGroup[]; total: number; unitsMigrated: boolean }> {
  const [people, units, { data: accounts }] = await Promise.all([
    listPeople(), listUnits(),
    createPrivilegedClient().from("pw_accounts").select("employee_id,last_login_at,active"),
  ]);
  const { groups, unitsMigrated } = await departmentGroups(people);
  const accountOf = new Map((accounts ?? []).map(account => [account.employee_id, { active: account.active, lastLoginAt: account.last_login_at }]));
  const state = (id: string) => accountState(accountOf.get(id) ?? null);
  const byId = new Map(people.filter(person => person.active).map(person => [person.id, person]));
  const placed = new Set<string>();
  const result: PeopleGroup[] = groups.map(group => ({
    id: group.id, name: group.name, businessUnits: group.businessUnits, leads: group.leads,
    people: group.members.flatMap(id => {
      const person = byId.get(id);
      if (!person) return [];
      placed.add(id);
      const member = units.memberships.find(item => item.employeeId === id && item.unitId === group.id);
      return [{ id, name: person.name, jobTitle: member?.jobTitle ?? "", isLead: member?.isLead ?? false, account: state(id) }];
    }).sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name)),
  })).filter(group => group.people.length);
  // Someone in Data karyawan but in no imported department still belongs on the list.
  const rest = [...byId.values()].filter(person => !placed.has(person.id));
  if (rest.length) result.push({
    id: "lainnya", name: "Tanpa departemen", businessUnits: [], leads: [],
    people: rest.map(person => ({ id: person.id, name: person.name, jobTitle: "", isLead: false, account: state(person.id) })),
  });
  return { groups: result, total: byId.size, unitsMigrated };
}

/* Profil peserta (BOD, Penpot "B2"). */

export type ProfileForum = { id: string; title: string; mark: ForumMark };
export type BodProfile = {
  id: string; name: string; department: string; position: string; roles: PraWamRole[];
  account: AccountState;
  units: { name: string; kind: "departemen" | "bu"; jobTitle: string; isLead: boolean }[];
  attendanceReady: boolean; forums: ProfileForum[]; upcoming: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bodProfile(viewer: Member, employeeId: string, now = new Date()): Promise<BodProfile | null> {
  if (!UUID.test(employeeId)) return null;
  const client = createPrivilegedClient();
  const { data: person, error } = await client.from("employees").select("id,full_name,department,position").eq("id", employeeId).maybeSingle();
  if (error) databaseError(error);
  if (!person) return null;
  const [{ data: account }, roles, units, { sessions }] = await Promise.all([
    client.from("pw_accounts").select("last_login_at,active").eq("employee_id", employeeId).maybeSingle(),
    rolesOf(employeeId), unitsOf(employeeId), listSessions(viewer),
  ]);
  const theirs = sessions.filter(session => session.status === "terbit" && (session.participants ?? []).some(participant => participant.id === employeeId));
  const started = startedSessions(theirs, now);
  const { ready, present } = await presentBySession(started.map(session => session.id), employeeId);
  return {
    id: person.id, name: person.full_name, department: person.department ?? "", position: person.position ?? "", roles,
    account: accountState(account ? { active: account.active, lastLoginAt: account.last_login_at } : null),
    units: units.map(unit => ({ name: unit.kind === "bu" && unit.code ? unit.code : unit.name, kind: unit.kind, jobTitle: unit.jobTitle, isLead: unit.isLead })),
    attendanceReady: ready,
    forums: started.map(session => ({ id: session.id, title: session.title, mark: forumMark(present.get(session.id)?.has(employeeId) ?? false, session.endsAt!, now) })),
    upcoming: theirs.length - started.length,
  };
}
