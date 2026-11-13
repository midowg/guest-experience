import type { ReactNode } from "react";
import { Blocks, Crown, KeyRound, LayoutDashboard, LayoutTemplate, ScrollText, ShieldCheck, UserCog, Users } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, EMPLOYEES_ADMIN, SUPER_ADMIN_HOME, superAdminPath, wamAdminPath } from "@/lib/routes";

export type SuperSection = "dashboard" | "tim" | "karyawan" | "templat" | "modul" | "admin" | "akses";

/** Every super admin place, in the side menu's groups (6 Nov 2026: they were links inside the dashboard). */
const groups: { label: string; items: { key: SuperSection; label: string; href: string; icon: ReactNode }[] }[] = [
  { label: "Ringkasan", items: [{ key: "dashboard", label: "Dashboard", href: SUPER_ADMIN_HOME, icon: <LayoutDashboard size={20} /> }] },
  { label: "Orang", items: [
    { key: "tim", label: "Tim Werkudara", href: superAdminPath.team, icon: <UserCog size={20} /> },
    { key: "karyawan", label: "Data karyawan", href: EMPLOYEES_ADMIN, icon: <Users size={20} /> },
  ] },
  { label: "Acara", items: [
    { key: "templat", label: "Templat & acara", href: superAdminPath.templates, icon: <LayoutTemplate size={20} /> },
    { key: "modul", label: "Modul admin", href: superAdminPath.modules, icon: <Blocks size={20} /> },
  ] },
  { label: "Keamanan", items: [
    { key: "admin", label: "Akses admin", href: superAdminPath.admins, icon: <KeyRound size={20} /> },
    { key: "akses", label: "Log akses", href: superAdminPath.access, icon: <ScrollText size={20} /> },
  ] },
];
const labelOf = (key: SuperSection) => groups.flatMap(group => group.items).find(item => item.key === key)?.label ?? "Super admin";

/**
 * Every super admin page in the same console frame as Admin WAM: the side menu with every super
 * admin place, the way to Admin WAM and the rest of the admin, Keluar, and the page in the white
 * panel. Each page checks the session itself.
 */
export function SuperAdminFrame({ current, wide = false, children }: { current: SuperSection; wide?: boolean; children: ReactNode }) {
  const nav: ConsoleNavGroup[] = groups.map(group => ({ label: group.label, items: group.items.map(({ key, label, href, icon }) => ({ key, label, href, icon })) }));
  const footerLinks: ConsoleLink[] = [
    { key: "wam", label: "Admin WAM", href: wamAdminPath.home, icon: <ShieldCheck size={20} /> },
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <Crown size={20} /> },
  ];
  return <ConsoleShell theme="admin" area="Super admin" storageKey="super-admin" className={admin.shell} wide={wide}
    person={{ name: "Super admin", sub: "Werkudara" }} groups={nav} current={current} pageTitle={labelOf(current)}
    footerLinks={footerLinks} footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
