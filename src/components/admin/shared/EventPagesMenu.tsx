"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardCheck, ExternalLink, HandHeart, Images, Mail, MessageSquare, Pencil, ScanLine, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { AdminTab } from "@/lib/routes";
import nav from "./navigation.module.css";

export type EventPage = { tab: AdminTab; label: string; href: string };
const icons: Partial<Record<AdminTab, LucideIcon>> = {
  edit: Pencil, invitations: Mail, responses: ClipboardCheck, checkin: ScanLine, beo: UtensilsCrossed, gallery: Images, feedback: MessageSquare, donations: HandHeart,
};

/**
 * One button for the event's pages instead of a row of tabs: it names the page you are on, and
 * opens a short list grouped as edit, guests and operations. Closes on a pick, outside or Esc.
 * With only two pages (Friday Sharing: edit and donations) both show side by side instead.
 */
export function EventPagesMenu({ groups, current, publicHref, publicLabel = "Buka undangan" }: { groups: { label: string; pages: EventPage[] }[]; current: AdminTab; publicHref?: string; publicLabel?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pages = groups.flatMap(group => group.pages);
  const here = pages.find(page => page.tab === current);
  const Icon = icons[current] ?? Pencil;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const publicLink = publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className={nav.public}><ExternalLink size={15} aria-hidden="true" /> {publicLabel}<span className="sr-only"> (tab baru)</span></a>;
  if (pages.length === 2) return <nav className={nav.bar} aria-label="Pengelolaan acara">
    <ul className={nav.tabs}>{pages.map(page => {
      const PageIcon = icons[page.tab] ?? Pencil;
      return <li key={page.tab}><a href={page.href} aria-current={page.tab === current ? "page" : undefined}><PageIcon size={16} aria-hidden="true" /> {page.label}</a></li>;
    })}</ul>
    {publicLink}
  </nav>;

  return <nav className={nav.bar} aria-label="Pengelolaan acara">
    <div ref={root} className={nav.switcher}>
      <button ref={button} type="button" className={nav.trigger} aria-expanded={open} aria-controls="event-pages" onClick={() => setOpen(!open)}>
        <Icon size={16} aria-hidden="true" /><span>{here?.label ?? "Halaman acara"}</span><ChevronDown size={16} aria-hidden="true" className={open ? nav.chevronOpen : undefined} />
      </button>
      <div id="event-pages" className={nav.popover} hidden={!open}>
        {groups.map(group => <div key={group.label} className={nav.popoverGroup}>
          <p>{group.label}</p>
          <ul>{group.pages.map(page => {
            const PageIcon = icons[page.tab] ?? Pencil;
            return <li key={page.tab}><a href={page.href} aria-current={page.tab === current ? "page" : undefined} onClick={() => setOpen(false)}>
              <PageIcon size={16} aria-hidden="true" /><span>{page.label}</span>{page.tab === current && <Check size={16} aria-hidden="true" />}
            </a></li>;
          })}</ul>
        </div>)}
      </div>
    </div>
    {publicLink}
  </nav>;
}
