import type { ReactNode } from "react";
import css from "./console.module.css";

export type PageTab = { key: string; label: string; href: string; icon?: ReactNode; badge?: string; badgeLabel?: string };

/**
 * Underlined tabs for the parts of one page; each is a link with its own address, so it can be
 * bookmarked. On a phone the row scrolls sideways.
 */
export function PageTabs({ tabs, current, label }: { tabs: readonly PageTab[]; current: string; label: string }) {
  return <nav className={css.tabs} aria-label={label}>
    <ul>{tabs.map(tab => <li key={tab.key}>
      <a href={tab.href} className={css.tab} aria-current={tab.key === current ? "page" : undefined}>
        {tab.icon}{tab.label}
        {tab.badge && <span className={css.badge}>{tab.badge}<span className="sr-only"> {tab.badgeLabel ?? "menunggu"}</span></span>}
      </a>
    </li>)}</ul>
  </nav>;
}
