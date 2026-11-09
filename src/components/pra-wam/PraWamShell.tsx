import type { ReactNode } from "react";
import { managesSessions } from "@/lib/pra-wam/roles";
import { unreadCount } from "@/lib/server/pra-wam/announcements";
import { openRequestCount } from "@/lib/server/pra-wam/requests";
import { currentPhase } from "@/lib/server/pra-wam/events";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { WamFrame, type FrameMember } from "./WamFrame";

export type { Tab } from "@/lib/pra-wam/screen";
export { manageGroups } from "./WamFrame";

const month = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * The frame of every signed-in WAM page (WamFrame), with what it needs from the server: the unread
 * notifications, the requests waiting and the phase. Drawn once by the shared layout
 * (src/app/wam/(app)/layout.tsx), not by each page: moving between screens keeps it in place and
 * only the screen under it loads. Saving anything refreshes the route, and with it these counts.
 */
export async function PraWamShell({ member, children }: { member: FrameMember; children: ReactNode }) {
  const now = new Date();
  const [unread, waiting, phase] = await Promise.all([
    unreadCount(member.id), managesSessions(member) ? openRequestCount() : 0,
    currentPhase(wibDate(now.toISOString())).catch(() => null),
  ]);
  const phaseLabel = phase ? `${phase.kind === "pra_wam" ? "Pra WAM" : phase.name} · ${month(phase.startDate)}–${month(phase.endDate)} ${phase.endDate.slice(0, 4)}` : "WAM 2027";
  const frameMember: FrameMember = { id: member.id, name: member.name, nickname: member.nickname, department: member.department, roles: member.roles, photo: member.photo ?? null };
  return <WamFrame member={frameMember} unread={unread} waiting={waiting} phaseLabel={phaseLabel}>
    {children}
  </WamFrame>;
}

export { BackRow, ScreenHead } from "./ScreenHead";
