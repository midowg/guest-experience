import { cache, type ReactNode } from "react";
import { purgeIfDue } from "@/lib/server/pra-wam/purge";
import { currentAdmin } from "@/lib/server/admin-session";
import { openResetRequestCount } from "@/lib/server/pra-wam/reset-requests";
import admin from "@/components/admin/admin.module.css";
import { WamNav } from "./WamNav";
import { wamSections, type WamSectionKey } from "./sections";
import { wamSectionsWithout } from "@/lib/admin-access";

/** Open "Lupa password" requests, read once per request; null before the migration or on an error. */
export const waitingResetRequests = cache(() => openResetRequestCount().catch(() => null));

/**
 * Every Admin WAM page in the console frame (WamNav): the sidebar with how many "Lupa password"
 * requests wait, and the page in the white panel. The page checks the session itself
 * (requireAdminPage) and starts with its own PageHeader. `wide` lets the page use the panel's
 * full width (a preview or the floor plan). The admin skin (admin.module.css .shell) stays on, so
 * the sections' forms keep their look.
 */
export async function WamAdminFrame({ current, children, wide = false }: { current: WamSectionKey; children: ReactNode; wide?: boolean }) {
  // From the stay date on, opening Admin WAM deletes the stay and health data (see purge.ts).
  const [waiting, actor] = await Promise.all([waitingResetRequests(), currentAdmin(), purgeIfDue()]);
  // A personal admin's menu holds only what their grant opens (Kuesioner WAM alone: only Kuesioner).
  const without = actor?.kind === "person" ? wamSectionsWithout(actor.grant.apps, wamSections.map(section => section.key)) : [];
  return <WamNav current={current} badges={waiting && !without.includes("reset") ? { reset: String(waiting) } : undefined} superAdmin={actor?.role === "super"} wide={wide} className={admin.shell}
    personName={actor?.name} without={without}>
    {children}
  </WamNav>;
}
