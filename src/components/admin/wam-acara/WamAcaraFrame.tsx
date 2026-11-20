import type { ReactNode } from "react";
import { currentAdmin } from "@/lib/server/admin-session";
import { showsAppCard } from "@/lib/admin-access";
import admin from "@/components/admin/admin.module.css";
import { WamAcaraNav } from "./WamAcaraNav";
import type { WamAcaraSectionKey } from "./sections";

/**
 * Every Admin WAM 2027 page in the console frame (WamAcaraNav). The page checks the session itself
 * (requireAdminPage: the wam_acara right, or the super admin) and starts with its own PageHeader.
 * The admin skin (admin.module.css .shell) stays on, so the sections' forms keep their look.
 */
export async function WamAcaraFrame({ current, children, wide = false }: { current: WamAcaraSectionKey; children: ReactNode; wide?: boolean }) {
  const actor = await currentAdmin();
  const opensPraWam = actor?.kind === "person" ? showsAppCard(actor.grant, "wam") : !!actor;
  return <WamAcaraNav current={current} superAdmin={actor?.role === "super"} opensPraWam={opensPraWam} wide={wide} className={admin.shell} personName={actor?.name}>
    {children}
  </WamAcaraNav>;
}
