"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Ban, Coins, MoreVertical, Ticket, Undo2 } from "lucide-react";
import { ConsoleButton, Pill } from "@/components/console";
import type { ConsoleTone } from "@/components/console/types";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { vouchersApi } from "@/lib/routes";
import { MIGRATION_WELLBEING_VOUCHERS, claimHolds, type TicketStatus, type VoucherAction } from "@/lib/wellbeing/rules";
import type { WbVoucher, WbVoucherPerson, WbVouchersAdmin } from "@/lib/wellbeing/types";
import css from "./admin-table.module.css";
import list from "./reroll-vouchers.module.css";

/*
 * Super admin → Voucher re-roll (18 Nov 2026, uji coba): every re-roll voucher from WLM's Hadiah, with
 * where it came from and what it did to the card. While it is a trial, mistakes are corrected here:
 * cancel an unused voucher (points back), give a used voucher's points back, put the card back as it
 * was, or give a voucher by hand without points.
 */

type Filter = "all" | TicketStatus;
const FILTERS: [Filter, string][] = [["all", "Semua"], ["open", "Belum dipakai"], ["used", "Sudah dipakai"], ["revoked", "Dibatalkan"]];
const statusLabel: Record<TicketStatus, string> = { open: "Belum dipakai", used: "Sudah dipakai", revoked: "Dibatalkan" };
const statusTone: Record<TicketStatus, ConsoleTone> = { open: "blue", used: "ok", revoked: "neutral" };
const actionLabel: Record<VoucherAction, string> = { revoke: "Batalkan voucher", refund: "Kembalikan poin", restore: "Kembalikan kartu" };
const points = (value: number) => value.toLocaleString("id-ID");
const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word typed is found in the name, nama panggilan or department. */
export function findVoucherPeople(people: WbVoucherPerson[], query: string, limit = 8): WbVoucherPerson[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return people.filter(person => words.every(word => fold([person.name, person.nickname, person.department].join(" ")).includes(word))).slice(0, limit);
}

/** What one voucher may still have done to it. */
export function voucherActions(voucher: WbVoucher): VoucherAction[] {
  if (voucher.status === "open") return ["revoke"];
  if (voucher.status !== "used") return [];
  return [...(voucher.claim && claimHolds(voucher.claim.status) ? ["refund" as const] : []), ...(voucher.restorable ? ["restore" as const] : [])];
}

