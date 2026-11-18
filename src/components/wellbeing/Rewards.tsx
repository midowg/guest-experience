"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CalendarClock, Check, ChevronRight, CircleX, Copy, Dices, ExternalLink, Gift, ImageOff, KeyRound, PackageCheck, Sparkles, Ticket, Undo2, Wallet } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import type { WbClaim, WbReward, WbRewards, WbSaldo } from "@/lib/wellbeing/app-types";
import { claimHolds, claimStatusLabels, isLinkCode, isReroll, rewardEnded, rewardState, wibToday, type ClaimStatus, type RewardKind } from "@/lib/wellbeing/rules";
import { errorText, WellbeingApiError } from "./api";
import { keys, useWellbeing } from "./context";
import { formatDate, num } from "./format";
import { cx, Empty, ErrorState, Preparing, Seg, SkRows } from "./parts";
import css from "./wellbeing.module.css";

/*
 * Hadiah (18 Nov 2026, docs/rancangan-wellbeing.md "Hadiah"): trade points for prizes the admin puts
 * up. One tall sheet: the saldo (points minus what my claims hold; the board never changes), the
 * rewards, a reward's detail (photos, description, stock) with Ajukan klaim, and Klaim saya (status,
 * the admin's reason, Batalkan while it waits). Opened from Beranda's saldo card and from Profil.
 *
 * Voucher re-roll (18 Nov 2026): a reward may re-roll the WAM tokoh card. Claimed at once (asked once
 * more first, as the points go and it cannot be cancelled), then "Buka kartu tokoh" opens the card,
 * where the voucher is used. Klaim saya says whether each voucher is used.
 *
 * Jenis hadiah dan voucher kode (18 Nov 2026): a reward may be money, a code voucher or something else,
 * and goes on as its delivery says (waits for the admin, approved at once, or received at once). A
 * claim that cannot be cancelled is asked once more. A code voucher's code or link shows once handed
 * over (Salin kode, Buka link), with its last day and how to use it, also from Klaim saya (Lihat kode).
 */

type Tab = "hadiah" | "klaim";
type Step = { kind: "list" } | { kind: "detail"; id: string } | { kind: "sent"; claim: WbClaim } | { kind: "claim"; id: string };
const TABS = [["hadiah", "Hadiah"], ["klaim", "Klaim saya"]] as const;

const statusTone: Record<ClaimStatus, string> = { requested: css.pillWarn, approved: css.pillInfo, delivered: css.pillOk, rejected: css.pillErr, cancelled: "" };
const shortBy = (reward: WbReward, saldo: WbSaldo) => Math.max(0, reward.cost - saldo.available);
/** A claim that cannot be cancelled (a re-roll, or a delivery that does not wait for the admin) is asked once more. */
const asksFirst = (reward: WbReward) => isReroll(reward.kind) || reward.delivery !== "admin";
/** No note when nobody reads it: a re-roll, or a claim received at once. */
const takesNote = (reward: WbReward) => !isReroll(reward.kind) && reward.delivery !== "auto";
const dayText = (date: string) => formatDate(date, { day: "numeric", month: "long", year: "numeric" });

