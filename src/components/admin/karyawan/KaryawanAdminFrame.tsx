import type { ReactNode } from "react";
import { Crown, FileSpreadsheet, LayoutGrid, Network, Users } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { currentAdmin } from "@/lib/server/admin-session";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, employeesAdminPath, SUPER_ADMIN_HOME } from "@/lib/routes";

export type KaryawanSection = "daftar" | "struktur" | "impor";

const sections: { key: KaryawanSection; label: string; href: string; icon: ReactNode }[] = [
  { key: "daftar", label: "Daftar karyawan", href: employeesAdminPath.home, icon: <Users size={20} /> },
  { key: "struktur", label: "Struktur", href: employeesAdminPath.structure, icon: <Network size={20} /> },
  { key: "impor", label: "Impor Excel", href: employeesAdminPath.import, icon: <FileSpreadsheet size={20} /> },
];
export const karyawanSectionLabel = (key: KaryawanSection) => sections.find(item => item.key === key)?.label ?? "Data karyawan";

/**
 * Data karyawan as its own admin app (27 Nov 2026; was a page of Super admin): every page in the
 * console frame with its three parts, the way back to Beranda (and Super admin for the super admin),
 * and Keluar. Admin only: the employees have no app of their own here. Each page checks the session
 * itself (requireAdminPage: the "karyawan" grant, or the super admin).
 */
export async function KaryawanAdminFrame({ current, wide = false, children }: { current: KaryawanSection; wide?: boolean; children: ReactNode }) {
  const actor = await currentAdmin();
  const superAdmin = actor?.role === "super";
  const groups: ConsoleNavGroup[] = [{ label: "Data karyawan", items: sections.map(({ key, label, href, icon }) => ({ key, label, href, icon })) }];
  const footerLinks: ConsoleLink[] = [
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Beranda Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  return <ConsoleShell theme="admin" area="Data karyawan" storageKey="admin-karyawan" className={admin.shell} wide={wide}
    person={{ name: actor?.name ?? "Admin", sub: "Werkudara" }} groups={groups} current={current} pageTitle={karyawanSectionLabel(current)}
    footerLinks={footerLinks} footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
