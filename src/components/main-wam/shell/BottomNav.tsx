import Link from "next/link";
import { CalendarDays, House, Images, UserRound, type LucideIcon } from "lucide-react";
import { mainWamTabs, type MainWamTab } from "@/lib/main-wam/screen";
import { Badge } from "../ui/Status";
import { cx } from "../ui/Pressable";
import css from "./shell.module.css";

const ICONS: Record<(typeof mainWamTabs)[number]["icon"], LucideIcon> = { house: House, "calendar-days": CalendarDays, images: Images, "user-round": UserRound };

export type TabBadges = Partial<Record<MainWamTab, number | "dot">>;

/** What a badge adds to the tab's spoken name. */
function badgeWords(badge: number | "dot" | undefined): string {
  if (badge === undefined || badge === 0) return "";
  return badge === "dot" ? ", ada yang baru" : `, ${badge} baru`;
}

/**
 * The bottom bar (DS #4, revisi 16 Nov): Beranda · Agenda · Momen · Saya, the same for every role.
 * Addresses from mainWamTabs (src/lib/main-wam/screen.ts, built on mainWamPath); the lit tab comes
 * from the address (the shell passes `current`), aria-current="page". Links are next/link: no full
 * reload, prefetched. `tone="dark"` on Momen's black viewer.
 */
export function BottomNav({ current, tone = "default", badges = {}, className }: {
  current: MainWamTab | null;
  tone?: "default" | "dark";
  badges?: TabBadges;
  className?: string;
}) {
  return <nav aria-label="Navigasi utama" className={cx(css.nav, tone === "dark" && css.navDark, className)}>
    {mainWamTabs.map(tab => {
      const Icon = ICONS[tab.icon];
      const badge = badges[tab.key];
      const words = badgeWords(badge);
      return <Link key={tab.key} href={tab.href} className={css.item} aria-current={tab.key === current ? "page" : undefined} aria-label={words ? `${tab.label}${words}` : undefined}>
        <span className={css.ind}>
          <Icon aria-hidden />
          {badge !== undefined && badge !== 0 && <Badge className={css.badge} dot={badge === "dot"} count={typeof badge === "number" ? badge : undefined} />}
        </span>
        <span className={css.label}>{tab.label}</span>
      </Link>;
    })}
  </nav>;
}