export function RewardsSheet({ open, tab, onClose }: { open: boolean; tab: Tab; onClose: () => void }) {
  const { api } = useWellbeing();
  const toast = useToast();
  const rewards = useResource(open ? keys.rewards : null, () => api.rewards());
  // The last answer stays while the sheet slides away.
  const [shown, setShown] = useState<WbRewards | null>(null);
  if (rewards.data && rewards.data !== shown) setShown(rewards.data);
  const data = open ? rewards.data ?? null : shown;
  const [view, setView] = useState<Tab>(tab);
  const [step, setStep] = useState<Step>({ kind: "list" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A voucher asks once more before the points go (it cannot be cancelled).
  const [asking, setAsking] = useState(false);
  // Each opening starts at the list, on the tab it was opened for.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setView(tab); setStep({ kind: "list" }); setProblem(null); } }

  const reward = step.kind === "detail" ? data?.rewards.find(item => item.id === step.id) ?? null : null;
  // Each step (list, a reward, sent) and each tab starts at the top, not where the list was scrolled to.
  const top = useRef<HTMLDivElement>(null);
  const stepKey = `${step.kind}:${step.kind === "detail" || step.kind === "claim" ? step.id : ""}:${view}`;
  useEffect(() => { top.current?.scrollIntoView?.({ block: "start" }); }, [stepKey]);
  const openReward = (id: string) => { setStep({ kind: "detail", id }); setNote(""); setProblem(null); setAsking(false); };

  async function claim(target: WbReward) {
    setBusy(true); setProblem(null); setAsking(false);
    try {
      const result = await api.claimReward({ rewardId: target.id, note: takesNote(target) ? note.trim() : "" });
      // The saldo, the reward's stock and mine, and Klaim saya change at once; then the server's answer.
      setResource<WbRewards>(keys.rewards, current => current && {
        ...current, saldo: result.saldo, claims: [result.claim, ...current.claims],
        rewards: current.rewards.map(item => {
          const mine = item.id === target.id ? item.mine + 1 : item.mine, left = item.id === target.id && item.left !== null ? Math.max(0, item.left - 1) : item.left;
          // What is left stands for the stock here (none taken beyond it); the new saldo may change every reward's state.
          return { ...item, mine, left, state: rewardState({ cost: item.cost, stock: left, taken: 0, perPerson: item.perPerson, mine, available: result.saldo.available }) };
        }),
      });
      revalidate(keys.rewards);
      setStep({ kind: "sent", claim: result.claim });
    } catch (error) {
      setProblem(errorText(error));
      if (error instanceof WellbeingApiError && error.code) revalidate(keys.rewards);
    } finally { setBusy(false); }
  }

  async function cancel(target: WbClaim) {
    try {
      const result = await api.cancelClaim(target.id);
      setResource<WbRewards>(keys.rewards, current => current && { ...current, saldo: result.saldo, claims: current.claims.map(item => item.id === target.id ? result.claim : item) });
      revalidate(keys.rewards);
      toast({ message: `Klaim ${target.title} dibatalkan. ${num(target.cost)} poin kembali ke saldo.`, tone: "ok" });
    } catch (error) { toast({ message: errorText(error), tone: "bad" }); revalidate(keys.rewards); }
  }

  const opened = step.kind === "claim" ? data?.claims.find(item => item.id === step.id) ?? null : null;
  const title = step.kind === "detail" ? reward?.title ?? "Hadiah" : step.kind === "claim" ? "Voucher saya"
    : step.kind === "sent" ? step.claim.voucher ? "Voucher aktif" : step.claim.code ? "Voucher diterima" : step.claim.status === "approved" ? "Klaim disetujui" : "Klaim terkirim" : "Hadiah";
  const back = step.kind === "detail" ? () => setStep({ kind: "list" }) : step.kind === "claim" ? () => { setView("klaim"); setStep({ kind: "list" }); } : undefined;

  let body: React.ReactNode, footer: React.ReactNode = undefined;
  if (!data) body = rewards.error ? <ErrorState message={rewards.error} onRetry={() => void rewards.reload()} /> : <SkRows rows={4} />;
  else if (!data.migrated) body = <Preparing />;
  else if (step.kind === "sent" && step.claim.voucher) {
    body = <VoucherSent claim={step.claim} />;
    footer = <div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={onClose}>Nanti saja</button>
      {data.cardUrl
        ? <a className={cx(css.btn, css.btnPrimary)} href={data.cardUrl}><Dices size={20} aria-hidden="true" />Buka kartu tokoh</a>
        : <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onClose}>Selesai</button>}
    </div>;
  } else if (step.kind === "claim") {
    body = opened?.code ? <ClaimVoucher claim={opened} /> : <Empty icon={<Ticket size={24} aria-hidden="true" />}>Voucher ini sudah tidak tersedia.</Empty>;
  } else if (step.kind === "sent" && (step.claim.code || step.claim.status !== "requested")) {
    // Received at once (a code voucher's code shows here) or approved at once (the admin hands it over).
    body = step.claim.code ? <ClaimVoucher claim={step.claim} fresh /> : <div className={css.done} role="status">
      <div className={css.doneMark}><Check size={48} strokeWidth={2.5} aria-hidden="true" /></div>
      <h3 className={css.headline}>{step.claim.status === "approved" ? "Klaim disetujui" : "Hadiah diterima"}</h3>
      <p className={css.muted}>{step.claim.title}</p>
      <p className={cx(css.note, css.noteInfo)} style={{ textAlign: "left" }}><Wallet size={20} aria-hidden="true" />
        <span><b>{num(step.claim.cost)}{" "}poin</b> dipakai dari saldomu.{step.claim.status === "approved" ? " Admin akan menyerahkan hadiahnya; pantau di Klaim saya." : ""} Peringkatmu tidak berubah.</span></p>
    </div>;
    footer = <div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => { setView("klaim"); setStep({ kind: "list" }); }}>Lihat klaim saya</button>
      <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onClose}>Selesai</button>
    </div>;
  } else if (step.kind === "sent") {
    body = <div className={css.done} role="status">
      <div className={css.doneMark}><Check size={48} strokeWidth={2.5} aria-hidden="true" /></div>
      <h3 className={css.headline}>Permintaan terkirim</h3>
      <p className={css.muted}>{step.claim.title}</p>
      <p className={cx(css.note, css.noteInfo)} style={{ textAlign: "left" }}><Wallet size={20} aria-hidden="true" />
        <span><b>{num(step.claim.cost)} poin</b> ditahan dari saldomu sampai admin memproses. Kalau ditolak atau kamu batalkan, poinnya kembali. Peringkatmu tidak berubah.</span></p>
    </div>;
    footer = <div className={css.btnRow}>
      <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => { setView("klaim"); setStep({ kind: "list" }); }}>Lihat klaim saya</button>
      <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={onClose}>Selesai</button>
    </div>;
  } else if (step.kind === "detail") {
    if (!reward) body = <Empty icon={<Gift size={24} aria-hidden="true" />}>Hadiah ini sudah tidak tersedia.</Empty>;
    else {
      body = <RewardDetail reward={reward} saldo={data.saldo} note={note} onNote={setNote} problem={problem} />;
      footer = asksFirst(reward) && asking
        ? <div className={css.claimConfirm} role="group" aria-label="Konfirmasi klaim">
            <p>{num(reward.cost)}{" "}poin {reward.delivery === "approved" ? "langsung ditahan" : "langsung terpotong"} dan klaim ini tidak bisa dibatalkan.</p>
            <div className={css.btnRow}>
              <button type="button" className={cx(css.btn, css.btnOutline)} onClick={() => setAsking(false)} disabled={busy}>Batal</button>
              <button type="button" className={cx(css.btn, css.btnPrimary)} onClick={() => void claim(reward)} aria-busy={busy} disabled={busy} autoFocus>{busy ? "Mengklaim…" : "Ya, klaim"}</button>
            </div>
          </div>
        : <ClaimBar reward={reward} saldo={data.saldo} busy={busy} onClaim={() => asksFirst(reward) ? setAsking(true) : void claim(reward)} />;
    }
  } else {
    const waiting = data.claims.filter(item => item.status === "requested" || item.status === "approved").length;
    body = <>
      <SaldoCard saldo={data.saldo} />
      <Seg label="Tampilan hadiah" value={view} options={TABS.map(([key, label]) => [key, key === "klaim" && waiting ? `${label} (${waiting})` : label] as const)} onChange={setView} style={{ marginTop: 16 }} />
      {view === "hadiah"
        ? data.rewards.length
          ? <ul className={css.rewardGrid} aria-label="Daftar hadiah">
              {data.rewards.map(item => <li key={item.id}><RewardCard reward={item} saldo={data.saldo} onOpen={() => openReward(item.id)} /></li>)}
            </ul>
          : <div style={{ marginTop: 16 }}><Empty icon={<Gift size={24} aria-hidden="true" />}>Belum ada hadiah. Admin akan menambahkannya.</Empty></div>
        : data.claims.length
          ? <ul className={cx(css.card, css.list, css.claimList)} aria-label="Klaim saya">{data.claims.map(item => <ClaimRow key={item.id} claim={item} cardUrl={data.cardUrl} onCancel={() => cancel(item)} onOpen={() => setStep({ kind: "claim", id: item.id })} />)}</ul>
          : <div style={{ marginTop: 16 }}><Empty icon={<PackageCheck size={24} aria-hidden="true" />}>Belum ada klaim. Pilih hadiah di tab Hadiah.</Empty></div>}
    </>;
  }

  return <Panel open={open} onClose={onClose} title={title} variant="sheet" tall onBack={back} backLabel={step.kind === "claim" ? "Kembali ke klaim saya" : "Kembali ke daftar hadiah"} focusKey={step.kind} locked={busy} footer={footer}>
    <div ref={top} />
    {body}
  </Panel>;
}

