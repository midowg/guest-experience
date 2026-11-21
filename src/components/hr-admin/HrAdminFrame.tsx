import type { ReactNode } from "react";
import admin from "@/components/admin/admin.module.css";
import { currentAdmin } from "@/lib/server/admin-session";
import { requestCount, waitingCount } from "@/lib/server/hr/attendance";
import { leaveCount } from "@/lib/server/hr/leave";
import { HrAdminNav } from "./HrAdminNav";
import type { HrAdminSectionKey } from "./sections";

/**
 * Every Admin HR page in the console frame (HrAdminNav). The page checks the session itself
 * (requireAdminPage: the "hr" grant, or the super admin) and starts with its own PageHeader. The
 * count beside Perlu dicek is read here, so it is right on every page.
 */
export async function HrAdminFrame({ current, children }: { current: HrAdminSectionKey; children: ReactNode }) {
  const [actor, waiting, requests, leaves] = await Promise.all([currentAdmin(), waitingCount().catch(() => null), requestCount().catch(() => null), leaveCount().catch(() => null)]);
  return <HrAdminNav current={current} superAdmin={actor?.role === "super"} waiting={waiting ?? 0} requests={requests ?? 0} leaves={leaves ?? 0} className={admin.shell} personName={actor?.name}>
    {children}
  </HrAdminNav>;
}
