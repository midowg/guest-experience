"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { praWamPath } from "@/lib/routes";
import { wamGroups, type WamSectionKey } from "./sections";
import nav from "./wam-admin.module.css";

/**
 * Admin WAM's sections as a side menu: a sticky list beside the page on a wide screen, a row of
 * tabs that scrolls sideways on a phone or tablet, so every section is one tap away. Built from
 * wamSections, so a new section shows here by itself. `badges` puts a count next to a section
 * (open reset requests); the way into the app itself sits at the end.
 */
export function WamNav({ current, badges = {} }: { current: WamSectionKey; badges?: Partial<Record<WamSectionKey, string>> }) {
  const list = useRef<HTMLDivElement>(null);

  // On the tab row, bring the current section into view; on the sidebar nothing overflows sideways.
  useEffect(() => {
    const scroller = list.current;
    const here = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !here || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollLeft = here.offsetLeft - (scroller.clientWidth - here.offsetWidth) / 2;
  }, [current]);

  return <nav className={nav.nav} aria-label="Bagian admin WAM">
    <div ref={list} className={nav.groups}>
      {wamGroups().map(group => <div key={group.label} className={nav.group}>
        <p className={nav.groupLabel}>{group.label}</p>
        <ul>{group.sections.map(section => {
          const Icon = section.icon;
          const badge = badges[section.key];
          return <li key={section.key}><a href={section.href} className={nav.item} aria-current={section.key === current ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" /><span className={nav.label}>{section.label}</span>
            {badge && <span className={nav.badge}>{badge}<span className="sr-only"> menunggu</span></span>}
          </a></li>;
        })}</ul>
      </div>)}
    </div>
    <a href={praWamPath.home} target="_blank" rel="noopener noreferrer" className={nav.app} title="Buka aplikasi WAM di tab baru">
      <ExternalLink size={18} aria-hidden="true" /><span className={nav.appText}>Buka aplikasi WAM</span><span className="sr-only"> (tab baru)</span>
    </a>
  </nav>;
}
