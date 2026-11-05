"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, Menu, Search, X } from "lucide-react";
import css from "./console.module.css";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { consoleThemeClass } from "./ConsoleTheme";
import { Avatar } from "./Pill";
import { useStoredValue } from "./storage";
import type { ConsoleLink, ConsoleNavGroup, ConsolePerson, ConsoleSearchItem, ConsoleThemeName } from "./types";

export type ConsoleShellProps = {
  theme?: ConsoleThemeName;
  /** "Admin WAM" or "Kelola acara": the identity card, the phone bar and the menu's name. */
  area: string;
  person?: ConsolePerson;
  /** Replaces the blue "W" square (32 px). */
  logo?: ReactNode;
  groups: readonly ConsoleNavGroup[];
  /** The key of the menu item to mark as this page. */
  current?: string;
  /** The phone bar's title; the current item's label by default. */
  pageTitle?: string;
  footerLinks?: readonly ConsoleLink[];
  /** After the footer links, e.g. ConsoleLogoutButton. */
  footer?: ReactNode;
  /** More places for the search besides the menu (people, pages not in the menu). */
  searchItems?: readonly ConsoleSearchItem[];
  searchPlaceholder?: string;
  /** Where the collapsed sidebar is remembered; one per area. */
  storageKey?: string;
  /** The page uses the panel's full width instead of 80rem. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
};

type SideProps = ConsoleShellProps & {
  variant: "column" | "drawer";
  rail: boolean;
  folded: ReadonlySet<string>;
  onFold: (group: string) => void;
  onSearch: () => void;
  onCollapse?: () => void;
  onClose?: () => void;
};

function Identity({ area, person, logo, rail, variant, onCollapse, onClose }: SideProps) {
  return <div className={css.identity}>
    <span className={css.logo} aria-hidden="true">{logo ?? "W"}</span>
    <span className={css.identityText}><strong>{area}</strong>{person && <small>{[person.name, person.sub].filter(Boolean).join(" · ")}</small>}</span>
    {variant === "column" && onCollapse && <button type="button" className={css.iconButton} onClick={onCollapse}
      aria-label={rail ? "Lebarkan menu" : "Ciutkan menu"} title={rail ? "Lebarkan menu" : "Ciutkan menu"}>
      {rail ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
    </button>}
    {variant === "drawer" && <button type="button" className={`${css.iconButton} ${css.closeButton}`} aria-label="Tutup menu" onClick={onClose}><X size={22} aria-hidden="true" /></button>}
  </div>;
}

/** The sidebar's content: identity, search, the groups, then the footer. The same in the column, the rail and the drawer. */
function Side(props: SideProps) {
  const { groups, current, footerLinks = [], footer, rail, folded, onFold, onSearch, searchPlaceholder = "Cari halaman atau orang", variant } = props;
  const id = useId();
  return <div className={`${css.side} ${rail ? css.rail : ""}`}>
    <Identity {...props} />
    <button type="button" className={css.search} onClick={onSearch} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title={rail ? searchPlaceholder : undefined}>
      <Search size={18} aria-hidden="true" /><span className={css.searchText}>{searchPlaceholder}</span><kbd className={css.kbd} aria-hidden="true">Ctrl K</kbd>
    </button>
    <nav className={css.groups} aria-label={`Menu ${props.area}`}>
      {groups.map((group, index) => {
        const listId = `${id}-${variant}-${index}`;
        const open = rail || !folded.has(group.label);
        return <div key={group.label} className={css.group}>
          <button type="button" className={css.groupHead} aria-expanded={open} aria-controls={listId} onClick={() => onFold(group.label)}>
            <span>{group.label}</span><ChevronDown size={16} aria-hidden="true" />
          </button>
          <ul id={listId} className={css.groupList} hidden={!open} aria-label={rail ? group.label : undefined}>
            {group.items.map(item => <li key={item.key}>
              <a href={item.href} className={css.item} aria-current={item.key === current ? "page" : undefined} title={rail ? item.label : undefined}>
                {item.icon && <span className={css.itemIcon} aria-hidden="true">{item.icon}</span>}
                <span className={css.itemLabel}>{item.label}</span>
                {item.badge && <span className={css.badge}>{item.badge}<span className="sr-only"> {item.badgeLabel ?? "menunggu"}</span></span>}
              </a>
            </li>)}
          </ul>
        </div>;
      })}
    </nav>
    <div className={css.filler} />
    {(footerLinks.length > 0 || footer) && <ul className={css.footer}>
      {footerLinks.map(link => <li key={link.key ?? link.href}>
        <a href={link.href} className={css.item} title={rail ? link.label : undefined}
          target={link.external ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined}>
          {link.icon && <span className={css.itemIcon} aria-hidden="true">{link.icon}</span>}
          <span className={css.itemLabel}>{link.label}{link.external && <span className="sr-only"> (tab baru)</span>}</span>
        </a>
      </li>)}
      {footer && <li>{footer}</li>}
    </ul>}
  </div>;
}

/**
 * The console frame: a grey canvas, the sidebar on it (collapsible to an icon rail, remembered on
 * this device), and the page in one white panel. Below 1024 px the sidebar becomes a drawer from a
 * 64 px bar. Ctrl/⌘+K opens the search over the menu.
 */
export function ConsoleShell(props: ConsoleShellProps) {
  const { theme = "admin", area, person, groups, current, pageTitle, footerLinks = [], searchItems = [], searchPlaceholder, storageKey, wide = false, className, children } = props;
  const [collapsedFlag, setCollapsedFlag] = useStoredValue(`console-sidebar:${storageKey ?? area}`, "0", ["0", "1"] as const);
  const collapsed = collapsedFlag === "1";
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = drawer.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) { dialog.close(); opener.current?.focus(); }
  }, [drawerOpen]);

  const openPalette = useCallback(() => { setDrawerOpen(false); setPaletteOpen(true); }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); openPalette(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const seen = new Set<string>();
    const all: PaletteItem[] = [
      ...groups.flatMap(group => group.items.map(item => ({ key: `nav-${item.key}`, label: item.label, href: item.href, sub: group.label, icon: item.icon }))),
      ...searchItems.map(item => ({ ...item, key: `extra-${item.key}` })),
      ...footerLinks.map(link => ({ key: `link-${link.key ?? link.href}`, label: link.label, href: link.href, icon: link.icon, external: link.external })),
    ];
    return all.filter(item => { const id = `${item.label}|${item.href}`; if (seen.has(id)) return false; seen.add(id); return true; });
  }, [groups, searchItems, footerLinks]);

  const here = groups.flatMap(group => group.items).find(item => item.key === current);
  const waiting = groups.some(group => group.items.some(item => item.badge));
  const side = {
    ...props,
    folded,
    onFold: (label: string) => setFolded(previous => { const next = new Set(previous); if (next.has(label)) next.delete(label); else next.add(label); return next; }),
    onSearch: openPalette,
  };

  return <div className={[css.shell, css.canvas, consoleThemeClass(theme), className ?? ""].filter(Boolean).join(" ")} data-collapsed={collapsed}>
    <a href="#main" className={css.skip}>Langsung ke isi</a>
    <header className={css.topbar}>
      <button ref={opener} type="button" className={css.burger} aria-label={`Menu ${area}`} aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
        <Menu size={22} aria-hidden="true" />{waiting && <span className={css.burgerDot} aria-hidden="true" />}
      </button>
      <span className={css.topText}><small>{area}</small><strong>{pageTitle ?? here?.label ?? area}</strong></span>
      {person && <Avatar name={person.name} photo={person.photo} size={36} />}
    </header>
    <aside className={css.sidebar}>
      <Side {...side} variant="column" rail={collapsed} onCollapse={() => setCollapsedFlag(collapsed ? "0" : "1")} />
    </aside>
    <dialog ref={drawer} className={css.drawer} aria-label={`Menu ${area}`}
      onCancel={event => { event.preventDefault(); setDrawerOpen(false); }}
      onClick={event => { if (event.target === drawer.current) setDrawerOpen(false); }}>
      {drawerOpen && <div className={css.drawerInner}><Side {...side} variant="drawer" rail={false} onClose={() => setDrawerOpen(false)} /></div>}
    </dialog>
    <main id="main" className={css.panel} tabIndex={-1}>
      <div className={`${css.panelBody} ${wide ? css.panelWide : ""}`}>{children}</div>
    </main>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} placeholder={searchPlaceholder} />
  </div>;
}
