import type { ReactNode } from "react";
import { Crown, ExternalLink, LayoutGrid } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, hrPath, SUPER_ADMIN_HOME } from "@/lib/routes";
import { HR_ADMIN_LABEL, hrAdminGroups, hrAdminSection, type HrAdminSectionKey } from "./sections";

/** Admin HR's menu, with the count that waits beside Perlu dicek. */
export function hrAdminNavGroups(waiting = 0): ConsoleNavGroup[] {
  return hrAdminGroups().map(group => ({
    label: group.label,
    items: group.sections.map(section => {
      const Icon = section.icon;
      return { key: section.key, label: section.label, href: section.href, icon: <Icon size={20} />, ...(section.key === "perlu" && waiting ? { badge: String(waiting), badgeLabel: "absen menunggu dicek" } : {}) };
    }),
  }));
}

/** Every Admin HR page in the console frame: its sections, the way into the app, the rest of the admin and Keluar. */
export function HrAdminNav({ current, superAdmin = false, waiting = 0, className, children, personName }: {
  current: HrAdminSectionKey; superAdmin?: boolean; waiting?: number; className?: string; children: ReactNode; personName?: string;
}) {
  const footerLinks: ConsoleLink[] = [
    { key: "app", label: "Buka HR Werkudara", href: hrPath.home, icon: <ExternalLink size={20} />, external: true },
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  return <ConsoleShell theme="admin" area={HR_ADMIN_LABEL} storageKey="admin-hr" className={className}
    person={{ name: personName ?? (superAdmin ? "Super admin" : "Admin"), sub: "Werkudara" }}
    groups={hrAdminNavGroups(waiting)} current={current} pageTitle={hrAdminSection(current).label}
    footerLinks={footerLinks}
    footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
