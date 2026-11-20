import type { ReactNode } from "react";
import { HrFrame } from "@/components/hr/HrFrame";
import { ViewerZoneProvider } from "@/components/pra-wam/ViewerZone";
import { managesHr } from "@/lib/pra-wam/roles";
import { currentMember } from "@/lib/server/pra-wam/session";
import { viewerZoneSetting } from "@/lib/server/pra-wam/zone";

/**
 * Every HR Werkudara page shares one frame. The pages check the sign-in themselves (requireHrPage
 * sends a stranger to HR's own sign-in and back); with no one signed in there is no frame to draw.
 * Times read in the viewer's own zone (WIB, WITA, WIT), like WAM.
 */
export default async function HrAppLayout({ children }: { children: ReactNode }) {
  const [member, zone] = await Promise.all([currentMember(), viewerZoneSetting()]);
  if (!member) return children;
  return <ViewerZoneProvider zone={zone.zone} manual={zone.manual}>
    <HrFrame name={member.nickname || member.name} canManage={managesHr(member)}>{children}</HrFrame>
  </ViewerZoneProvider>;
}
