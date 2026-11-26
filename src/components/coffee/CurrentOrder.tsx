"use client";

import { Check, Coffee, Info } from "lucide-react";
import { drinkBySlug, drinkLabel, optionsLabel } from "@/lib/coffee/menu";
import type { MyOrder } from "@/lib/coffee/types";
import { coffeePath } from "@/lib/routes";
import { STATUS_PILL, STATUS_TITLE, clock, dayShort } from "./format";
import { PantryMap } from "./PantryMap";
import css from "./coffee.module.css";

/** The drink's photo; a drink typed in by the pengelola ("Lainnya") has none. */
export function DrinkPhoto({ slug, size }: { slug: string; size: number }) {
  if (!drinkBySlug(slug)) return <span className={css.noPhoto} style={{ width: size, height: size }} aria-hidden><Coffee size={Math.round(size / 2.4)} /></span>;
  // eslint-disable-next-line @next/next/no-img-element -- small local photos, sized here
  return <img src={coffeePath.photo(slug)} alt="" width={size} height={size} loading="lazy" />;
}

/**
 * One claim in full: where it stands (Diajukan → Diproses → Ambil di mesin pantry, with who
 * processed it), the note when it was refused, the pantry on the floor plan when it is ready, and
 * "Batalkan pengajuan" while it still waits. `first`: the screen's main heading.
 */
export function CurrentOrder({ order, first, cancelling, onCancel, onMenu }: {
  order: MyOrder; first: boolean; cancelling: boolean; onCancel: (order: MyOrder) => void; onMenu: () => void;
}) {
  const Heading = first ? "h1" : "h2";
  const waiting = order.status === "diproses", ready = order.status === "selesai" && !order.manual;
  const who = order.processedLabel || "pengelola";
  const pill = order.manual && order.status === "selesai" ? { label: "Selesai", tone: "ok" } : STATUS_PILL[order.status];
  const steps = [
    { label: "Diajukan", note: clock(order.orderedAt), done: true },
    { label: "Diproses", note: waiting ? "Menunggu pengelola" : order.processedAt ? `Selesai oleh ${who} · ${clock(order.processedAt)}` : "", done: ready },
    { label: "Ambil di mesin pantry", note: ready ? "Sekarang" : "", done: false },
  ];

  return (
    <section className={css.current} aria-label={`${drinkLabel(order.slug, order.other)}, ${pill.label}`}>
      <span className={css.pill} data-tone={pill.tone}>{pill.label}</span>
      <Heading>{order.manual && order.status === "selesai" ? "Klaim dicatat pengelola" : STATUS_TITLE[order.status]}</Heading>

      <div className={css.orderCard}>
        <DrinkPhoto slug={order.slug} size={64} />
        <span>
          <strong>{drinkLabel(order.slug, order.other)}</strong>
          <span>{optionsLabel(order.temperature, order.sugar, order.ice)}</span>
          <span>#{order.no}{order.claimNo ? ` · klaim ke-${order.claimNo}` : ""}</span>
        </span>
      </div>

      {order.status === "ditolak" && (
        <div className={css.reason}>
          <strong>Catatan dari {who}</strong>
          <p>{order.rejectNote}</p>
          <span>Jatah kamu tidak berkurang.</span>
        </div>
      )}

      {(waiting || ready) && (
        <ol className={css.timeline} data-ready={ready || undefined}>
          {steps.map((item, index) => (
            <li key={item.label} data-done={item.done || undefined} data-now={(waiting ? index === 1 : index === 2) || undefined}>
              <span className={css.node} aria-hidden>{item.done ? <Check size={14} /> : null}</span>
              <span><strong>{item.label}</strong>{item.note && <span>{item.note}</span>}</span>
            </li>
          ))}
        </ol>
      )}

      {ready && (
        <div className={css.location}>
          <PantryMap />
          <span><span className={css.muted}>Lokasi mesin</span><strong>Pantry, lantai ini</strong>{order.temperature === "es" && <span>Es ditambahkan tim GA di pantry.</span>}</span>
        </div>
      )}

      {waiting && (
        <div className={css.infoBox}>
          <Info aria-hidden size={20} />
          <span><strong>Siapa yang memproses?</strong>Pengajuanmu masuk ke HR dan admin yang punya akses Werkudara Coffee. Siapa pun yang lebih dulu membuka akan membelikannya. Status di sini berubah sendiri.</span>
        </div>
      )}

      {order.manual && order.status === "selesai" && (
        <div className={css.infoBox}>
          <Info aria-hidden size={20} />
          <span><strong>Dicatat oleh {who}</strong>{order.processedAt ? `${dayShort(order.processedAt)} · ${clock(order.processedAt)}. ` : ""}Klaim ini dihitung dalam jatah bulanmu.</span>
        </div>
      )}

      <div className={css.actions}>
        {waiting
          ? <button type="button" className={css.dangerText} aria-disabled={cancelling || undefined} onClick={() => { if (!cancelling) onCancel(order); }}>{cancelling ? "Membatalkan…" : "Batalkan pengajuan"}</button>
          : <button type="button" className={ready ? css.secondary : css.primary} onClick={onMenu}>{order.status === "ditolak" ? "Pilih minuman lain" : "Kembali ke menu"}</button>}
      </div>
    </section>
  );
}