/** The saldo on an ink card: what can be spent, and what makes it. */
export function SaldoCard({ saldo, action }: { saldo: WbSaldo; action?: React.ReactNode }) {
  return <section className={css.saldo} aria-label="Saldo poin">
    <div className={css.saldoMain}>
      <span className={css.saldoLabel}><Wallet size={16} aria-hidden="true" />Saldo poin</span>
      <b className={css.saldoValue}>{num(saldo.available)}</b>
      <span className={css.saldoMeta}>Total {num(saldo.earned)} poin{saldo.held > 0 ? ` · ${num(saldo.held)} ditahan klaim` : ""}</span>
    </div>
    {action}
  </section>;
}

/** A reward's state in a few words (the list and the screen reader). */
function stateTextOf(reward: WbReward, saldo: WbSaldo) {
  switch (reward.state) {
    case "available": return "Bisa diklaim";
    case "sold_out": return "Habis";
    case "limit": return "Sudah kamu klaim";
    case "no_card": return "Kartu tokoh belum keluar";
    case "legend_full": return "Legendary penuh";
    default: return `Kurang ${num(shortBy(reward, saldo))} poin`;
  }
}

/** A reward without a photo: the dice on ink for a re-roll (gold for Legendary), a ticket for a code voucher, a note for money; a gift for the rest. */
function RewardArt({ kind, size = 32 }: { kind: RewardKind; size?: number }) {
  if (isReroll(kind)) return <span className={css.voucherArt} data-legend={kind === "reroll_legendary" || undefined} aria-hidden="true">
    <Dices size={size} />{kind === "reroll_legendary" && <Sparkles size={Math.round(size * 0.5)} className={css.voucherSpark} />}
  </span>;
  if (kind === "voucher") return <span className={css.voucherArt} data-code aria-hidden="true"><Ticket size={size} /></span>;
  if (kind === "uang") return <span className={css.voucherArt} data-money aria-hidden="true"><Banknote size={size} /></span>;
  return <Gift size={size} aria-hidden="true" />;
}

