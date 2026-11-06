import type { ReactNode } from "react";
import { Crown, LayoutGrid, ScrollText, ShieldCheck, Users } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, EMPLOYEES_ADMIN, SUPER_ADMIN_HOME, wamAdminPath } from "@/lib/routes";

export type SuperSection = "dashboard" | "karyawan" | "akses";

const sections: Record<SuperSection, { label: string; href: string; icon: ReactNode }> = {
  dashboard: { label: "Dashboard", href: SUPER_ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  karyawan: { label: "Data karyawan", href: EMPLOYEES_ADMIN, icon: <Users size={20} /> },
  akses: { label: "Log akses", href: "/admin/akses", icon: <ScrollText size={20} /> },
};

/**
 * Every super admin page in the same console frame as Admin WAM (6 Nov 2026): the sidebar with the
 * super admin's places, the way to Admin WAM and the rest of the admin, Keluar, and the page in the
 * white panel. Only the look is shared; each page keeps its own content and checks the session.
 */
export function SuperAdminFrame({ current, wide = false, children }: { current: SuperSection; wide?: boolean; children: ReactNode }) {
  const groups: ConsoleNavGroup[] = [{
    label: "Super admin",
    items: (Object.keys(sections) as SuperSection[]).map(key => ({ key, label: sections[key].label, href: sections[key].href, icon: sections[key].icon })),
  }];
  const footerLinks: ConsoleLink[] = [
    { key: "wam", label: "Admin WAM", href: wamAdminPath.home, icon: <ShieldCheck size={20} /> },
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <Crown size={20} /> },
  ];
  return <ConsoleShell theme="admin" area="Super admin" storageKey="super-admin" className={admin.shell} wide={wide}
    person={{ name: "Super admin", sub: "Werkudara" }} groups={groups} current={current} pageTitle={sections[current].label}
    footerLinks={footerLinks} footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
