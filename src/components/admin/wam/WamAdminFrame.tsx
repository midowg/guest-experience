import { cache, type ReactNode } from "react";
import { purgeIfDue } from "@/lib/server/pra-wam/purge";
import { adminRole } from "@/lib/server/admin-session";
import { openResetRequestCount } from "@/lib/server/pra-wam/reset-requests";
import admin from "@/components/admin/admin.module.css";
import { WamNav } from "./WamNav";
import type { WamSectionKey } from "./sections";

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
  const [waiting, role] = await Promise.all([waitingResetRequests(), adminRole(), purgeIfDue()]);
  return <WamNav current={current} badges={waiting ? { reset: String(waiting) } : undefined} superAdmin={role === "super"} wide={wide} className={admin.shell}>
    {children}
  </WamNav>;
}