function RewardCard({ reward, saldo, onOpen }: { reward: WbReward; saldo: WbSaldo; onOpen: () => void }) {
  const stateText = stateTextOf(reward, saldo);
  return <button type="button" className={css.rewardCard} data-state={reward.state} onClick={onOpen}
    aria-label={`${reward.title}, ${num(reward.cost)} poin, ${stateText}`}>
    <span className={css.rewardPhoto}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {reward.photos[0] ? <img src={reward.photos[0]} alt="" loading="lazy" /> : <RewardArt kind={reward.kind} />}
      {reward.left !== null && reward.state !== "sold_out" && <span className={css.rewardLeft}>Sisa {num(reward.left)}</span>}
    </span>
    <span className={css.rewardBody}>
      <span className={css.rewardTitle}>{reward.title}</span>
      <span className={css.rewardCost}>{num(reward.cost)}<small> poin</small></span>
      {reward.state === "short"
        ? <span className={css.rewardBar} aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, Math.round(Math.max(0, saldo.available) / reward.cost * 100)))}%` }} /></span>
        : null}
      <span className={css.rewardState}>{stateText}</span>
    </span>
  </button>;
}

function RewardDetail({ reward, saldo, note, onNote, problem }: { reward: WbReward; saldo: WbSaldo; note: string; onNote: (value: string) => void; problem: string | null }) {
  const short = shortBy(reward, saldo);
  return <>
    {reward.photos.length > 0
      ? <div className={css.rewardGallery} role="group" aria-label={`Foto hadiah (${reward.photos.length})`} tabIndex={0}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
          {reward.photos.map((url, index) => <img key={url} src={url} alt={`Foto ${index + 1} dari ${reward.photos.length}: ${reward.title}`} loading={index ? "lazy" : "eager"} />)}
        </div>
      : <div className={cx(css.rewardGallery, css.rewardNoPhoto)}>{reward.kind === "barang" || reward.kind === "lainnya" ? <ImageOff size={32} aria-hidden="true" /> : <RewardArt kind={reward.kind} size={48} />}</div>}
    {reward.photos.length > 1 && <p className={cx(css.caption, css.faint, css.center)} style={{ marginTop: 6 }}>Geser untuk melihat {reward.photos.length} foto</p>}
    <div className={css.rewardHead}>
      <span className={css.rewardCost} style={{ fontSize: 30 }}>{num(reward.cost)}<small> poin</small></span>
      {reward.state === "available" && <span className={cx(css.pill, css.pillOk)}>Bisa diklaim</span>}
      {reward.state === "sold_out" && <span className={cx(css.pill, css.pillErr)}>Habis</span>}
      {reward.state === "limit" && <span className={cx(css.pill, css.pillInfo)}>Sudah kamu klaim</span>}
      {(reward.state === "no_card" || reward.state === "legend_full") && <span className={cx(css.pill, css.pillWarn)}>{stateTextOf(reward, saldo)}</span>}
    </div>
    <DeliveryNote reward={reward} />
    {isReroll(reward.kind) && <p className={cx(css.note, css.noteInfo)}><Dices size={20} aria-hidden="true" /><span>
      <b>Langsung aktif, tanpa menunggu admin.</b> Poin terpotong saat klaim. Pakai di kartu tokoh WAM-mu kapan saja: tokoh diundi ulang{reward.kind === "reroll_legendary" ? <> dan rarity <b>pasti Legendary</b></> : " dan rarity juga diundi ulang, jadi bisa naik atau turun"}. Hasilnya wajib diterima.</span></p>}
    {reward.state === "no_card" && <p className={cx(css.note, css.noteWarn)}><CircleX size={20} aria-hidden="true" /><span>Kartu tokohmu belum keluar. Selesaikan kuesioner WAM dulu, lalu klaim voucher ini.</span></p>}
    {reward.state === "legend_full" && <p className={cx(css.note, css.noteWarn)}><CircleX size={20} aria-hidden="true" /><span>Semua tempat Legendary sudah terisi, jadi voucher ini belum bisa diklaim.</span></p>}
    {reward.state === "short" && <div className={css.rewardShort}>
      <div className={css.chaseLine}><span>Saldomu {num(saldo.available)} poin</span><b>Kurang {num(short)}</b></div>
      <div className={css.standBar} aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, Math.round(Math.max(0, saldo.available) / reward.cost * 100)))}%` }} /></div>
    </div>}
    {reward.description && <p className={css.rewardText}>{reward.description}</p>}
    {reward.howTo && <><h4 className={css.howToLabel}>Cara pakai</h4><p className={css.rewardText} style={{ marginTop: 4 }}>{reward.howTo}</p></>}
    <div className={cx(css.card, css.list, css.detailRows, css.factList)}>
      <Fact label="Sisa stok" value={reward.left === null ? "Tanpa batas" : `${num(reward.left)}`} />
      {reward.validUntil && <Fact label="Berlaku sampai" value={dayText(reward.validUntil)} />}
      <Fact label="Batas per orang" value={`${num(reward.perPerson)} kali${reward.mine ? ` (sudah ${num(reward.mine)})` : ""}`} />
      {reward.state === "available" && <Fact label="Saldo setelah klaim" value={`${num(saldo.available - reward.cost)} poin`} />}
    </div>
    {reward.state === "available" && takesNote(reward) && <div className={css.field}>
      <label className={css.fieldLabel} htmlFor="reward-note">Catatan untuk admin <span className={css.faint}>(opsional)</span></label>
      <textarea id="reward-note" className={cx(css.input, css.textarea)} rows={2} maxLength={300} value={note} onChange={event => onNote(event.target.value)} placeholder={notePlaceholder[reward.kind]} />
    </div>}
    {problem && <p className={cx(css.note, css.noteErr)} role="alert"><CircleX size={20} aria-hidden="true" /><span>{problem}</span></p>}
  </>;
}

