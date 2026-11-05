import type { ReactNode } from "react";
import { Crown, ExternalLink, LayoutGrid } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, SUPER_ADMIN_HOME, praWamPath } from "@/lib/routes";
import { WAM_ADMIN_LABEL, wamGroups, wamMenuKey, wamSection, wamSections, type WamSectionKey } from "./sections";

type Badges = Partial<Record<WamSectionKey, string>>;

const badgeLabels: Partial<Record<WamSectionKey, string>> = { reset: "permintaan reset menunggu" };

/** Admin WAM's menu from wamSections; a tab-only page's badge shows on its owner (reset → Akun dan peran). */
export function wamNavGroups(badges: Badges = {}): ConsoleNavGroup[] {
  return wamGroups().map(group => ({
    label: group.label,
    items: group.sections.map(section => {
      const owned = wamSections.filter(other => wamMenuKey(other.key) === section.key && badges[other.key]);
      const badgeFrom = owned[0];
      const Icon = section.icon;
      return {
        key: section.key, label: section.label, href: section.href, icon: <Icon size={20} />,
        badge: badgeFrom ? badges[badgeFrom.key] : undefined,
        badgeLabel: badgeFrom ? badgeLabels[badgeFrom.key] : undefined,
      };
    }),
  }));
}

/**
 * Every Admin WAM page in the console frame: the sidebar of sections (built from wamSections, so a
 * new section shows by itself), the way into the app, the rest of the admin and Keluar, and the page
 * in the white panel. Pages reached only as a tab (reset) mark their owner in the menu.
 */
export function WamNav({ current, badges = {}, superAdmin = false, wide = false, className, children }: {
  current: WamSectionKey; badges?: Badges; superAdmin?: boolean; wide?: boolean; className?: string; children: ReactNode;
}) {
  const footerLinks: ConsoleLink[] = [
    { key: "app", label: "Buka aplikasi WAM", href: praWamPath.home, icon: <ExternalLink size={20} />, external: true },
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Semua acara Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  const hidden = wamSections.filter(section => section.owner).map(section => {
    const Icon = section.icon;
    return { key: section.key, label: section.label, href: section.href, sub: wamSection(section.owner!).label, icon: <Icon size={20} /> };
  });
  return <ConsoleShell theme="admin" area={WAM_ADMIN_LABEL} storageKey="admin-wam" className={className} wide={wide}
    person={{ name: superAdmin ? "Super admin" : "Admin", sub: "Werkudara" }}
    groups={wamNavGroups(badges)} current={wamMenuKey(current)} pageTitle={wamSection(wamMenuKey(current)).label}
    footerLinks={footerLinks} searchItems={hidden}
    footer={<ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} />}>
    {children}
  </ConsoleShell>;
}
