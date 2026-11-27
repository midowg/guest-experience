"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, Coffee, CupSoda, Info, X } from "lucide-react";
import { DRINK_GROUPS, DRINK_GROUP_LABEL, GROUP_LABEL, groupsIn, offeredTo, type Drink, type DrinkGroup } from "@/lib/coffee/menu";
import { monthName, resetDay } from "@/lib/coffee/setup";
import type { CoffeeMe } from "@/lib/coffee/types";
import { DrinkPhoto } from "./CurrentOrder";
import css from "./coffee.module.css";

const GROUP_ICON: Record<DrinkGroup, typeof Coffee> = { kopi: Coffee, "non-kopi": CupSoda };

/**
 * Menu: what is left of this month's quota, and the drinks of "Menu biasa" (`menu`, in the
 * pengelola's order; the ones shown and ticked for the regular menu). A tab is drawn for each kind
 * that has a drink there. Tapping a drink opens it.
 */
export function MenuScreen({ me, menu, note, onNote, onPick }: { me: CoffeeMe; menu: readonly Drink[]; note?: string; onNote?: () => void; onPick: (drink: Drink) => void }) {
  const [picked, setGroup] = useState<DrinkGroup>("kopi");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const listed = offeredTo(menu, "klaim");
  // Only the kinds that have a drink (both while the menu is empty, so the screen keeps its shape).
  const present = groupsIn(listed);
  const groups: readonly DrinkGroup[] = present.length ? present : DRINK_GROUPS;
  const group = groups.includes(picked) ? picked : groups[0];
  const drinks = listed.filter(drink => drink.group === group);
  // One Tab stop for the kinds; the arrows move between them.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (groups.indexOf(group) + (event.key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length;
    setGroup(groups[next]);
    tabs.current[next]?.focus();
  };
  return (
    <>
      <section className={css.hello}>
        <p className={css.muted}>{GROUP_LABEL[me.group]} · {monthName(me.month)}</p>
        <h1>Halo, {me.name}</h1>
        <div className={css.quota}>
          {me.quota > 0 && me.quota <= 8 && (
            <span className={css.dots} aria-hidden>
              {Array.from({ length: me.quota }, (_, index) => <span key={index} data-on={index < me.left || undefined} />)}
            </span>
          )}
          <span><strong>Sisa {me.left} dari {me.quota}</strong> klaim bulan ini</span>
        </div>
      </section>

      {note && (
        <section className={css.notice} data-tone="info" role="status">
          <Info aria-hidden size={20} />
          <span>{note}</span>
          {onNote && <button type="button" className={css.iconButton} aria-label="Tutup pesan" onClick={onNote}><X aria-hidden size={20} /></button>}
        </section>
      )}

      {me.left === 0 && (
        <section className={css.notice} data-tone="wait">
          <CircleAlert aria-hidden size={20} />
          <span><strong>Jatah bulan ini sudah habis</strong>Jatah kembali {resetDay(me.month)}. Menu tetap bisa dilihat.</span>
        </section>
      )}

      <div className={css.segmented} data-count={groups.length} role="tablist" aria-label="Jenis minuman" onKeyDown={onKey}>
        {groups.map((key, index) => {
          const Icon = GROUP_ICON[key];
          return (
            <button key={key} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`kopi-tab-${key}`} aria-controls="kopi-daftar"
              aria-selected={group === key} tabIndex={group === key ? 0 : -1} onClick={() => setGroup(key)}><Icon aria-hidden size={18} />{DRINK_GROUP_LABEL[key]}</button>
          );
        })}
      </div>

      {/* The panel wraps the list: a list that is itself the tabpanel loses its list role (and the count of drinks). */}
      <div id="kopi-daftar" role="tabpanel" aria-labelledby={`kopi-tab-${group}`}>
      <ul className={css.grid}>
        {drinks.map(drink => (
          <li key={drink.slug}>
            <button type="button" className={css.card} onClick={() => onPick(drink)}>
              <DrinkPhoto src={drink.photo} size={240} fill group={drink.group} />
              <strong>{drink.name}</strong>
              <span>{drink.description}</span>
            </button>
          </li>
        ))}
      </ul>
      {!drinks.length && <p className={css.muted}>Belum ada minuman {group === "kopi" ? "kopi" : "non-kopi"} di menu.</p>}
      </div>
    </>
  );
}