const notePlaceholder: Record<RewardKind, string> = {
  barang: "mis. ukuran atau warna", uang: "mis. e-wallet tujuan", voucher: "mis. nomor tujuan", lainnya: "mis. jadwal yang kamu mau", reroll: "", reroll_legendary: "",
};

/** How the claim goes on, before it is made (a re-roll says it in its own note). */
function DeliveryNote({ reward }: { reward: WbReward }) {
  if (isReroll(reward.kind)) return null;
  const code = reward.kind === "voucher";
  const text = reward.delivery === "auto"
    ? <><b>Langsung diterima, tanpa menunggu admin.</b> Poin terpotong saat klaim{code ? " dan kode atau link langsung tampil" : ""}.</>
    : reward.delivery === "approved"
      ? <><b>Langsung disetujui.</b> Poin ditahan saat klaim, lalu admin menyerahkan {code ? "kode atau linknya di Klaim saya" : "hadiahnya"}.</>
      : code ? <>Admin menyetujui klaimmu, lalu kode atau linknya tampil di <b>Klaim saya</b>.</> : null;
  if (!text) return null;
  return <p className={cx(css.note, css.noteInfo)}>{code ? <Ticket size={20} aria-hidden="true" /> : <PackageCheck size={20} aria-hidden="true" />}<span>{text}</span></p>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={css.row}><span className={css.kv}><span>{label}</span><span>{value}</span></span></div>;
}

