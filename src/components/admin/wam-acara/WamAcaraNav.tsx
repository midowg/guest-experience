import type { ReactNode } from "react";
import { Crown, LayoutGrid, ShieldCheck } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import { PRA_WAM_ADMIN_LABEL, WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, SUPER_ADMIN_HOME, wamAdminPath } from "@/lib/routes";
import { wamAcaraGroups, wamAcaraMenuKey, wamAcaraSection, wamAcaraSections, type WamAcaraSectionKey } from "./sections";

/** Admin WAM 2026's menu from wamAcaraSections. */
export function wamAcaraNavGroups(): ConsoleNavGroup[] {
  return wamAcaraGroups().map(group => ({
    label: group.label,
    items: group.sections.map(section => {
      const Icon = section.icon;
      return { key: section.key, label: section.label, href: section.href, icon: <Icon size={20} /> };
    }),
  }));
}

/**
 * Every Admin WAM 2026 page in the console frame: its sections, the way into Main WAM, Admin Pra WAM only
 * for someone who may open it (the super admin, or a grant), the rest of the admin and Keluar. Ctrl K
 * finds the tab-only pages too (Kamar, Kuis live).
 */
export function WamAcaraNav({ current, superAdmin = false, opensPraWam = false, wide = false, className, children, personName }: {
  current: WamAcaraSectionKey; superAdmin?: boolean;
  /** Show the way to Admin Pra WAM (this admin may open it). */
  opensPraWam?: boolean;
  wide?: boolean; className?: string; children: ReactNode; personName?: string;
}) {
  const footerLinks: ConsoleLink[] = [
    ...(opensPraWam ? [{ key: "pra-wam", label: PRA_WAM_ADMIN_LABEL, href: wamAdminPath.home, icon: <ShieldCheck size={20} /> }] : []),
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  const tabs = wamAcaraSections.filter(section => section.owner).map(section => {
    const Icon = section.icon;
    return { key: section.key, label: section.label, href: section.href, sub: wamAcaraSection(section.owner!).label, icon: <Icon size={20} /> };
  });
  return <ConsoleShell theme="admin" area={WAM_EVENT_ADMIN_LABEL} storageKey="admin-wam-acara" className={className} wide={wide}
    person={{ name: personName ?? (superAdmin ? "Super admin" : "Admin"), sub: "Werkudara" }}
    groups={wamAcaraNavGroups()} current={wamAcaraMenuKey(current)} pageTitle={wamAcaraSection(wamAcaraMenuKey(current)).label}
    footerLinks={footerLinks} searchItems={tabs}
    footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
