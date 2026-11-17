"use client";

import { useMemo, useState } from "react";
import { ConsoleButton, Pill } from "@/components/console";
import type { ConsoleTone } from "@/components/console/types";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { vouchersApi } from "@/lib/routes";
import { MIGRATION_WELLBEING_VOUCHERS, claimHolds, type TicketStatus, type VoucherAction } from "@/lib/wellbeing/rules";
import type { WbVoucher, WbVoucherPerson, WbVouchersAdmin } from "@/lib/wellbeing/types";
import css from "./admin-table.module.css";

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
      : <div className={css.wrap}><table className={css.table}>
        <thead><tr><th>Karyawan</th><th>Voucher</th><th>Asal</th><th>Status</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
        <tbody>{shown.map(voucher => <tr key={voucher.id}>
          <td data-label="Karyawan"><div><span className={css.strong}>{voucher.employeeName || "(tanpa nama)"}</span>{voucher.department && <div className={css.muted}>{voucher.department}</div>}</div></td>
          <td data-label="Voucher"><Pill tone={voucher.legendary ? "brass" : "purple"}>{voucher.legendary ? "Legendary" : "Re-roll"}</Pill></td>
          <td data-label="Asal"><div>
            {voucher.claim ? <>Hadiah: {voucher.claim.title}<div className={css.muted}>{points(voucher.claim.cost)} poin · {when(voucher.createdAt)}{claimHolds(voucher.claim.status) ? "" : " · poin sudah dikembalikan"}</div></>
              : <>Diberi {voucher.givenBy ?? "super admin"}<div className={css.muted}>{when(voucher.createdAt)}{voucher.note ? ` · ${voucher.note}` : ""}</div></>}
          </div></td>
          <td data-label="Status"><div>
            <Pill tone={statusTone[voucher.status]}>{statusLabel[voucher.status]}</Pill>
            {voucher.usedAt && voucher.before && voucher.after && <div className={css.muted}>{when(voucher.usedAt)}: {voucher.before.figure} ({voucher.before.tier}) → {voucher.after.figure} ({voucher.after.tier})</div>}
            {voucher.restoredAt && <div className={css.muted}>Kartu dikembalikan {when(voucher.restoredAt)}</div>}
            {voucher.revokedAt && <div className={css.muted}>{when(voucher.revokedAt)}{voucher.revokeReason ? `: ${voucher.revokeReason}` : ""}</div>}
          </div></td>
          <td className={css.actions}>{voucherActions(voucher).map(action => <ConsoleButton key={action} onClick={() => start(voucher, action)} disabled={busy}>{actionLabel[action]}</ConsoleButton>)}</td>
        </tr>)}</tbody>
      </table></div>}
  </>;
}