function ClaimBar({ reward, saldo, busy, onClaim }: { reward: WbReward; saldo: WbSaldo; busy: boolean; onClaim: () => void }) {
  const voucher = isReroll(reward.kind) || reward.kind === "voucher";
  const label = voucher ? "Klaim voucher" : reward.delivery === "admin" ? "Ajukan klaim" : "Klaim hadiah";
  if (reward.state === "available") return <button type="button" className={cx(css.btn, css.btnPrimary, css.block)} onClick={onClaim} aria-busy={busy} disabled={busy}>
    {isReroll(reward.kind) ? <Dices size={20} aria-hidden="true" /> : voucher ? <Ticket size={20} aria-hidden="true" /> : <Gift size={20} aria-hidden="true" />}{busy ? "Mengirim…" : `${label} · ${num(reward.cost)} poin`}</button>;
  const text = reward.state === "sold_out" ? "Hadiah ini sudah habis" : reward.state === "limit" ? "Kamu sudah mengklaim hadiah ini"
    : reward.state === "no_card" ? "Kartu tokohmu belum keluar" : reward.state === "legend_full" ? "Tempat Legendary sudah penuh" : `Kumpulkan ${num(shortBy(reward, saldo))} poin lagi`;
  return <button type="button" className={cx(css.btn, css.btnTonal, css.block)} disabled>{text}</button>;
}

/** After a voucher claim: it is active, the points are spent, and where to use it. */
function VoucherSent({ claim }: { claim: WbClaim }) {
  return <div className={css.done} role="status">
    <div className={cx(css.doneMark, claim.voucher?.legendary && css.doneMarkGold)}><Dices size={48} strokeWidth={2.2} aria-hidden="true" /></div>
    <h3 className={css.headline}>{claim.voucher?.legendary ? "Voucher Legendary aktif" : "Voucher re-roll aktif"}</h3>
    <p className={css.muted}>{claim.title}</p>
    <p className={cx(css.note, css.noteInfo)} style={{ textAlign: "left" }}><Wallet size={20} aria-hidden="true" />
      <span><b>{num(claim.cost)}{" "}poin</b> dipakai dari saldomu. Buka kartu tokohmu di WAM, lalu tekan <b>Pakai voucher</b>. Vouchernya bisa dipakai kapan saja. Peringkatmu tidak berubah.</span></p>
  </div>;
}

