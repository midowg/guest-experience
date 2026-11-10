import type { ReactNode } from "react";
import { Activity, Crown, ListVideo, MonitorPlay, Palette, ShieldCheck } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup, type Crumb } from "@/components/console";
import admin from "@/components/admin/admin.module.css";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, tvAdminPath, wamAdminPath } from "@/lib/routes";

export type TvAdminSection = "pantauan" | "tayangan" | "layar" | "tampilan";

/** Admin TV's places, in the side menu's groups. */
const groups: { label: string; items: { key: TvAdminSection; label: string; href: string; icon: ReactNode }[] }[] = [
  { label: "Ikhtisar", items: [{ key: "pantauan", label: "Pantauan", href: tvAdminPath.home, icon: <Activity size={20} /> }] },
  { label: "Isi", items: [{ key: "tayangan", label: "Tayangan", href: tvAdminPath.playlist, icon: <ListVideo size={20} /> }] },
  { label: "Perangkat", items: [
    { key: "layar", label: "Layar TV", href: tvAdminPath.screens, icon: <MonitorPlay size={20} /> },
    { key: "tampilan", label: "Tampilan", href: tvAdminPath.look, icon: <Palette size={20} /> },
  ] },
];
const places = groups.flatMap(group => group.items);
export const tvAdminLabel = (key: TvAdminSection) => places.find(item => item.key === key)!.label;
/** "Admin TV / Tayangan": the breadcrumb of an Admin TV page. */
export const tvAdminCrumbs = (key: TvAdminSection): Crumb[] => [{ label: "Admin TV", href: tvAdminPath.home }, { label: tvAdminLabel(key) }];

/**
 * Every Admin TV page in the console frame Admin WAM and the super admin use (10 Nov 2026): TV
 * Announcement has its own admin, outside Admin WAM, with the same admin sign-in. The side menu
 * has its four places and the way back to Admin WAM. Each page checks the session itself.
 */
export function TvAdminFrame({ current, wide = false, children }: { current: TvAdminSection; wide?: boolean; children: ReactNode }) {
  const nav: ConsoleNavGroup[] = groups.map(group => ({ label: group.label, items: group.items.map(({ key, label, href, icon }) => ({ key, label, href, icon })) }));
  const footerLinks: ConsoleLink[] = [
    { key: "wam", label: "Admin WAM", href: wamAdminPath.home, icon: <ShieldCheck size={20} /> },
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <Crown size={20} /> },
  ];
  return <ConsoleShell theme="admin" area="Admin TV" storageKey="tv-admin" className={admin.shell} wide={wide}
    person={{ name: "Admin", sub: "TV Announcement" }} groups={nav} current={current} pageTitle={tvAdminLabel(current)}
    footerLinks={footerLinks} footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
