import "server-only";
import { cache } from "react";
import { isTester, mainWamRolesOf } from "@/lib/main-wam/access";
import { demoViewer } from "@/lib/main-wam/demo";
import type { MainWamSettings, MainWamViewer, ViewerGroup, ViewerRoom } from "@/lib/main-wam/types";
import { callName } from "@/lib/pra-wam/call-name";
import { createPrivilegedClient } from "../supabase/admin";
import { currentMember, type Member } from "../pra-wam/session";
import { currentForm } from "../pra-wam/questionnaire";
import { demoPlaceFor, readDemoRole } from "./demo";
import { mainWamPeople } from "./people";
import { readMainWamSettings, testerIds } from "./settings";
import { wamStaffIds } from "./staff";

/*
 * The signed-in person as Main WAM sees them: who (nama panggilan for colleagues, full name for
 * Profil), Main WAM's roles (BOD from the account, panitia from Panitia WAM; 20 Nov 2026, never Pra
 * WAM's committee or admin role), whether they test Main WAM, and their kelompok (once published). This is what
 * the gate reads on every page, API and prefetch, so it stays light (audit S5): the room (HR's
 * pairing) is read only by the screens that show it (viewerRoom). Read once per request. Every part
 * fails soft: a missing migration or a hiccup leaves that part null, never the page.
 */

type GroupRow = { coordinator: boolean | null; mw_groups: { id: string; number: number; name: string; mw_group_members?: { count: number }[] } | null };

/**
 * The person's kelompok, once the kelompok are published: one query (the kelompok and its size
 * together). `settings`: the gate's own read, so a route handler (where cache() does not memoize)
 * does not read the settings twice.
 */
export async function groupOf(employeeId: string, settings: Promise<MainWamSettings> = readMainWamSettings()): Promise<ViewerGroup | null> {
  const client = createPrivilegedClient();
  const [{ groupsPublished }, mine] = await Promise.all([
    settings,
    client.from("mw_group_members").select("coordinator,mw_groups(id,number,name,mw_group_members(count))").eq("employee_id", employeeId).maybeSingle(),
  ]);
  if (!groupsPublished || mine.error || !mine.data) return null;
  const row = mine.data as unknown as GroupRow;
  const group = Array.isArray(row.mw_groups) ? row.mw_groups[0] ?? null : row.mw_groups;
  if (!group) return null;
  let size = group.mw_group_members?.[0]?.count;
  if (typeof size !== "number") {
    // Without the embedded count (an older PostgREST): count apart.
    const { count } = await client.from("mw_group_members").select("employee_id", { count: "exact", head: true }).eq("group_id", group.id);
    size = count ?? 0;
  }
  return { id: group.id, number: group.number, name: group.name, coordinator: row.coordinator === true, size };
}

/**
 * The person's room from HR's pairing (cq_stay_rooms of the current questionnaire), once HR has
 * published it, with everyone in it (any number) and the floor Main WAM adds.
 */
async function roomOf(employeeId: string): Promise<ViewerRoom | null> {
  try {
    const form = await currentForm();
    if (!form || form.status === "draf") return null;
    const client = createPrivilegedClient();
    const [published, mine] = await Promise.all([
      client.from("cq_forms").select("rooms_published_at").eq("id", form.id).maybeSingle(),
      client.from("cq_stay_members").select("room_id").eq("form_id", form.id).eq("employee_id", employeeId).maybeSingle(),
    ]);
    if (published.error || !(published.data as { rooms_published_at: string | null } | null)?.rooms_published_at) return null;
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

/** The person's room (null before HR publishes it), once per request: for Saya, Kelompok & kamar, Perjalanan. */
export const viewerRoom = cache(roomOf);

/** Main WAM's view of a WAM member (the session is WAM's: same cookie, same checks); `room` is left null. */
export async function viewerOf(member: Member, listed: Promise<Set<string>> = testerIds(), settings: Promise<MainWamSettings> = readMainWamSettings(), staff: Promise<Set<string>> = wamStaffIds()): Promise<MainWamViewer> {
  const [onList, onStaff, group, read] = await Promise.all([
    listed.then(ids => ids.has(member.id)).catch(() => false),
    staff.then(ids => ids.has(member.id)).catch(() => false),
    groupOf(member.id, settings).catch(() => null),
    settings.catch(() => null),
  ]);
  const roles = mainWamRolesOf(member.roles, onStaff);
  const base: MainWamViewer = {
    id: member.id,
    name: callName({ fullName: member.name, nickname: member.nickname }),
    fullName: member.name,
    department: member.department,
    position: member.position,
    photo: member.photo,
    roles,
    tester: isTester({ roles }, onList),
    group, room: null,
  };
  if (!read?.moduleConfig.demo) return base;
  // Mode demo: a penguji may be drawn as another role (the cookie from "Lihat sebagai"); everyone gets a
  // sample group while they have none. Their account's real roles stay in `demo.realRoles`, which the gate and the writers go by.
  const shown = demoViewer({ roles: base.roles, tester: base.tester }, base.tester ? await readDemoRole() : null);
  const drawn = { ...base, roles: shown.roles, demo: shown.demo };
  return { ...drawn, group: base.group ?? demoPlaceFor(drawn).group };
}

/**
 * The signed-in person in Main WAM, or null (nobody signed in). Does not check the gate: see gate.ts.
 * Pass the request's settings read (readMainWamSettings()) when there is one: the same promise in a
 * page (cached), and one read less in a route handler.
 */
export const mainWamViewer = cache(async (settings?: Promise<MainWamSettings>): Promise<MainWamViewer | null> => {
  // The penguji list and Panitia WAM do not depend on who it is: read them alongside the session.
  const listed = testerIds().catch(() => new Set<string>());
  const staff = wamStaffIds();
  const member = await currentMember();
  return member ? viewerOf(member, listed, settings, staff) : null;
});

/** Whether this member tests Main WAM (Panitia WAM, or on the list); light, without kelompok or room. */
export async function testsMainWam(member: Member): Promise<boolean> {
  const [listed, staff] = await Promise.all([testerIds(), wamStaffIds()]);
  return isTester({ roles: mainWamRolesOf(member.roles, staff.has(member.id)) }, listed.has(member.id));
}
