import "server-only";
import { wibDate, wibInstant } from "@/lib/pra-wam/appraisal";
import type { Session } from "@/lib/pra-wam/sessions";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";
import { openRequestCount } from "./requests";
import type { Member } from "./session";
import { listSessions } from "./sessions";

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
