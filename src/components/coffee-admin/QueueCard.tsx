"use client";

import { useState } from "react";
import { Check, Clock, Copy, ExternalLink, User, Users, X } from "lucide-react";
import { orderText } from "@/lib/coffee/copy-text";
import { GROUP_LABEL, OTHER_DRINK, drinkLabel, optionsLabel } from "@/lib/coffee/menu";
import { wibClock } from "@/lib/coffee/quota";
import type { QueueOrder } from "@/lib/coffee/types";
import { JUMPSTART_URL, coffeePath } from "@/lib/routes";
import { copyText, drinkCount, orderNumber, waited } from "./format";
import css from "./coffee-admin.module.css";

/** The quota as dots, up to eight; a larger quota reads as numbers only. */
export function Dots({ used, quota }: { used: number; quota: number }) {
  if (quota < 1 || quota > 8) return null;
  return (
    <span className={css.dots} role="img" aria-label={`${used} dari ${quota} terpakai`}>
      {Array.from({ length: quota }, (_, index) => <span key={index} data-on={index < used ? "true" : undefined} />)}
    </span>
  );
}

/**
 * One waiting order. A claim: the drink, who asks, and where it stands in their monthly quota. A
 * meeting: the room, the PIC, the guest, and each line marked Tamu or Tim · rapat. The pengelola
 * copies the details, buys by hand in JumpStart (a new tab), then marks it done or refuses it.
 */
export function QueueCard({ order, now, phone, onFinish, onRefuse }: {
  order: QueueOrder; now: number; phone: boolean; onFinish: (order: QueueOrder) => void; onRefuse: (order: QueueOrder) => void;
}) {
  // The browser may refuse the clipboard (no permission): the button says so instead of doing nothing.
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const copy = async () => {
    setCopied((await copyText(orderText(order))) ? "ok" : "fail");
    window.setTimeout(() => setCopied(""), 2000);
  };
  const claim = order.kind === "klaim";
  const item = order.items[0];
  const titleId = `q-${order.id}`;
  return (
    <article className={css.card} aria-labelledby={titleId}>
      <div className={css.cardHead}>
        <span className={css.kind} data-kind={order.kind}>{claim ? <User size={16} aria-hidden /> : <Users size={16} aria-hidden />}{claim ? "Klaim" : "Rapat"}</span>
        <span className={css.cardNo}>{orderNumber(order)}</span>
        <span className={css.waiting}><Clock size={16} aria-hidden />{phone ? "" : "Diproses · "}menunggu {waited(order.orderedAt, now)}</span>
      </div>
      {claim ? (
        <div className={css.claimBody}>
          {item && item.slug !== OTHER_DRINK
            // eslint-disable-next-line @next/next/no-img-element -- a small static photo of public/coffee/drinks
            ? <img src={coffeePath.photo(item.slug)} alt="" width={64} height={64} loading="lazy" className={css.thumb} />
            : <span className={css.thumb} />}
          <div className={css.grow}>
            <h2 id={titleId}>{item ? drinkLabel(item.slug, item.other) : "Minuman"}</h2>
            {item && <p className={css.optionsLine}>{optionsLabel(item.temperature, item.sugar, item.ice)}</p>}
            <p className={css.meta}>
              <strong>{order.person.name}</strong>
              {[order.person.group ? GROUP_LABEL[order.person.group] : "", order.person.position, order.person.bu].filter(Boolean).map(text => ` · ${text}`).join("")}
            </p>
          </div>
          {order.claimNo && order.quota ? (
            <div className={css.quotaBox}>
              <Dots used={order.claimNo} quota={order.quota} />
              <span>Klaim ke-{order.claimNo} dari {order.quota}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={css.meetingBody}>
          <h2 id={titleId}>{order.room || "Tanpa ruangan"} · {drinkCount(order)} minuman</h2>
          <p className={css.meta}>
            PIC <strong>{order.person.name}</strong>
            {order.guest && <> · {order.guest}</>}{order.guestCount ? <> · {order.guestCount} tamu</> : null}
            {" "}· dikirim {order.sentBy} {wibClock(order.orderedAt).replace(":", ".")}
          </p>
          <ul className={css.lines}>
            {order.items.map(line => (
              <li key={line.id}>
                <span className={css.lineFor} data-for={line.for}>{line.for === "tamu" ? `Tamu${line.guestName ? ` · ${line.guestName}` : ""}` : "Tim · rapat"}</span>
                <span className={css.qty}>{line.qty}×</span>
                <span className={css.grow}><strong>{drinkLabel(line.slug, line.other)}</strong> · {optionsLabel(line.temperature, line.sugar, line.ice)}</span>
                {line.person && <span className={css.linePerson}>{line.person.name}</span>}
              </li>
            ))}
          </ul>
          <p className={css.note}>Tidak memakai jatah. Minuman tim dicatat atas nama orangnya.</p>
        </div>
      )}
      <div className={css.actions}>
        <button type="button" className={css.secondary} onClick={() => void copy()}>
          {copied === "ok" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
          <span aria-live="polite">{copied === "ok" ? "Tersalin" : copied === "fail" ? "Gagal salin" : phone ? "Salin" : "Salin rincian"}</span>
        </button>
        <a className={css.secondary} href={JUMPSTART_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={18} aria-hidden />{phone ? "JumpStart" : "Buka JumpStart"}<span className={css.srOnly}> (tab baru)</span>
        </a>
        <span className={`${css.grow} ${css.desktopOnly}`} />
        <button type="button" className={css.dangerText} onClick={() => onRefuse(order)}>{phone && <X size={18} aria-hidden />}Tolak</button>
        <button type="button" className={css.primary} onClick={() => onFinish(order)}><Check size={18} aria-hidden />Selesai diproses</button>
      </div>
    </article>
  );
}
