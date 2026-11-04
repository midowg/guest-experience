import { cache, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { openResetRequestCount } from "@/lib/server/pra-wam/reset-requests";
import styles from "@/components/admin/admin.module.css";
import frame from "./wam-admin.module.css";
import { WamNav } from "./WamNav";
import type { WamSectionKey } from "./sections";

/** Open "Lupa password" requests, read once per request; null before the migration or on an error. */
export const waitingResetRequests = cache(() => openResetRequestCount().catch(() => null));

/**
 * Every Admin WAM page: the admin header, the title, and the side menu of sections (with how many
 * "Lupa password" requests wait, and the way into the app). The page checks the session and
 * renders its section beside the menu. The container is always wide, so the menu does not move
 * between sections; `wide` lets the page itself use that width (a preview or the floor plan).
 */
export async function WamAdminFrame({ current, children, wide = false }: { current: WamSectionKey; children: ReactNode; wide?: boolean }) {
  const waiting = await waitingResetRequests();
  return <AdminShell wide>
    <div className={`${frame.frame} ${wide ? frame.frameWide : ""}`}>
      <div className={frame.frameHead}>
        <p className="eyebrow">Admin WAM</p>
        <h1 className={styles.title}>Aplikasi WAM</h1>
      </div>
      <WamNav current={current} badges={waiting ? { reset: String(waiting) } : undefined} />
      <div className={frame.frameBody}>{children}</div>
    </div>
  </AdminShell>;
}
