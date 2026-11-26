"use client";

import { Check, CircleAlert, Coffee, MapPin, Plus } from "lucide-react";
import { drinkLabel } from "@/lib/coffee/menu";
import type { GaState, MeetingOrder } from "@/lib/coffee/types";
import { clock } from "../format";
import { FloorMap } from "./FloorMap";
import { STATUS, canAddTo, countLabel, doneLine, roomStatuses, statusOf } from "./model";
import css from "./ga.module.css";

/**
 * Beranda GA: today's meeting orders (whoever sent them: the tablet is shared), and the floor plan
 * with the rooms that have orders, each in words as well as colour.
 */
export function Home({ orders, rooms, onNew, onMore, onOpen }: {
  orders: MeetingOrder[]; rooms: GaState["rooms"]; onNew: () => void; onMore: (order: MeetingOrder) => void; onOpen: (order: MeetingOrder) => void;
}) {
  const date = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(new Date());
  const statuses = roomStatuses(orders, rooms);
  const waiting = orders.filter(order => order.status === "diproses").length;
  const listed = new Set(rooms.map(room => room.name));
  const others = [...new Set(orders.filter(order => !order.spot && !listed.has(order.room)).map(order => order.room))];
  return (
    <div className={css.home}>
      <section className={css.homeMain}>
        <div className={css.pageHead}>
          <div>
            <p className={css.muted}>{date}</p>
            <h1>Pesanan rapat hari ini</h1>
            <p className={css.muted}>{orders.length} pesanan · {waiting} sedang diproses</p>
          </div>
          <button type="button" className={`${css.primary} ${css.big}`} onClick={onNew}><Plus aria-hidden size={24} />Pesanan baru</button>
        </div>
        {orders.length === 0 ? (
          <div className={css.emptyState}>
            <Coffee aria-hidden size={32} />
            <h2>Belum ada pesanan rapat hari ini</h2>
            <p>Ketuk Pesanan baru saat masuk ke ruang rapat.</p>
          </div>
        ) : (
          <ul className={css.cards}>
            {orders.map(order => <MeetingCard key={order.id} order={order} more={canAddTo(order, orders)} onMore={() => onMore(order)} onOpen={() => onOpen(order)} />)}
          </ul>
        )}
      </section>
      <aside className={css.homeSide} aria-labelledby="ga-denah-judul">
        <h2 id="ga-denah-judul">Ruangan dengan pesanan</h2>
        <FloorMap rooms={rooms} statuses={statuses} label="Denah kantor: ruangan dengan pesanan hari ini" />
        <ul className={css.legend} aria-label="Keterangan warna">
          <li><span className={css.swatch} data-tone="wait" aria-hidden />Diproses</li>
          <li><span className={css.swatch} data-tone="ok" aria-hidden />Selesai</li>
          <li><span className={css.swatch} data-tone="no" aria-hidden />Ditolak</li>
          <li><span className={css.swatch} data-tone="machine" aria-hidden />Mesin kopi</li>
        </ul>
        <ul className={css.roomList} aria-label="Status per ruangan">
          {[...rooms.map(room => room.name), ...others].map(name => {
            const spot = rooms.find(room => room.name === name)?.spot;
            const status = spot ? statuses[spot] : statusOf(orders.filter(order => order.room === name));
            return (
              <li key={name}>
                <span>{name}</span>
                {status ? <span className={css.pill} data-tone={STATUS[status].tone}>{STATUS[status].label}</span> : <span className={css.mutedSmall}>Tidak ada</span>}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

function MeetingCard({ order, more, onMore, onOpen }: { order: MeetingOrder; more: boolean; onMore: () => void; onOpen: () => void }) {
  const status = STATUS[order.status];
  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        <span className={css.cardRoom}><MapPin aria-hidden size={18} /><strong>{order.room}</strong></span>
        <span className={css.pill} data-tone={status.tone}>{status.label}</span>
      </div>
      <dl className={css.facts}>
        <div><dt>PIC</dt><dd>{order.pic.name}</dd></div>
        {(order.guest || order.guestCount) && <div><dt>Tamu</dt><dd>{[order.guest, order.guestCount ? `${order.guestCount} orang` : ""].filter(Boolean).join(" · ")}</dd></div>}
        <div><dt>Minuman</dt><dd>{countLabel(order.items)}</dd></div>
      </dl>
      <ul className={css.mini} aria-label="Rincian minuman">
        {order.items.map(item => <li key={item.id}>{item.qty}× {drinkLabel(item.slug, item.other)}{item.temperature === "es" ? " (Es)" : ""}</li>)}
      </ul>
      <p className={css.cardStatus} data-tone={status.tone}>
        {order.status === "selesai" ? <Check aria-hidden size={16} /> : order.status === "diproses" ? <span className={css.dot} aria-hidden /> : <CircleAlert aria-hidden size={16} />}
        {doneLine(order)}
      </p>
      {order.status === "ditolak" && order.rejectNote && <p className={css.cardReason}>{order.rejectNote}</p>}
      <div className={css.cardFoot}>
        <span className={css.mutedSmall}>#{order.no} · {clock(order.orderedAt)}{order.round > 1 ? ` · tambahan ke-${order.round - 1}` : ""}</span>
        <span className={css.row}>
          <button type="button" className={css.ghost} onClick={onOpen} aria-label={`Status #${order.no} ${order.room}`}>Status</button>
          <button type="button" className={css.secondary} onClick={onMore} aria-label={`${more ? "Tambah lagi" : "Pesan pengganti"} untuk #${order.no} ${order.room}`}><Plus aria-hidden size={18} />{more ? "Tambah lagi" : "Pesan pengganti"}</button>
        </span>
      </div>
    </li>
  );
}