export function RerollVouchers({ initial }: { initial: WbVouchersAdmin }) {
  const [vouchers, setVouchers] = useState(initial.vouchers);
  const [filter, setFilter] = useState<Filter>("all");
  const [acting, setActing] = useState<{ voucher: WbVoucher; action: VoucherAction } | null>(null);
  const [reason, setReason] = useState("");
  const [giving, setGiving] = useState(false);
  const [who, setWho] = useState("");
  const [person, setPerson] = useState<WbVoucherPerson | null>(null);
  const [legendary, setLegendary] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const shown = useMemo(() => filter === "all" ? vouchers : vouchers.filter(item => item.status === filter), [vouchers, filter]);
  const found = person ? [] : findVoucherPeople(initial.people, who);
  const legend = initial.legend;

  if (!initial.migrated) return <Notice tone="warning">Voucher re-roll menunggu migrasi {MIGRATION_WELLBEING_VOUCHERS}. Minta pemilik menjalankannya di Supabase SQL Editor.</Notice>;

  const put = (saved: WbVoucher) => setVouchers(list => list.some(item => item.id === saved.id) ? list.map(item => item.id === saved.id ? saved : item) : [saved, ...list]);
  const start = (voucher: WbVoucher, action: VoucherAction) => { setActing({ voucher, action }); setReason(""); setError(""); setMessage(""); setGiving(false); };

  async function act() {
    if (!acting) return;
    setBusy(true); setError("");
    try {
      const result = await adminRequest<WbVoucher>(vouchersApi(acting.voucher.id), { method: "POST", body: JSON.stringify({ action: acting.action, reason }) });
      put(result.data!); setMessage(result.message ?? "Tersimpan."); setActing(null);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }

  async function give() {
    if (!person) return setError("Pilih karyawan dari daftar.");
    setBusy(true); setError("");
    try {
      const result = await adminRequest<WbVoucher>(vouchersApi(), { method: "POST", body: JSON.stringify({ employeeId: person.id, legendary, note }) });
      put(result.data!); setMessage(result.message ?? "Voucher diberikan."); setGiving(false); setPerson(null); setWho(""); setNote(""); setLegendary(false);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }

  return <>
    {legend && <p className={css.muted} style={{ marginTop: 0 }}>
      {legend.name}: {legend.cards} kartu{legend.reserved ? ` + ${legend.reserved} voucher belum dipakai` : ""}{legend.cap === null ? " (tanpa batas)" : ` dari batas ${legend.cap}`}.
      Batasnya diatur di Admin WAM, Kartu.</p>}
    {message && <Notice tone="success">{message}</Notice>}
    {error && !acting && !giving && <Notice tone="error">{error}</Notice>}

    {acting && <section className={css.editor} aria-label={actionLabel[acting.action]}>
      <h3>{actionLabel[acting.action]}: {acting.voucher.employeeName}</h3>
      <p className={css.muted} style={{ margin: 0 }}>
        {acting.action === "revoke" && (acting.voucher.claim ? `Voucher tidak bisa dipakai lagi dan ${points(acting.voucher.claim.cost)} poin kembali ke saldonya. Alasannya tampil di Klaim saya.` : "Voucher tidak bisa dipakai lagi. Voucher ini diberikan tanpa poin.")}
        {acting.action === "refund" && acting.voucher.claim && `${points(acting.voucher.claim.cost)} poin kembali ke saldonya. Kartunya tidak berubah. Alasannya tampil di Klaim saya.`}
        {acting.action === "restore" && acting.voucher.before && `Kartunya kembali ke ${acting.voucher.before.figure} (${acting.voucher.before.tier}). Poin tidak berubah; kembalikan poin terpisah bila perlu.`}
      </p>
      {acting.action !== "restore" && <label className={css.finder} style={{ margin: 0 }}>
        <span className={css.finderLabel}>Alasan (dibaca karyawan)</span>
        <input className={css.search} value={reason} maxLength={300} onChange={event => setReason(event.target.value)} placeholder="mis. salah sistem, diganti voucher baru" autoFocus />
      </label>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className={css.buttons}>
        <ConsoleButton onClick={() => setActing(null)} disabled={busy}>Batal</ConsoleButton>
        <ConsoleButton variant="primary" onClick={() => void act()} disabled={busy || (acting.action !== "restore" && reason.trim().length < 2)}>{busy ? "Menyimpan…" : actionLabel[acting.action]}</ConsoleButton>
      </div>
    </section>}

    {giving ? <section className={css.editor} aria-label="Beri voucher">
      <h3>Beri voucher tanpa poin</h3>
      <div className={css.finder} style={{ margin: 0 }}>
        <label className={css.finderLabel} htmlFor="voucher-who">Karyawan</label>
        {person
          ? <div className={css.buttons} style={{ alignItems: "center" }}><span className={css.strong}>{person.name}</span><span className={css.muted}>{person.department}{person.hasCard ? "" : " · kartu tokoh belum keluar"}</span>
              <ConsoleButton onClick={() => { setPerson(null); setWho(""); }} disabled={busy}>Ganti</ConsoleButton></div>
          : <input id="voucher-who" className={css.search} value={who} onChange={event => setWho(event.target.value)} placeholder="Ketik nama, panggilan, atau departemen" autoFocus autoComplete="off" />}
        {found.length > 0 && <ul className={css.results}>
          {found.map(item => <li key={item.id}><button type="button" className={css.result} onClick={() => setPerson(item)}>
            <span className={css.resultText}><span className={css.strong}>{item.name}</span><span className={css.muted}>{[item.nickname && `Panggilan ${item.nickname}`, item.department].filter(Boolean).join(" · ")}</span></span>
            <span className={css.resultTag}>{item.hasCard ? "Pilih" : "Belum punya kartu"}</span>
          </button></li>)}
        </ul>}
      </div>
      <fieldset>
        <legend>Jenis voucher</legend>
        <label className={css.check}><input type="radio" name="voucher-kind" checked={!legendary} onChange={() => setLegendary(false)} />Re-roll biasa<small>Tokoh dan rarity diundi ulang.</small></label>
        <label className={css.check}><input type="radio" name="voucher-kind" checked={legendary} onChange={() => setLegendary(true)} />Re-roll Legendary<small>Tokoh diundi ulang, rarity pasti Legendary. Hanya bila tempat Legendary masih ada.</small></label>
      </fieldset>
      <label className={css.finder} style={{ margin: 0 }}>
        <span className={css.finderLabel}>Catatan (opsional)</span>
        <input className={css.search} value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="mis. pengganti voucher yang gagal" />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={css.buttons}>
        <ConsoleButton onClick={() => { setGiving(false); setError(""); }} disabled={busy}>Batal</ConsoleButton>
        <ConsoleButton variant="primary" onClick={() => void give()} disabled={busy || !person}>{busy ? "Memberikan…" : "Beri voucher"}</ConsoleButton>
      </div>
    </section> : !acting && <div className={css.buttons} style={{ marginBottom: 12 }}>
      <ConsoleButton variant="primary" onClick={() => { setGiving(true); setError(""); setMessage(""); }}>Beri voucher</ConsoleButton>
    </div>}

    <div className={css.toolbar} role="group" aria-label="Saring voucher">
      {FILTERS.map(([key, label]) => <ConsoleButton key={key} variant={filter === key ? "primary" : undefined} onClick={() => setFilter(key)} aria-pressed={filter === key}>
        {label} ({key === "all" ? vouchers.length : vouchers.filter(item => item.status === key).length})</ConsoleButton>)}
    </div>

    {shown.length === 0
      ? <p className={css.muted}>{vouchers.length ? "Tidak ada voucher di saringan ini." : "Belum ada voucher. Voucher muncul di sini saat karyawan mengklaim voucher re-roll di Hadiah WLM, atau saat Anda memberikannya."}</p>
      : <ul className={list.list}>{shown.map(voucher => <VoucherRow key={voucher.id} voucher={voucher} busy={busy} onAction={action => start(voucher, action)} />)}</ul>}
  </>;
}

const actionIcon: Record<VoucherAction, typeof Ban> = { revoke: Ban, refund: Coins, restore: Undo2 };

/** A small card: the figure on its persona's colour, framed in its rarity's colour. */
function MiniCard({ card, faded }: { card: NonNullable<WbVoucher["before"]>; faded?: boolean }) {
  const [light, deep] = card.colors ?? ["#3A6FBF", "#1B2C66"];
  return <figure className={`${list.card} ${faded ? list.faded : ""}`} style={{ background: `linear-gradient(160deg, ${light}, ${deep})`, borderColor: card.tierColor ?? "#fff" }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- figure pictures shipped with the app; next/image cannot help in this list */}
    {card.image ? <img src={card.image} alt="" loading="lazy" /> : <span aria-hidden>?</span>}
    <figcaption className="sr-only">{card.figure} ({card.tier})</figcaption>
  </figure>;
}

/**
 * One voucher (18 Nov 2026, the owner's request): the card before and after it was used, who has it,
 * where it came from, and its corrections behind a three-dot menu.
 */
function VoucherRow({ voucher, busy, onAction }: { voucher: WbVoucher; busy: boolean; onAction: (action: VoucherAction) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const actions = voucherActions(voucher);
  // Close the menu on a click elsewhere or Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const details = menu.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target instanceof Node && details.contains(event.target))) details.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return <li className={`${list.row} ${voucher.status === "revoked" ? list.revoked : ""}`}>
    <div className={list.cards}>
      {voucher.before && voucher.after
        ? <><MiniCard card={voucher.before} faded /><ArrowRight className={list.arrow} size={18} aria-hidden /><MiniCard card={voucher.after} /></>
        : <span className={`${list.ticket} ${voucher.legendary ? list.ticketGold : ""}`} aria-hidden><Ticket size={26} /></span>}
    </div>
    <div className={list.text}>
      <span className={css.strong}>{voucher.employeeName || "(tanpa nama)"}</span>
      {voucher.department && <span className={css.muted}>{voucher.department}</span>}
      <span className={list.pills}>
        <Pill tone={voucher.legendary ? "brass" : "purple"}>{voucher.legendary ? "Legendary" : "Re-roll"}</Pill>
        <Pill tone={statusTone[voucher.status]}>{statusLabel[voucher.status]}</Pill>
      </span>
      {voucher.usedAt && voucher.before && voucher.after && <span className={list.line}>{when(voucher.usedAt)}: {voucher.before.figure} ({voucher.before.tier}) → {voucher.after.figure} ({voucher.after.tier})</span>}
      <span className={css.muted}>{voucher.claim
        ? <>Hadiah: {voucher.claim.title} · {points(voucher.claim.cost)} poin · {when(voucher.createdAt)}{claimHolds(voucher.claim.status) ? "" : " · poin sudah dikembalikan"}</>
        : <>Diberi {voucher.givenBy ?? "super admin"} · {when(voucher.createdAt)}{voucher.note ? ` · ${voucher.note}` : ""}</>}</span>
      {voucher.restoredAt && <span className={css.muted}>Kartu dikembalikan {when(voucher.restoredAt)}</span>}
      {voucher.revokedAt && <span className={css.muted}>Dibatalkan {when(voucher.revokedAt)}{voucher.revokeReason ? `: ${voucher.revokeReason}` : ""}</span>}
    </div>
    {actions.length > 0 ? <details ref={menu} className={list.menu}>
      <summary aria-label={`Aksi untuk voucher ${voucher.employeeName}`}><MoreVertical size={18} aria-hidden /></summary>
      <div className={list.menuList} role="group" aria-label={`Aksi untuk voucher ${voucher.employeeName}`}>
        {actions.map(action => {
          const Icon = actionIcon[action];
          return <button key={action} type="button" disabled={busy} className={action === "revoke" ? list.danger : ""}
            onClick={() => { if (menu.current) menu.current.open = false; onAction(action); }}><Icon size={16} aria-hidden /> {actionLabel[action]}</button>;
        })}
      </div>
    </details> : <span className={list.menuSpace} aria-hidden />}
  </li>;
}
