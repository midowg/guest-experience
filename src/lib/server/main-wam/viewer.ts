import "server-only";
import { cache } from "react";
import { isTester } from "@/lib/main-wam/access";
import type { MainWamViewer, ViewerGroup, ViewerRoom } from "@/lib/main-wam/types";
import { callName } from "@/lib/pra-wam/call-name";
import { createPrivilegedClient } from "../supabase/admin";
import { currentMember, type Member } from "../pra-wam/session";
import { currentForm } from "../pra-wam/questionnaire";
import { mainWamPeople } from "./people";
import { readMainWamSettings, testerIds } from "./settings";

/*
 * The signed-in person as Main WAM sees them: who (nama panggilan for colleagues, full name for
 * Profil), roles, whether they test Main WAM, their kelompok (once published) and their room (once
 * HR publishes the pairing). Read once per request. Every part fails soft: a missing migration or a
 * hiccup leaves that part null, never the page.
 */

/** The person's kelompok, once the kelompok are published. */
export async function groupOf(employeeId: string): Promise<ViewerGroup | null> {
  const settings = await readMainWamSettings();
  if (!settings.groupsPublished) return null;
  const client = createPrivilegedClient();
  const { data: mine, error } = await client.from("mw_group_members").select("group_id,coordinator,mw_groups(id,number,name)").eq("employee_id", employeeId).maybeSingle();
  if (error || !mine) return null;
  const group = mine.mw_groups as unknown as { id: string; number: number; name: string } | null;
  if (!group) return null;
  const { count } = await client.from("mw_group_members").select("employee_id", { count: "exact", head: true }).eq("group_id", group.id);
  return { id: group.id, number: group.number, name: group.name, coordinator: mine.coordinator === true, size: count ?? 0 };
}

/**
 * The person's room from HR's pairing (cq_stay_rooms of the current questionnaire), once HR has
 * published it, with everyone in it (any number) and the floor Main WAM adds.
 */
export async function roomOf(employeeId: string): Promise<ViewerRoom | null> {
  try {
    const form = await currentForm();
    if (!form || form.status === "draf") return null;
    const client = createPrivilegedClient();
    const published = await client.from("cq_forms").select("rooms_published_at").eq("id", form.id).maybeSingle();
    if (published.error || !(published.data as { rooms_published_at: string | null } | null)?.rooms_published_at) return null;
    const mine = await client.from("cq_stay_members").select("room_id").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle();
    const roomId = (mine.data as { room_id: string } | null)?.room_id;
    if (mine.error || !roomId) return null;
    const [room, members, details, people] = await Promise.all([
      client.from("cq_stay_rooms").select("id,name,kind").eq("id", roomId).maybeSingle(),
      client.from("cq_stay_members").select("employee_id").eq("form_id", form.id).eq("room_id", roomId),
      client.from("mw_stay_room_details").select("floor,note").eq("room_id", roomId).maybeSingle(),
      mainWamPeople(),
    ]);
    if (room.error || members.error || !room.data) return null;
    const detail = details.error ? null : (details.data as { floor: string; note: string } | null);
    const roomPeople = ((members.data ?? []) as { employee_id: string }[])
      .map(row => people.get(row.employee_id)).filter(person => !!person)
      .map(person => ({ id: person!.id, name: person!.name, department: person!.department, me: person!.id === employeeId }))
      // The person first ("Rani (kamu)"), then by name.
      .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name, "id"));
    const { id, name, kind } = room.data as { id: string; name: string; kind: string };
    return { id, name, kind, floor: detail?.floor ?? "", note: detail?.note ?? "", people: roomPeople };
  } catch { return null; }
}

/** Main WAM's view of a WAM member (the session is WAM's: same cookie, same checks). */
export async function viewerOf(member: Member): Promise<MainWamViewer> {
  const [listed, group, room] = await Promise.all([
    testerIds().then(ids => ids.has(member.id)).catch(() => false),
    groupOf(member.id).catch(() => null),
    roomOf(member.id),
  ]);
  return {
    id: member.id,
    name: callName({ fullName: member.name, nickname: member.nickname }),
    fullName: member.name,
    department: member.department,
    photo: member.photo,
    roles: member.roles,
    tester: isTester(member, listed),
    group, room,
  };
}

/** The signed-in person in Main WAM, or null (nobody signed in). Does not check the gate: see gate.ts. */
export const mainWamViewer = cache(async (): Promise<MainWamViewer | null> => {
  const member = await currentMember();
  return member ? viewerOf(member) : null;
});

/** Whether this member tests Main WAM (panitia, admin, or on the list); light, without kelompok or room. */
export async function testsMainWam(member: Member): Promise<boolean> {
  return isTester(member, (await testerIds()).has(member.id));
}
