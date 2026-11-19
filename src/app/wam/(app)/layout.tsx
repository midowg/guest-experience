import type { ReactNode } from "react";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { ViewerZoneProvider } from "@/components/pra-wam/ViewerZone";
import { currentMember } from "@/lib/server/pra-wam/session";
import { viewerZoneSetting } from "@/lib/server/pra-wam/zone";

/**
 * Every signed-in WAM screen shares one frame (bars, menu, Kelola acara's sidebar), drawn here once
 * and kept while the screens under it change, so a tap feels like an installed app: the frame stays,
 * the new tab is lit at once and the screen loads inside it (each screen's loading.tsx). The pages
 * still check the sign-in themselves (requireMemberPage, which sends a stranger to the login); with
 * no one signed in there is no frame to draw. 19 Nov 2026: every screen reads times in the viewer's
 * own zone (ViewerZoneProvider).
 */
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const [member, zone] = await Promise.all([currentMember(), viewerZoneSetting()]);
  if (!member) return children;
  return <ViewerZoneProvider zone={zone.zone} manual={zone.manual}><PraWamShell member={member}>{children}</PraWamShell></ViewerZoneProvider>;
}