/** A code voucher handed over: the code or the link (Salin, Buka link), its last day, and how to use it. `fresh`: just claimed. */
function ClaimVoucher({ claim, fresh = false }: { claim: WbClaim; fresh?: boolean }) {
  const ended = rewardEnded(claim.validUntil, wibToday());
  return <div role={fresh ? "status" : undefined}>
    {/* The sheet's title says "Voucher diterima" (just claimed) or "Voucher saya". */}
    {fresh && <div className={css.done} style={{ paddingBottom: 0 }}><div className={css.doneMark}><Ticket size={44} strokeWidth={2.2} aria-hidden="true" /></div></div>}
    <h3 className={cx(css.headline, css.center)} style={{ marginTop: fresh ? 4 : 8, fontSize: 20 }}>{claim.title}</h3>
    {claim.code && <VoucherCode code={claim.code} ended={ended} />}
    <div className={cx(css.card, css.list, css.detailRows, css.factList)}>
      {claim.validUntil && <Fact label="Berlaku sampai" value={`${dayText(claim.validUntil)}${ended ? " (sudah lewat)" : ""}`} />}
      <Fact label="Diterima" value={claim.deliveredAt ? formatDate(claim.deliveredAt.slice(0, 10), { day: "numeric", month: "long" }) : "Hari ini"} />
      <Fact label="Poin dipakai" value={`${num(claim.cost)} poin`} />
    </div>
    {claim.howTo && <><h4 className={css.howToLabel}>Cara pakai</h4><p className={css.rewardText} style={{ marginTop: 4 }}>{claim.howTo}</p></>}
    {fresh && <p className={cx(css.caption, css.faint, css.center)} style={{ marginTop: 12 }}>{claim.code && isLinkCode(claim.code) ? "Linknya" : "Kodenya"} tersimpan di Klaim saya.</p>}
  </div>;
}

