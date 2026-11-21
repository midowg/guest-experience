import type { ReactNode } from "react";
import { Crown, ExternalLink, LayoutGrid } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, hrPath, SUPER_ADMIN_HOME } from "@/lib/routes";
import { HR_ADMIN_LABEL, hrAdminGroups, hrAdminSection, type HrAdminSectionKey } from "./sections";

/** Admin HR's menu, with the counts that wait beside Perlu dicek, Revisi and Cuti & izin. */
export function hrAdminNavGroups(waiting = 0, requests = 0, leaves = 0): ConsoleNavGroup[] {
  return hrAdminGroups().map(group => ({
    label: group.label,
    items: group.sections.map(section => {
      const Icon = section.icon;
      const badge = section.key === "perlu" && waiting ? { badge: String(waiting), badgeLabel: "absen menunggu dicek" }
        : section.key === "revisi" && requests ? { badge: String(requests), badgeLabel: "revisi menunggu" }
          : section.key === "cuti" && leaves ? { badge: String(leaves), badgeLabel: "pengajuan menunggu" } : {};
      return { key: section.key, label: section.label, href: section.href, icon: <Icon size={20} />, ...badge };
    }),
  }));
}

/** Every Admin HR page in the console frame: its sections, the way into the app, the rest of the admin and Keluar. */
export function HrAdminNav({ current, superAdmin = false, waiting = 0, requests = 0, leaves = 0, className, children, personName }: {
  current: HrAdminSectionKey; superAdmin?: boolean; waiting?: number; requests?: number; leaves?: number; className?: string; children: ReactNode; personName?: string;
}) {
  const footerLinks: ConsoleLink[] = [
    { key: "app", label: "Buka WG People", href: hrPath.home, icon: <ExternalLink size={20} />, external: true },
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Beranda Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  return <ConsoleShell theme="admin" area={HR_ADMIN_LABEL} storageKey="admin-hr" className={className}
    person={{ name: personName ?? (superAdmin ? "Super admin" : "Admin"), sub: "Werkudara" }}
    groups={hrAdminNavGroups(waiting, requests, leaves)} current={current} pageTitle={hrAdminSection(current).label}
    footerLinks={footerLinks}
    footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
