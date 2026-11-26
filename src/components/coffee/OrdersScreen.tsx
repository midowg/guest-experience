"use client";

import { ClipboardList } from "lucide-react";
import { drinkName, optionsTail } from "@/lib/coffee/menu";
import { wibDay } from "@/lib/coffee/quota";
import type { MyOrder } from "@/lib/coffee/types";
import { CurrentOrder, DrinkPhoto } from "./CurrentOrder";
import { HISTORY_PILL, clock, dayShort } from "./format";
import css from "./coffee.module.css";

/**
 * Pesanan saya: every claim that still waits is shown in full (more than one may wait while the
 * quota lasts, and each can be cancelled); with none waiting, the newest claim when it was decided
 * today (`today`, the office's day in WIB). A claim done last week is not "ready now": it sits in
 * "Sebelumnya" with the rest, newest first, under an invitation to the menu.
 */
export function OrdersScreen({ orders, today, cancelling, onCancel, onMenu }: {
  orders: MyOrder[]; today: string; cancelling: ReadonlySet<string>; onCancel: (order: MyOrder) => void; onMenu: () => void;
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
  const newest = orders[0];
  const shown = waiting.length ? waiting : wibDay(newest.processedAt ?? newest.orderedAt) === today ? [newest] : [];
  const rest = orders.filter(order => !shown.includes(order));
  return (
    <>
      {shown.length === 0 && (
        <section className={css.invite}>
          <h1>Tidak ada pesanan hari ini</h1>
          <p>Pilih minuman di Menu, lalu ajukan klaim.</p>
          <button type="button" className={css.secondary} onClick={onMenu}>Lihat menu</button>
        </section>
      )}
      {shown.map((order, index) => <CurrentOrder key={order.id} order={order} first={index === 0} cancelling={cancelling.has(order.id)} onCancel={onCancel} onMenu={onMenu} />)}
      {rest.length > 0 && (
        <section>
          <h2 className={css.sectionTitle}>Sebelumnya</h2>
          <ul className={css.history}>
            {rest.map(order => (
              <li key={order.id}>
                <DrinkPhoto src={order.photo} size={48} />
                <span><strong>{drinkName(order)}</strong><span>{dayShort(order.orderedAt)} · {clock(order.orderedAt)}{optionsTail(order.temperature, order.sugar, order.ice)}</span></span>
                <span className={css.pill} data-tone={HISTORY_PILL[order.status].tone}>{HISTORY_PILL[order.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
