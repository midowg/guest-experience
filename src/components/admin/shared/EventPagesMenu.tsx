"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardCheck, ExternalLink, HandHeart, Images, Mail, MessageSquare, Pencil, ScanLine, UtensilsCrossed, type LucideIcon, Split } from "lucide-react";
import type { AdminTab } from "@/lib/routes";
import nav from "./navigation.module.css";

/** `icon` overrides the event tab's own icon, for pages that are not an event's (Admin WAM). */
export type EventPage<T extends string = AdminTab> = { tab: T; label: string; href: string; badge?: string; icon?: LucideIcon };
const icons: Partial<Record<string, LucideIcon>> = {
  edit: Pencil, invitations: Mail, responses: ClipboardCheck, checkin: ScanLine, beo: UtensilsCrossed, gallery: Images, feedback: MessageSquare, donations: HandHeart, "donations-split": Split,
};
/** A page's own icon, else its event tab's. */
function PageIcon({ icon, tab }: { icon?: LucideIcon; tab: string }) {
  const Icon = icon ?? icons[tab] ?? Pencil;
  return <Icon size={16} aria-hidden="true" />;
}

/**
 * One button for the event's pages instead of a row of tabs: it names the page you are on, and
 * opens a short list grouped as edit, guests and operations. Closes on a pick, outside or Esc.
 * `inline` shows the pages side by side instead, for an event with only a few (Friday Sharing).
 * Admin WAM uses the same menu for its sections, with its own `label` and icons.
 */
export function EventPagesMenu<T extends string = AdminTab>({ groups, current, publicHref, publicLabel = "Buka undangan", inline = false, label = "Pengelolaan acara" }: { groups: { label: string; pages: EventPage<T>[] }[]; current: T; publicHref?: string; publicLabel?: string; inline?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pages = groups.flatMap(group => group.pages);
  const here = pages.find(page => page.tab === current);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const publicLink = publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className={nav.public}><ExternalLink size={15} aria-hidden="true" /> {publicLabel}<span className="sr-only"> (tab baru)</span></a>;
  if (inline) return <nav className={nav.bar} aria-label={label}>
    <ul className={nav.tabs}>{pages.map(page => {
      return <li key={page.tab}><a href={page.href} aria-current={page.tab === current ? "page" : undefined}><PageIcon icon={page.icon} tab={page.tab} /> {page.label}{page.badge && <span className={nav.badge}>{page.badge}</span>}</a></li>;
    })}</ul>
    {publicLink}
  </nav>;

  return <nav className={nav.bar} aria-label={label}>
    <div ref={root} className={nav.switcher}>
      <button ref={button} type="button" className={nav.trigger} aria-expanded={open} aria-controls="event-pages" onClick={() => setOpen(!open)}>
        <PageIcon icon={here?.icon} tab={current} /><span>{here?.label ?? "Halaman acara"}</span><ChevronDown size={16} aria-hidden="true" className={open ? nav.chevronOpen : undefined} />
      </button>
      <div id="event-pages" className={nav.popover} hidden={!open}>
        {groups.map(group => <div key={group.label} className={nav.popoverGroup}>
          <p>{group.label}</p>
          <ul>{group.pages.map(page => {
            return <li key={page.tab}><a href={page.href} aria-current={page.tab === current ? "page" : undefined} onClick={() => setOpen(false)}>
              <PageIcon icon={page.icon} tab={page.tab} /><span>{page.label}</span>{page.badge && <span className={nav.badge}>{page.badge}</span>}{page.tab === current && <Check size={16} aria-hidden="true" />}
            </a></li>;
          })}</ul>
        </div>)}
      </div>
    </div>
    {publicLink}
  </nav>;
}
