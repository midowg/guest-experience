import type { MouseEvent, ReactNode } from "react";
import { Coffee, Crown, ExternalLink, LayoutGrid } from "lucide-react";
import { ConsoleLogoutButton, ConsoleShell, PageHeader, type ConsoleLink, type ConsoleNavGroup } from "@/components/console";
import { Notice } from "@/components/ui";
import { ADMIN_HOME, ADMIN_LOGIN, ADMIN_LOGOUT_API, coffeePath, SUPER_ADMIN_HOME } from "@/lib/routes";
import { COFFEE_ADMIN_LABEL, coffeeAdminGroups, coffeeAdminSection, type CoffeeAdminSectionKey } from "./sections";

/** The pengelola's menu, with the number of orders that wait beside Antrean. */
export function coffeeAdminNavGroups(waiting = 0): ConsoleNavGroup[] {
  return coffeeAdminGroups().map(group => ({
    label: group.label,
    items: group.sections.map(section => {
      const Icon = section.icon;
      const badge = section.key === "antrean" && waiting ? { badge: String(waiting), badgeLabel: "pesanan menunggu" } : {};
      return { key: section.key, label: section.label, href: section.href, icon: <Icon size={20} />, ...badge };
    }),
  }));
}

/** Every WG Coffee admin page in the console frame: its sections, the way into the app, the rest of the admin and Keluar. */
export function CoffeeAdminNav({ current, superAdmin = false, waiting = 0, className, children, personName, onLeave }: {
  current: CoffeeAdminSectionKey; superAdmin?: boolean; waiting?: number; className?: string; children: ReactNode; personName?: string;
  /** Keluar was pressed (F4: this device lets go of its notifications first). */
  onLeave?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const footerLinks: ConsoleLink[] = [
    { key: "app", label: "Buka WG Coffee", href: coffeePath.home, icon: <ExternalLink size={20} />, external: true },
    ...(superAdmin ? [{ key: "super", label: "Super admin", href: SUPER_ADMIN_HOME, icon: <Crown size={20} /> }] : []),
    { key: "events", label: "Beranda Journey", href: ADMIN_HOME, icon: <LayoutGrid size={20} /> },
  ];
  return <ConsoleShell theme="admin" area={COFFEE_ADMIN_LABEL} storageKey="admin-coffee" className={className} wide
    logo={<Coffee size={18} aria-hidden />}
    person={{ name: personName ?? (superAdmin ? "Super admin" : "Admin"), sub: "Pengelola" }}
    groups={coffeeAdminNavGroups(waiting)} current={current} pageTitle={coffeeAdminSection(current).label}
    footerLinks={footerLinks}
    footer={<span style={{ display: "contents" }} onClickCapture={onLeave}><ConsoleLogoutButton endpoint={ADMIN_LOGOUT_API} redirectTo={ADMIN_LOGIN} /></span>}>
    {children}
  </ConsoleShell>;
}

/**
 * A page that cannot show its data yet (before the migration runs): the frame, the page's title,
 * and what it waits for. The menu's links are plain links here, so each one asks the server again.
 */
export function CoffeeAdminWaiting({ current, notice, superAdmin, personName, className }: {
  current: CoffeeAdminSectionKey; notice: string; superAdmin?: boolean; personName?: string; className?: string;
}) {
  const section = coffeeAdminSection(current);
  return <CoffeeAdminNav current={current} superAdmin={superAdmin} personName={personName} className={className}>
    <PageHeader title={section.label} subtitle={section.summary} />
    <Notice tone="warning">{notice}</Notice>
  </CoffeeAdminNav>;
}
