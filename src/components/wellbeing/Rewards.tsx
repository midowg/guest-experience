"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleX, Gift, ImageOff, PackageCheck, Undo2, Wallet } from "lucide-react";
import { Panel } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import type { WbClaim, WbReward, WbRewards, WbSaldo } from "@/lib/wellbeing/app-types";
import { claimHolds, claimStatusLabels, rewardState, type ClaimStatus } from "@/lib/wellbeing/rules";
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
 */

type Tab = "hadiah" | "klaim";
type Step = { kind: "list" } | { kind: "detail"; id: string } | { kind: "sent"; claim: WbClaim };
const TABS = [["hadiah", "Hadiah"], ["klaim", "Klaim saya"]] as const;

const statusTone: Record<ClaimStatus, string> = { requested: css.pillWarn, approved: css.pillInfo, delivered: css.pillOk, rejected: css.pillErr, cancelled: "" };
const shortBy = (reward: WbReward, saldo: WbSaldo) => Math.max(0, reward.cost - saldo.available);

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
  // Each opening starts at the list, on the tab it was opened for.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setView(tab); setStep({ kind: "list" }); setProblem(null); } }

  const reward = step.kind === "detail" ? data?.rewards.find(item => item.id === step.id) ?? null : null;
  const openReward = (id: string) => { setStep({ kind: "detail", id }); setNote(""); setProblem(null); };

  async function claim(target: WbReward) {
    setBusy(true); setProblem(null);
    try {
      const result = await api.claimReward({ rewardId: target.id, note: note.trim() });
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

  const title = step.kind === "detail" ? reward?.title ?? "Hadiah" : step.kind === "sent" ? "Klaim terkirim" : "Hadiah";
  const back = step.kind === "detail" ? () => setStep({ kind: "list" }) : undefined;

  let body: React.ReactNode, footer: React.ReactNode = undefined;
  if (!data) body = rewards.error ? <ErrorState message={rewards.error} onRetry={() => void rewards.reload()} /> : <SkRows rows={4} />;
  else if (!data.migrated) body = <Preparing />;
  else if (step.kind === "sent") {
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
      footer = <ClaimBar reward={reward} saldo={data.saldo} busy={busy} onClaim={() => void claim(reward)} />;
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
          ? <ul className={cx(css.card, css.list, css.claimList)} aria-label="Klaim saya">{data.claims.map(item => <ClaimRow key={item.id} claim={item} onCancel={() => cancel(item)} />)}</ul>
          : <div style={{ marginTop: 16 }}><Empty icon={<PackageCheck size={24} aria-hidden="true" />}>Belum ada klaim. Pilih hadiah di tab Hadiah.</Empty></div>}
    </>;
  }

  return <Panel open={open} onClose={onClose} title={title} variant="sheet" tall onBack={back} backLabel="Kembali ke daftar hadiah" focusKey={step.kind} locked={busy} footer={footer}>
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

function RewardCard({ reward, saldo, onOpen }: { reward: WbReward; saldo: WbSaldo; onOpen: () => void }) {
  const short = shortBy(reward, saldo);
  const stateText = reward.state === "available" ? "Bisa diklaim" : reward.state === "sold_out" ? "Habis" : reward.state === "limit" ? "Sudah kamu klaim" : `Kurang ${num(short)} poin`;
  return <button type="button" className={css.rewardCard} data-state={reward.state} onClick={onOpen}
    aria-label={`${reward.title}, ${num(reward.cost)} poin, ${stateText}`}>
    <span className={css.rewardPhoto}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {reward.photos[0] ? <img src={reward.photos[0]} alt="" loading="lazy" /> : <Gift size={32} aria-hidden="true" />}
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
      : <div className={cx(css.rewardGallery, css.rewardNoPhoto)}><ImageOff size={32} aria-hidden="true" /></div>}
    {reward.photos.length > 1 && <p className={cx(css.caption, css.faint, css.center)} style={{ marginTop: 6 }}>Geser untuk melihat {reward.photos.length} foto</p>}
    <div className={css.rewardHead}>
      <span className={css.rewardCost} style={{ fontSize: 30 }}>{num(reward.cost)}<small> poin</small></span>
      {reward.state === "available" && <span className={cx(css.pill, css.pillOk)}>Bisa diklaim</span>}
      {reward.state === "sold_out" && <span className={cx(css.pill, css.pillErr)}>Habis</span>}
      {reward.state === "limit" && <span className={cx(css.pill, css.pillInfo)}>Sudah kamu klaim</span>}
    </div>
    {reward.state === "short" && <div className={css.rewardShort}>
      <div className={css.chaseLine}><span>Saldomu {num(saldo.available)} poin</span><b>Kurang {num(short)}</b></div>
      <div className={css.standBar} aria-hidden="true"><i style={{ width: `${Math.max(4, Math.min(100, Math.round(Math.max(0, saldo.available) / reward.cost * 100)))}%` }} /></div>
    </div>}
    {reward.description && <p className={css.rewardText}>{reward.description}</p>}
    <div className={cx(css.card, css.list, css.detailRows)}>
      <Fact label="Sisa stok" value={reward.left === null ? "Tanpa batas" : `${num(reward.left)}`} />
      <Fact label="Batas per orang" value={`${num(reward.perPerson)} kali${reward.mine ? ` (sudah ${num(reward.mine)})` : ""}`} />
      {reward.state === "available" && <Fact label="Saldo setelah klaim" value={`${num(saldo.available - reward.cost)} poin`} />}
    </div>
    {reward.state === "available" && <div className={css.field}>
      <label className={css.fieldLabel} htmlFor="reward-note">Catatan untuk admin <span className={css.faint}>(opsional)</span></label>
      <textarea id="reward-note" className={cx(css.input, css.textarea)} rows={2} maxLength={300} value={note} onChange={event => onNote(event.target.value)} placeholder="mis. ukuran atau warna" />
    </div>}
    {problem && <p className={cx(css.note, css.noteErr)} role="alert"><CircleX size={20} aria-hidden="true" /><span>{problem}</span></p>}
  </>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={css.row}><span className={css.kv}><span>{label}</span><span>{value}</span></span></div>;
}

