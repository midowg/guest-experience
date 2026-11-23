import "server-only";
import { createPrivilegedClient } from "../supabase/admin";
import { MISSION_SETTING_KEY, type Mate, type MissionRole, type MissionView } from "@/lib/pra-wam/mission";
import { hodStanding } from "./hod";
import type { Member } from "./session";

/*
 * Misi Perjalanan (prototype, 23 Nov 2026): who may open it and what they receive. The room list,
 * the questionnaire hints and the sleeping hours are in pw_settings ('mission_journey', written by
 * hand from the panitia's sheet), never in the code: the repository is public. A person receives
 * their own room only.
 */

type SheetPerson = { name: string; nick: string; dept: string; room: string; sleep: string | null; wake: string | null; sents: number[]; hints: string[] };
type Sheet = { rooms: Record<string, string>; people: SheetPerson[]; bod: { name: string; sents: number[]; ceo?: boolean }[] };

const key = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

async function readSheet(): Promise<Sheet | null> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("value").eq("key", MISSION_SETTING_KEY).maybeSingle();
  if (error || !data?.value) return null;
  const value = data.value as Partial<Sheet>;
  return { rooms: value.rooms ?? {}, people: value.people ?? [], bod: value.bod ?? [] };
}

const isCos = (member: Pick<Member, "position">) => /chief of staff/i.test(member.position ?? "");

/** This person's Misi Perjalanan, or null when it is not for them (only HoD, BoD and CoS). */
export async function missionFor(member: Member): Promise<MissionView | null> {
  const sheet = await readSheet().catch(() => null);
  if (!sheet) return null;
  const me = key(member.name);
  const person = sheet.people.find(item => key(item.name) === me) ?? null;
  const bod = sheet.bod.find(item => key(item.name) === me) ?? null;
  const isBod = !!bod || member.roles.includes("bod");
  const cos = isCos(member);
  const hod = person ? true : await hodStanding(member).then(standing => standing.isHod).catch(() => false);
  if (!person && !isBod && !cos && !hod) return null;
  const role: MissionRole = cos ? "CoS" : isBod ? "BoD" : "HoD";
  const nick = person?.nick || member.nickname || member.name.split(" ")[0];
  const room = person && sheet.rooms[person.room] ? {
    code: sheet.rooms[person.room],
    mates: sheet.people.filter(item => item.room === person.room && key(item.name) !== me)
      .map((item): Mate => ({ name: item.name, nick: item.nick, dept: item.dept, hints: item.hints.slice(0, 3), sleep: item.sleep, wake: item.wake })),
    self: { sleep: person.sleep, wake: person.wake },
    // Names only, to guess from: never anyone's room.
    others: sheet.people.filter(item => key(item.name) !== me).map(item => ({ id: key(item.name), name: item.name })),
  } : null;
  return { employeeId: member.id, nick, role, ceo: !!bod?.ceo, sentences: person?.sents ?? bod?.sents ?? [], room };
}
