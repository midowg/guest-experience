"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { CalendarDays, CircleUserRound, FileText, House, UsersRound } from "lucide-react";
import { HR_TABS, hrTabPaths, tabOf, type HrTab } from "@/lib/hr/tabs";
import { hrPath } from "@/lib/routes";
import css from "@/components/booking/booking.module.css";
import { useCopy } from "./lang";
import { SplashCover } from "./Splash";
import hr from "./hr.module.css";

const tabIcons: Record<HrTab, typeof House> = { beranda: House, riwayat: CalendarDays, tim: UsersRound, pengajuan: FileText, profil: CircleUserRound };

/**
 * The frame of WG People (21 Nov 2026), like a phone app (Apple HIG): no bar on top (each tab root
 * has its own large title; detail screens bring their own bar), the page, and the bottom menu
 * (Beranda, Riwayat, Tim, Pengajuan, Profil), floating above the edge. Moving between them only changes the address
 * (history.pushState, which Next.js keeps in step): nothing reloads or is fetched, the back button
 * walks back through them, and each keeps its own scroll. Tapping the tab you are on again goes back
 * to its root ("hr:tab-again"). For employees only: the admin is in Journey Admin (/admin/hr).
 * Registers WG People's own service worker (scope /hr/), which makes it installable as its own app.
 */
export function HrFrame({ children }: { children: ReactNode }) {
  const tab = tabOf(usePathname());
  const scrolls = useRef<Partial<Record<HrTab, number>>>({});
  const { t } = useCopy();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${hrPath.home}/sw.js`, { scope: `${hrPath.home}/` }).catch(() => undefined);
  }, []);
  // Each place comes back where it was left; the title follows (no page load sets it).
  useEffect(() => {
    window.scrollTo(0, scrolls.current[tab] ?? 0);
    document.title = tab === "beranda" ? "WG People" : `${t.tabs[tab]} · WG People`;
  }, [tab, t]);

  const go = (event: MouseEvent<HTMLAnchorElement>, to: HrTab) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (to === tab) {
      window.dispatchEvent(new Event("hr:tab-again"));
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    scrolls.current[tab] = window.scrollY;
    window.history.pushState({}, "", hrTabPaths[to]);
  };

  return <div className={`${css.app} ${hr.bk} ${hr.shell}`}>
    <div className={hr.statusCover} aria-hidden />
    <main id="wg-main" className={hr.main}>{children}</main>
    <nav id="wg-nav" className={hr.tabbar} aria-label={t.menu}><div className={hr.tabbarInner}>
      {HR_TABS.map(key => {
        const Icon = tabIcons[key];
        return <a key={key} href={hrTabPaths[key]} className={hr.tab} aria-current={key === tab ? "page" : undefined} onClick={event => go(event, key)}>
          <span className={hr.tabIcon}><Icon size={22} strokeWidth={key === tab ? 2.4 : 1.9} aria-hidden /></span>{t.tabs[key]}
        </a>;
      })}
    </div></nav>
    {/* Sheets, questions and messages are drawn here, beside the page and the menu, which go inert under them. */}
    <div id="wg-layer" />
    <SplashCover />
  </div>;
}