function ClaimBar({ reward, saldo, busy, onClaim }: { reward: WbReward; saldo: WbSaldo; busy: boolean; onClaim: () => void }) {
  if (reward.state === "available") return <button type="button" className={cx(css.btn, css.btnPrimary, css.block)} onClick={onClaim} aria-busy={busy} disabled={busy}>
    <Gift size={20} aria-hidden="true" />{busy ? "Mengirim…" : `Ajukan klaim · ${num(reward.cost)} poin`}</button>;
  const text = reward.state === "sold_out" ? "Hadiah ini sudah habis" : reward.state === "limit" ? "Kamu sudah mengklaim hadiah ini" : `Kumpulkan ${num(shortBy(reward, saldo))} poin lagi`;
  return <button type="button" className={cx(css.btn, css.btnTonal, css.block)} disabled>{text}</button>;
}

function ClaimRow({ claim, onCancel }: { claim: WbClaim; onCancel: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const when = claim.status === "delivered" && claim.deliveredAt ? `Diserahkan ${formatDate(claim.deliveredAt.slice(0, 10), { day: "numeric", month: "short" })}`
    : `Diajukan ${formatDate(claim.createdAt.slice(0, 10), { day: "numeric", month: "short" })}`;
  return <li className={cx(css.row, css.rowTall)}>
    <span className={css.claimPhoto}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {claim.photo ? <img src={claim.photo} alt="" loading="lazy" /> : <Gift size={20} aria-hidden="true" />}
    </span>
    <span className={css.rowMain}>
      <span className={cx(css.rowTitle, css.wrap)}>{claim.title}</span>
      <span className={css.rowMeta}>{when} · {num(claim.cost)} poin{claimHolds(claim.status) ? "" : " · kembali ke saldo"}</span>
      {claim.status === "rejected" && claim.reason && <span className={css.claimReason}>Alasan: {claim.reason}</span>}
      {claim.note && <span className={css.rowMetaWrap}>Catatanmu: {claim.note}</span>}
      {claim.status === "requested" && (asking
        ? <span className={css.claimAsk}>
            <span>Batalkan klaim ini?</span>
            <button type="button" className={cx(css.btn, css.btnTextDanger)} disabled={busy} onClick={async () => { setBusy(true); await onCancel(); setBusy(false); setAsking(false); }}>{busy ? "Membatalkan…" : "Ya, batalkan"}</button>
            <button type="button" className={cx(css.btn, css.btnText)} disabled={busy} onClick={() => setAsking(false)}>Tidak</button>
          </span>
        : <button type="button" className={cx(css.btn, css.btnText, css.claimCancel)} onClick={() => setAsking(true)}><Undo2 size={16} aria-hidden="true" />Batalkan</button>)}
    </span>
    <span className={cx(css.pill, statusTone[claim.status])}>{claimStatusLabels[claim.status]}</span>
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
