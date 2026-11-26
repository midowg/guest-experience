"use client";

import { Check, Info, Plus, X } from "lucide-react";
import { drinkName, optionsLabel } from "@/lib/coffee/menu";
import type { MeetingOrder } from "@/lib/coffee/types";
import { DrinkPhoto } from "../CurrentOrder";
import { clock } from "../format";
import { PantryMap } from "../PantryMap";
import { STATUS, countLabel, doneLine, lineTag } from "./model";
import { ScreenHead, useSettled } from "./parts";
import css from "./ga.module.css";

const TITLE = { diproses: "Pesanan terkirim", selesai: "Siap diambil di mesin pantry", ditolak: "Pesanan ditolak", batal: "Pesanan dibatalkan" } as const;

/**
 * Terkirim: what was sent, and where it stands (Dikirim → Diproses → Ambil di mesin pantry). The
 * status changes by itself while the screen is open. `more`: the meeting can still be added to;
 * otherwise the same room and PIC start a replacement order. A guest's own name from the menu
 * book comes back with the order ("Tamu · Budi"), so it also shows after a reload and on another tablet.
 */
export function Sent({ order, more, onMore, onHome }: { order: MeetingOrder; more: boolean; onMore: () => void; onHome: () => void }) {
  const settled = useSettled(order.id);
  const status = STATUS[order.status];
  const ice = order.items.filter(item => item.temperature === "es").reduce((sum, item) => sum + item.qty, 0);
  const done = order.status === "selesai", refused = order.status === "ditolak" || order.status === "batal";
  const who = order.processedLabel || "pengelola";
  const steps = [
    { label: "Dikirim", note: `${clock(order.orderedAt)}${order.sentBy ? ` · oleh ${order.sentBy}` : ""}`, done: true, failed: false },
    { label: order.status === "ditolak" ? "Ditolak" : order.status === "batal" ? "Dibatalkan" : "Diproses", note: order.status === "diproses" ? "Menunggu pengelola (HR atau admin)" : doneLine(order), done, failed: refused },
    { label: "Ambil di mesin pantry", note: done ? `Sekarang${ice ? ` · tambahkan es untuk ${ice} minuman Es` : ""}` : "", done: false, failed: false },
  ];
  return (
    <div className={css.screen}>
      <ScreenHead title={TITLE[order.status]} sub={`#${order.no} · ${order.room}`} onBack={onHome} backLabel="Beranda" />
      <div className={css.sentGrid}>
        <section className={css.panelCard} aria-labelledby="ga-ringkasan-judul">
          <div className={css.cardHead}>
            <h2 id="ga-ringkasan-judul">Ringkasan</h2>
            <span className={css.pill} data-tone={status.tone}>{status.label}</span>
          </div>
          <dl className={css.facts}>
            <div><dt>Ruangan</dt><dd>{order.room}</dd></div>
            <div><dt>PIC</dt><dd>{order.pic.name}</dd></div>
            {(order.guest || order.guestCount) && <div><dt>Tamu</dt><dd>{[order.guest, order.guestCount ? `${order.guestCount} orang` : ""].filter(Boolean).join(" · ")}</dd></div>}
            {order.round > 1 && <div><dt>Putaran</dt><dd>Tambahan ke-{order.round - 1}</dd></div>}
          </dl>
          <ul className={css.summary}>
            {order.items.map(item => (
              <li key={item.id}>
                <DrinkPhoto src={item.photo} size={44} />
                <span className={css.grow}>
                  <strong>{item.qty}× {drinkName(item)}</strong>
                  {optionsLabel(item.temperature, item.sugar, item.ice) && <span>{optionsLabel(item.temperature, item.sugar, item.ice)}</span>}
                </span>
                <span className={css.tag} data-for={item.for === "tim" ? "tim" : "tamu"}>{lineTag(item.for, item.for === "tim" ? item.person?.name : item.guestName)}</span>
              </li>
            ))}
          </ul>
          <p className={css.total}>{countLabel(order.items)}</p>
        </section>

        <section className={css.panelCard} aria-labelledby="ga-progres-judul">
          <h2 id="ga-progres-judul">Perkembangan</h2>
          <ol className={css.timeline} aria-live="polite">
            {steps.map((step, index) => {
              const now = order.status === "diproses" ? index === 1 : done ? index === 2 : false;
              return (
                <li key={step.label} data-done={step.done || undefined} data-now={now || undefined} data-failed={step.failed || undefined} data-ready={done || undefined}>
                  <span className={css.node} aria-hidden>{step.done ? <Check size={14} /> : step.failed ? <X size={14} /> : null}</span>
                  <span><strong>{step.label}</strong>{step.note && <span>{step.note}</span>}</span>
                </li>
              );
            })}
          </ol>
          {order.status === "ditolak" && (
            <div className={css.reason}>
              <strong>Catatan dari {who}</strong>
              <p>{order.rejectNote}</p>
              <span>Kabari PIC, lalu buat pesanan pengganti.</span>
            </div>
          )}
          {done && (
            <div className={css.location}>
              <PantryMap />
              <span><span className={css.mutedSmall}>Lokasi mesin</span><strong>Pantry, lantai ini</strong>
                <span>{ice ? `${ice} minuman Es: tambahkan es di pantry sebelum diantar.` : "Semua panas, langsung antar ke ruangan."}</span></span>
            </div>
          )}
          {order.status === "diproses" && (
            <p className={css.infoBox}><Info aria-hidden size={20} /><span>Pesanan masuk ke semua pengelola WG Coffee. Siapa pun yang lebih dulu membuka akan memprosesnya, lalu layar ini berubah.</span></p>
          )}
          <div className={css.sentActions}>
            <button type="button" className={`${css.primary} ${css.big}`} onClick={() => { if (settled()) onMore(); }}><Plus aria-hidden size={22} />{more ? "Tambah lagi untuk rapat ini" : "Buat pesanan pengganti"}</button>
            <button type="button" className={css.secondary} onClick={() => { if (settled()) onHome(); }}>Ke beranda</button>
          </div>
        </section>
      </div>
    </div>
  );
}
