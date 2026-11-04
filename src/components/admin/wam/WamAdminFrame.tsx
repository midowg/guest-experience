import { cache, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { openResetRequestCount } from "@/lib/server/pra-wam/reset-requests";
import styles from "@/components/admin/admin.module.css";
import { WamNav } from "./WamNav";
import type { WamSectionKey } from "./sections";

/** Open "Lupa password" requests, read once per request; null before the migration or on an error. */
export const waitingResetRequests = cache(() => openResetRequestCount().catch(() => null));

/**
 * Every Admin WAM page: the admin header, the title, and the section menu (with how many
 * "Lupa password" requests wait). The page checks the session and renders its section inside.
 */
export async function WamAdminFrame({ current, children, wide = false }: { current: WamSectionKey; children: ReactNode; wide?: boolean }) {
  const waiting = await waitingResetRequests();
  return <AdminShell wide={wide}>
    <p className="eyebrow">Admin WAM</p>
    <h1 className={styles.title}>Aplikasi WAM</h1>
    <WamNav current={current} badges={waiting ? { reset: String(waiting) } : undefined} />
    {children}
  </AdminShell>;
}
