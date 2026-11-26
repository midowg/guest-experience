"use client";

import type { MouseEvent, ReactNode } from "react";
import { ClipboardList, Coffee, House } from "lucide-react";
import { COFFEE_TABS, coffeeTabLabels, coffeeTabPaths, type CoffeeTab } from "@/lib/coffee/tabs";
import css from "./coffee.module.css";

const tabIcons: Record<CoffeeTab, typeof House> = { menu: House, pesanan: ClipboardList };

/**
 * The frame of the employee app, like a phone app: the name on top with the account button, the
 * screen, and the bottom menu (Menu, Pesanan saya). The frame stays while the screen changes; the
 * tabs are real links (they work before the script is ready) that the app turns into a change of
 * address only. A dot on Pesanan saya says a claim is being processed.
 */
export function CoffeeFrame({ tab, onTab, waiting, name, onAccount, children }: {
  tab: CoffeeTab; onTab: (to: CoffeeTab) => void; waiting: number; name: string; onAccount: () => void; children: ReactNode;
}) {
  const go = (event: MouseEvent<HTMLAnchorElement>, to: CoffeeTab) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onTab(to);
  };
  return (
    <div className={css.column}>
      <header className={css.topbar}>
        <span className={css.brand}><Coffee aria-hidden size={20} />Werkudara Coffee</span>
        <button type="button" className={css.avatarButton} aria-label={`Akun ${name}`} aria-haspopup="dialog" onClick={onAccount}>
          <span className={css.avatar} aria-hidden>{name.trim().slice(0, 1).toUpperCase()}</span>
        </button>
      </header>
      <main className={css.main} tabIndex={-1} data-coffee-focus>{children}</main>
      <nav className={css.tabbar} aria-label="Navigasi">
        {COFFEE_TABS.map(key => {
          const Icon = tabIcons[key];
          return (
            <a key={key} href={coffeeTabPaths[key]} aria-current={key === tab ? "page" : undefined} onClick={event => go(event, key)}>
              <span className={css.tabIcon}>
                <Icon aria-hidden size={22} />
                {key === "pesanan" && waiting > 0 && <span className={css.badge} role="img" aria-label={`${waiting} pengajuan sedang diproses`} />}
              </span>
              {coffeeTabLabels[key]}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
