"use client";

import { ClipboardList } from "lucide-react";
import { drinkLabel, optionsLabel } from "@/lib/coffee/menu";
import type { MyOrder } from "@/lib/coffee/types";
import { CurrentOrder, DrinkPhoto } from "./CurrentOrder";
import { HISTORY_PILL, clock, dayShort } from "./format";
import css from "./coffee.module.css";

/**
 * Pesanan saya: every claim that still waits is shown in full (more than one may wait while the
 * quota lasts, and each can be cancelled); with none waiting, the newest claim. The rest is
 * "Sebelumnya", newest first.
 */
export function OrdersScreen({ orders, cancelling, onCancel, onMenu }: {
  orders: MyOrder[]; cancelling: ReadonlySet<string>; onCancel: (order: MyOrder) => void; onMenu: () => void;
}) {
  if (!orders.length) return (
    <section className={css.emptyState}>
      <ClipboardList aria-hidden size={32} />
      <h1>Belum ada pesanan</h1>
      <p>Pilih minuman di Menu, lalu ajukan klaim.</p>
      <button type="button" className={css.secondary} onClick={onMenu}>Lihat menu</button>
    </section>
  );
  const waiting = orders.filter(order => order.status === "diproses");
  const shown = waiting.length ? waiting : [orders[0]];
  const rest = orders.filter(order => !shown.includes(order));
  return (
    <>
      {shown.map((order, index) => <CurrentOrder key={order.id} order={order} first={index === 0} cancelling={cancelling.has(order.id)} onCancel={onCancel} onMenu={onMenu} />)}
      {rest.length > 0 && (
        <section>
          <h2 className={css.sectionTitle}>Sebelumnya</h2>
          <ul className={css.history}>
            {rest.map(order => (
              <li key={order.id}>
                <DrinkPhoto slug={order.slug} size={48} />
                <span><strong>{drinkLabel(order.slug, order.other)}</strong><span>{dayShort(order.orderedAt)} · {clock(order.orderedAt)} · {optionsLabel(order.temperature, order.sugar, order.ice)}</span></span>
                <span className={css.pill} data-tone={HISTORY_PILL[order.status].tone}>{HISTORY_PILL[order.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