/** The code big and easy to copy; a link (https only) opens in a new tab too. */
function VoucherCode({ code, ended }: { code: string; ended: boolean }) {
  const toast = useToast();
  const link = isLinkCode(code), value = code.trim();
  async function copy() {
    try { await navigator.clipboard.writeText(value); toast({ message: link ? "Link disalin." : "Kode disalin.", tone: "ok" }); }
    catch { toast({ message: "Tidak bisa menyalin. Tekan lama kodenya untuk menyalin.", tone: "bad" }); }
  }
  return <section className={css.codeCard} data-ended={ended || undefined} aria-label={link ? "Link voucher" : "Kode voucher"}>
    <span className={css.codeLabel}><KeyRound size={14} aria-hidden="true" />{link ? "Link voucher" : "Kode voucher"}</span>
    <code className={css.codeValue} data-link={link || undefined}>{value}</code>
    <div className={link ? css.btnRow : undefined}>
      <button type="button" className={cx(css.btn, link ? css.btnOutline : css.btnPrimary, css.block)} onClick={() => void copy()}><Copy size={18} aria-hidden="true" />{link ? "Salin link" : "Salin kode"}</button>
      {link && <a className={cx(css.btn, css.btnPrimary, css.block)} href={value} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" />Buka link</a>}
    </div>
  </section>;
}

const voucherLabel = { open: "Belum dipakai", used: "Sudah dipakai", revoked: "Dibatalkan" } as const;
const voucherTone = { open: css.pillInfo, used: css.pillOk, revoked: "" } as const;

function ClaimRow({ claim, cardUrl, onCancel, onOpen }: { claim: WbClaim; cardUrl: string | null; onCancel: () => Promise<void>; onOpen: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const when = claim.voucher ? `Diklaim ${formatDate(claim.createdAt.slice(0, 10), { day: "numeric", month: "short" })}`
    : claim.status === "delivered" && claim.deliveredAt ? `${claim.code ? "Diterima" : "Diserahkan"} ${formatDate(claim.deliveredAt.slice(0, 10), { day: "numeric", month: "short" })}`
    : `Diajukan ${formatDate(claim.createdAt.slice(0, 10), { day: "numeric", month: "short" })}`;
  // A voucher still holding its points shows its ticket (used or not); a refunded one shows Ditolak and the reason.
  const ticket = claim.voucher && claimHolds(claim.status) ? claim.voucher.status : null;
  // A code voucher handed over: Lihat kode opens it; past its last day it says so.
  const ended = !!claim.code && rewardEnded(claim.validUntil, wibToday());
  return <li className={cx(css.row, css.rowTall)}>
    <span className={css.claimPhoto}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {claim.photo ? <img src={claim.photo} alt="" loading="lazy" /> : claim.kind === "voucher" ? <Ticket size={20} aria-hidden="true" /> : claim.kind === "uang" ? <Banknote size={20} aria-hidden="true" /> : isReroll(claim.kind) ? <Dices size={20} aria-hidden="true" /> : <Gift size={20} aria-hidden="true" />}
    </span>
    <span className={css.rowMain}>
      <span className={cx(css.rowTitle, css.wrap)}>{claim.title}</span>
      {/* A no-break space keeps the number with "poin" when the line wraps. */}
      <span className={css.rowMetaWrap}>{when} · {num(claim.cost)}{" "}poin{claimHolds(claim.status) ? "" : " · kembali ke saldo"}</span>
      {claim.status === "rejected" && claim.reason && <span className={css.claimReason}>Alasan: {claim.reason}</span>}
      {claim.note && <span className={css.rowMetaWrap}>Catatanmu: {claim.note}</span>}
      {ticket === "open" && cardUrl && <a className={cx(css.btn, css.btnText, css.claimCancel)} href={cardUrl}><Dices size={16} aria-hidden="true" />Pakai di kartu tokoh</a>}
      {claim.code && <button type="button" className={cx(css.btn, css.btnText, css.claimCancel)} onClick={onOpen}><KeyRound size={16} aria-hidden="true" />{isLinkCode(claim.code) ? "Lihat link" : "Lihat kode"}</button>}
      {claim.code && claim.validUntil && <span className={css.rowMetaWrap}><CalendarClock size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />{ended ? "Berakhir" : "Berlaku sampai"} {formatDate(claim.validUntil, { day: "numeric", month: "short" })}</span>}
      {claim.status === "requested" && (asking
        ? <span className={css.claimAsk}>
            <span>Batalkan klaim ini?</span>
            <button type="button" className={cx(css.btn, css.btnTextDanger)} disabled={busy} onClick={async () => { setBusy(true); await onCancel(); setBusy(false); setAsking(false); }}>{busy ? "Membatalkan…" : "Ya, batalkan"}</button>
            <button type="button" className={cx(css.btn, css.btnText)} disabled={busy} onClick={() => setAsking(false)}>Tidak</button>
          </span>
        : <button type="button" className={cx(css.btn, css.btnText, css.claimCancel)} onClick={() => setAsking(true)}><Undo2 size={16} aria-hidden="true" />Batalkan</button>)}
    </span>
    {ticket
      ? <span className={cx(css.pill, voucherTone[ticket])}>{voucherLabel[ticket]}</span>
      : claim.code
        ? <span className={cx(css.pill, ended ? "" : css.pillOk)}>{ended ? "Berakhir" : "Siap dipakai"}</span>
        : <span className={cx(css.pill, statusTone[claim.status])}>{claimStatusLabels[claim.status]}</span>}
  </li>;
}

/** Beranda: the saldo and the nearest reward, opening Hadiah (only once there are rewards). */
export function RewardsCard() {
  const { api, openRewards } = useWellbeing();
  const data = useResource(keys.rewards, () => api.rewards()).data;
  if (!data?.migrated || !data.rewards.length) return null;
  const ready = data.rewards.filter(item => item.state === "available").length;
  const next = data.rewards.filter(item => item.state === "short").sort((a, b) => a.cost - b.cost)[0];
  const waiting = data.claims.filter(item => item.status === "requested" || item.status === "approved").length;
  const hint = ready ? `${num(ready)} hadiah bisa kamu klaim` : next ? `Kurang ${num(shortBy(next, data.saldo))} poin untuk ${next.title}` : waiting ? `${num(waiting)} klaim sedang diproses` : "Lihat hadiah";
  return <button type="button" className={css.saldoCard} onClick={() => openRewards("hadiah")} aria-haspopup="dialog"
    aria-label={`Saldo poin ${num(data.saldo.available)}. ${hint}. Buka Hadiah`}>
    <span className={css.saldoIcon} aria-hidden="true"><Gift size={22} /></span>
    <span className={css.rowMain}>
      <span className={css.saldoCardLabel}>Saldo poin · Hadiah</span>
      <b className={css.saldoCardValue}>{num(data.saldo.available)}<small> poin</small></b>
      <span className={css.rowMeta}>{hint}</span>
    </span>
    <ChevronRight size={20} className={css.chev} aria-hidden="true" />
  </button>;
}
