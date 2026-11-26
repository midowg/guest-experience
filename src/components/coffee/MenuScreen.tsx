"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, Coffee, CupSoda, Info, X } from "lucide-react";
import { DRINKS, GROUP_LABEL, type Drink, type DrinkGroup } from "@/lib/coffee/menu";
import { monthName, resetDay } from "@/lib/coffee/setup";
import type { CoffeeMe } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import css from "./coffee.module.css";

const GROUPS: { key: DrinkGroup; label: string; Icon: typeof Coffee }[] = [{ key: "kopi", label: "Kopi", Icon: Coffee }, { key: "non-kopi", label: "Non-kopi", Icon: CupSoda }];

/** Menu: what is left of this month's quota, and the drinks. Tapping one opens its options. */
export function MenuScreen({ me, note, onNote, onPick }: { me: CoffeeMe; note?: string; onNote?: () => void; onPick: (drink: Drink) => void }) {
  const [group, setGroup] = useState<DrinkGroup>("kopi");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const drinks = DRINKS.filter(drink => drink.group === group);
  // One Tab stop for the two kinds; the arrows move between them.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = group === "kopi" ? 1 : 0;
    setGroup(GROUPS[next].key);
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

      <div className={css.segmented} role="tablist" aria-label="Jenis minuman" onKeyDown={onKey}>
        {GROUPS.map(({ key, label, Icon }, index) => (
          <button key={key} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`kopi-tab-${key}`} aria-controls="kopi-daftar"
            aria-selected={group === key} tabIndex={group === key ? 0 : -1} onClick={() => setGroup(key)}><Icon aria-hidden size={18} />{label}</button>
        ))}
      </div>

      {/* The panel wraps the list: a list that is itself the tabpanel loses its list role (and the count of drinks). */}
      <div id="kopi-daftar" role="tabpanel" aria-labelledby={`kopi-tab-${group}`}>
      <ul className={css.grid}>
        {drinks.map(drink => (
          <li key={drink.slug}>
            <button type="button" className={css.card} onClick={() => onPick(drink)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small local photos, sized here */}
              <img src={coffeePath.photo(drink.slug)} alt="" width={240} height={240} loading="lazy" />
              <strong>{drink.name}</strong>
              <span>{drink.description}</span>
            </button>
          </li>
        ))}
      </ul>
      </div>
    </>
  );
}
