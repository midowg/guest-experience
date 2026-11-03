import "server-only";
import { wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { participantGroups } from "@/lib/pra-wam/units";
import type { Session, SessionInput } from "@/lib/pra-wam/sessions";
import { listPeople, listRooms } from "./appraisal";
import { listUnits } from "./units";

/** What the session form needs: rooms, active people, unit chips, and the starting values. */
export async function sessionFormData(session: Session | null, viewerId: string) {
  const [rooms, people, units] = await Promise.all([listRooms(), listPeople(), listUnits()]);
  const active = people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }));
  const initial: SessionInput = session
    ? { title: session.title, kind: session.kind, description: session.description, date: session.startsAt ? wibDate(session.startsAt) : session.planFrom ?? "",
      start: session.startsAt ? wibTime(session.startsAt) : "", end: session.endsAt ? wibTime(session.endsAt) : "", roomId: session.roomId ?? "", location: session.location,
      participants: (session.participants ?? []).map(person => person.id) }
    : { title: "", kind: "forum", description: "", date: "", start: "", end: "", roomId: "", location: "", participants: [] };
  // A date from the calendar range alone is a hint, not a set time.
  if (session && !session.startsAt) initial.date = "";
  return { rooms, people: active, groups: participantGroups(active, viewerId, units.units, units.memberships), initial };
}
