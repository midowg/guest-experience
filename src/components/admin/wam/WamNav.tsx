"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Menu, X } from "lucide-react";
import { praWamPath } from "@/lib/routes";
import { wamGroups, wamSections, type WamSectionKey } from "./sections";
import nav from "./wam-admin.module.css";

type Badges = Partial<Record<WamSectionKey, string>>;

/** Every section, grouped, then the way into the app itself: the same list on every width. */
function SectionList({ current, badges }: { current: WamSectionKey; badges: Badges }) {
  return <div className={nav.list}>
    <div className={nav.groups}>
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
    <a href={praWamPath.home} target="_blank" rel="noopener noreferrer" className={nav.app}>
      <ExternalLink size={18} aria-hidden="true" /><span>Buka aplikasi WAM</span><span className="sr-only"> (tab baru)</span>
    </a>
  </div>;
}

/**
 * Admin WAM's sections as a side menu, built from wamSections so a new section shows here by
 * itself. A wide screen: a sticky list beside the page. A phone or tablet: a bar with a hamburger
 * and the current section; tapping it opens the same list as a drawer from the left (a native
 * dialog, so focus stays inside and Esc or the dimmed page closes it). `badges` puts a count next
 * to a section (open reset requests).
 */
export function WamNav({ current, badges = {} }: { current: WamSectionKey; badges?: Badges }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const here = wamSections.find(section => section.key === current);
  const waiting = Object.values(badges).filter(Boolean).length > 0;

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) { dialog.close(); opener.current?.focus(); }
  }, [open]);

  return <nav className={nav.nav} aria-label="Bagian admin WAM">
    <SectionList current={current} badges={badges} />
    <button ref={opener} type="button" className={nav.bar} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className={nav.burger}><Menu size={20} aria-hidden="true" /></span>
      <span className={nav.barText}><small>Menu admin WAM</small><strong>{here?.label ?? "Ringkasan"}</strong></span>
      {waiting && <span className={nav.badge} aria-hidden="true">!</span>}
    </button>
    <dialog ref={drawer} className={nav.drawer} aria-label="Menu admin WAM"
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === drawer.current) setOpen(false); }}>
      {open && <div className={nav.drawerInner}>
        <div className={nav.drawerHead}>
          <strong>Admin WAM</strong>
          <button type="button" className={nav.close} aria-label="Tutup menu" onClick={() => setOpen(false)}><X size={22} aria-hidden="true" /></button>
        </div>
        <SectionList current={current} badges={badges} />
      </div>}
    </dialog>
  </nav>;
}
