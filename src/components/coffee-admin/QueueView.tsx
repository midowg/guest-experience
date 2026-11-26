"use client";

import { Inbox, PenLine } from "lucide-react";
import { ConsoleButton, PageHeader } from "@/components/console";
import { wibClock } from "@/lib/coffee/quota";
import { STATUS_LABEL, type QueueOrder, type QueueState } from "@/lib/coffee/types";
import type { CancelTarget } from "./api";
import { STATUS_TONE, canCancel, canUndo, cancelOfOrder, orderTitle } from "./format";
import { QueueCard } from "./QueueCard";
import { coffeeAdminSection } from "./sections";
import css from "./coffee-admin.module.css";

/**
 * Antrean: what waits (oldest first), today's numbers, and the last six processed. New orders come
 * in without a reload. "Baru diproses" offers Urungkan to whoever processed the order, for five
 * minutes, and Batalkan catatan on a record made by hand.
 */
export function QueueView({ queue, error, now, phone, actorName, undoing, onRetry, onFinish, onRefuse, onUndo, onManual, onCancel }: {
  queue: QueueState | null; error: string; now: number; phone: boolean; actorName: string; undoing: ReadonlySet<string>;
  onRetry: () => void; onFinish: (order: QueueOrder) => void; onRefuse: (order: QueueOrder) => void; onUndo: (order: QueueOrder) => void; onManual: () => void;
  onCancel: (target: CancelTarget) => void;
}) {
  const section = coffeeAdminSection("antrean");
  return (
    <>
      <PageHeader
        title={section.label}
        subtitle={phone ? "Terlama di atas. Beli di JumpStart, lalu tandai selesai." : section.summary}
        actions={<ConsoleButton className={`${css.desktopOnly} ${css.tall}`} icon={<PenLine size={18} aria-hidden />} onClick={onManual}>Catat manual</ConsoleButton>}
      />
      {error && (
        <div className={css.banner} role="status">
          <span>{queue ? "Antrean belum bisa diperbarui. Yang tampil mungkin sudah berubah." : error}</span>
          <button type="button" className={css.textButton} onClick={onRetry}>Coba lagi</button>
        </div>
      )}
      <div className={css.queueLayout}>
        <section aria-label="Pesanan menunggu" className={css.queue} aria-busy={!queue} tabIndex={-1} data-coffee-focus>
          {!queue && !error && <><span className={css.skeleton} style={{ height: 168 }} /><span className={css.skeleton} style={{ height: 168 }} /></>}
          {queue && queue.waiting.length === 0 && (
            <div className={css.empty}>
              <Inbox size={32} aria-hidden />
              <h2>Antrean kosong</h2>
              <p>Pesanan baru muncul di sini tanpa memuat ulang halaman.</p>
            </div>
          )}
          {queue?.waiting.map(order => <QueueCard key={order.id} order={order} now={now} phone={phone} onFinish={onFinish} onRefuse={onRefuse} />)}
        </section>

        <aside className={css.aside} aria-label="Ringkasan hari ini">
          <section className={`${css.panel} ${css.tallyPanel}`}>
            <h2>Hari ini</h2>
            {queue ? (
              <dl className={css.tally}>
                <div data-tone="wait"><dt>Diproses</dt><dd>{queue.today.diproses}</dd></div>
                <div data-tone="ok"><dt>Selesai</dt><dd>{queue.today.selesai}</dd></div>
                <div data-tone="no"><dt>Ditolak</dt><dd>{queue.today.ditolak}</dd></div>
              </dl>
            ) : <span className={`${css.skeleton} ${css.grow}`} style={{ height: 56 }} />}
            <p className={`${css.small} ${css.desktopOnly}`}>Dihitung per pesanan. Kamu masuk sebagai {actorName}.</p>
          </section>
          <section className={`${css.panel} ${css.recentPanel}`}>
            <h2>Baru diproses</h2>
            {!queue ? <span className={css.skeleton} style={{ height: 96 }} /> : queue.recent.length === 0 ? <p className={css.small}>Belum ada.</p> : (
              <ul className={css.recent}>
                {queue.recent.map(order => (
                  <li key={order.id}>
                    <span className={css.pill} data-tone={order.manual ? "off" : STATUS_TONE[order.status]}>{order.manual ? "Dicatat manual" : STATUS_LABEL[order.status]}</span>
                    <span className={css.recentText}>
                      <strong>{orderTitle(order)}</strong>
                      <span>{order.kind === "klaim" ? "Klaim" : "Rapat"}{order.processed ? ` · ${order.processed.label} · ${wibClock(order.processed.at).replace(":", ".")}` : ""}</span>
                    </span>
                    {canUndo(order, now) && (
                      <button type="button" className={css.textButton} disabled={undoing.has(order.id)} onClick={() => onUndo(order)}>
                        {undoing.has(order.id) ? "Mengurungkan…" : "Urungkan"}<span className={css.srOnly}> {orderTitle(order)}</span>
                      </button>
                    )}
                    {canCancel(order) && (
                      <button type="button" className={css.textButton} onClick={() => onCancel(cancelOfOrder(order))}>
                        Batalkan catatan<span className={css.srOnly}> {orderTitle(order)}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
