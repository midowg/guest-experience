"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, Download, FileUp, HandHeart, Minus, Plus, X } from "lucide-react";
import { describeDonation, donorDisplays, formatRupiah, parseRupiah, type DonationCategory, type DonationItem, type DonorDisplay } from "@/lib/donations";
import { guestApi } from "@/lib/routes";
import type { EventRecord } from "@/lib/types";
import { donationInputSchema } from "@/lib/validation";
import { submissionIdentity, type RetryIdentity } from "../form-utils";
import s from "./csr.module.css";

/** What this browser gave, so the page can thank the donor when they come back. */
export type RememberedDonation = { name: string; gift: string; at: string };
export const donationMemoryKey = (eventId: string) => `wk_donasi_${eventId.slice(0, 16)}`;
/** Sent on this window after a donation is remembered, so the page thanks the donor at once. */
export const DONATION_MEMORY_EVENT = "wk:donasi";
export function parseRemembered(text: string): RememberedDonation[] {
  try { const list: unknown = JSON.parse(text || "[]"); return Array.isArray(list) ? list as RememberedDonation[] : []; } catch { return []; }
}
function remember(eventId: string, donation: RememberedDonation) {
  try {
    const key = donationMemoryKey(eventId);
    localStorage.setItem(key, JSON.stringify([donation, ...parseRemembered(localStorage.getItem(key) ?? "")].slice(0, 10)));
    window.dispatchEvent(new Event(DONATION_MEMORY_EVENT));
  } catch { /* private mode: nothing is remembered */ }
}

const quickAmounts = [50_000, 100_000, 250_000, 500_000];
type Answers = { item: DonationItem | null; label: string; amount: number; name: string; display: DonorDisplay; phone: string; message: string };
const empty: Answers = { item: null, label: "", amount: 0, name: "", display: "name", phone: "", message: "" };

/**
 * The donation form, full screen: what to give (a tap on a chip fills it), how much, how to hand
 * it over (bank account and QRIS for money, the committee's note for goods), the donor's name and
 * how it appears, an optional WhatsApp number for the handover news, and a message or prayer.
 */
export function DonationForm({ event, preview = false, onClose }: { event: EventRecord; preview?: boolean; onClose: () => void }) {
  const settings = event.donation;
  const [answers, setAnswers] = useState<Answers>(empty);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<RememberedDonation | null>(null);
  const [copied, setCopied] = useState("");
  const identity = useRef<RetryIdentity | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const category: DonationCategory = answers.item?.category ?? "other";
  const set = (patch: Partial<Answers>) => { setAnswers(current => ({ ...current, ...patch })); setErrors({}); setMessage(""); };

  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  function pick(item: DonationItem) {
    set({ item, label: item.label, amount: item.category === "goods" ? Math.max(1, answers.item?.category === "goods" ? answers.amount : 1) : item.category === "fund" ? (answers.item?.category === "fund" ? answers.amount : 0) : 0 });
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text.replace(/\s/g, "")); setCopied(what); } catch { setCopied(""); }
  }

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (pending) return;
    const payload = {
      item_key: answers.item && answers.label === answers.item.label ? answers.item.key : "",
      item_label: answers.label.trim(), category: answers.item && answers.label === answers.item.label ? category : "other" as DonationCategory,
      amount: answers.amount, unit: answers.item && answers.label === answers.item.label ? answers.item.unit : "",
      donor_name: answers.name.trim(), display: answers.display, donor_phone: answers.phone.trim(), message: answers.message.trim(),
      website: honeypot.current?.value ?? "",
    };
    identity.current = submissionIdentity({ ...payload, proof: proof?.name ?? "" }, identity.current, () => crypto.randomUUID());
    const body = { ...payload, idempotency_key: identity.current.key };
    const parsed = donationInputSchema.safeParse(body);
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[String(issue.path[0] ?? "form")] ??= issue.message;
    if (payload.category === "fund" && settings.proofRequired && !proof) next.proof = "Unggah bukti transfer.";
    if (Object.keys(next).length) { setErrors(next); setMessage("Periksa isian yang ditandai."); return; }
    const gift = describeDonation(body);
    if (preview) { setDone({ name: body.donor_name, gift, at: new Date().toISOString() }); return; }
    setPending(true);
    try {
      const data = new FormData();
      data.set("payload", JSON.stringify(body));
      if (proof && payload.category === "fund") data.set("proof", proof);
      const response = await fetch(guestApi.donation(event), { method: "POST", body: data });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; fieldErrors?: Record<string, string[]> } | null;
      if (!response.ok || !result?.ok) {
        setErrors(Object.fromEntries(Object.entries(result?.fieldErrors ?? {}).map(([key, list]) => [key, list[0]])));
        setMessage(result?.message || "Donasi belum terkirim. Periksa koneksi, lalu coba lagi.");
        return;
      }
      const record = { name: body.display === "name" ? body.donor_name : body.donor_name.split(" ")[0], gift, at: new Date().toISOString() };
      remember(event.id, record);
      setDone(record);
    } catch { setMessage("Donasi belum terkirim. Periksa koneksi, lalu coba lagi."); }
    finally { setPending(false); }
  }

  return <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="donasi-judul">
    <div className={s.sheetHead}>
      <h2 id="donasi-judul" ref={heading} tabIndex={-1}>{done ? "Terima kasih" : "Donasi"}</h2>
      <button type="button" className={s.close} onClick={onClose} aria-label="Tutup"><X size={22} aria-hidden="true" /></button>
    </div>

    {done ? <div className={s.done}>
      <span className={s.doneIcon}><HandHeart size={36} aria-hidden="true" /></span>
      <p className={s.doneTitle}>Donasi Anda tercatat, {done.name}.</p>
      <p className={s.doneGift}>{done.gift}</p>
      <p>Panitia akan mengonfirmasi donasi Anda. Setelah dikonfirmasi, donasi ikut terhitung di halaman ini{answers.phone ? ", dan Anda akan mendapat kabar lewat WhatsApp saat bantuan diserahkan" : ""}.</p>
      <button type="button" className={s.give} onClick={onClose}><Check size={20} aria-hidden="true" /> Selesai</button>
    </div>

    : <form className={s.form} onSubmit={submit} noValidate>
      <fieldset className={s.group}>
        <legend>Bantuan apa?</legend>
        <div className={s.chips} role="group" aria-label="Pilihan bantuan">
          {settings.items.map(item => <button key={item.key} type="button" className={s.chip} aria-pressed={answers.item?.key === item.key && answers.label === item.label} onClick={() => pick(item)}>{item.label}</button>)}
        </div>
        <label className={s.field}><span>Atau tulis sendiri</span>
          <input className="input" value={answers.label} maxLength={120} placeholder="Misalnya: kursi roda, tenaga relawan" aria-invalid={!!errors.item_label || undefined}
            onChange={change => set({ label: change.target.value, ...(answers.item && change.target.value !== answers.item.label ? { item: null, amount: 0 } : {}) })} />
        </label>
        {errors.item_label && <p className="field-error">{errors.item_label}</p>}
      </fieldset>

      {answers.item?.category === "fund" && answers.label === answers.item.label && <fieldset className={s.group}>
        <legend>Berapa?</legend>
        <div className={s.chips} role="group" aria-label="Nominal cepat">
          {quickAmounts.map(amount => <button key={amount} type="button" className={s.chip} aria-pressed={answers.amount === amount} onClick={() => set({ amount })}>{formatRupiah(amount).replace(".000", " rb").replace("Rp ", "")}</button>)}
        </div>
        <label className={s.field}><span>Nominal</span>
          <input className="input" inputMode="numeric" value={answers.amount ? formatRupiah(answers.amount) : ""} placeholder="Rp 0" aria-invalid={!!errors.amount || undefined} onChange={change => set({ amount: parseRupiah(change.target.value) })} />
        </label>
        {errors.amount && <p className="field-error">{errors.amount}</p>}
        <div className={s.pay}>
          <p className={s.payTitle}>Transfer ke</p>
          {settings.accounts.map(account => <div key={account.id} className={s.account}>
            <div><p className={s.bank}>{account.bank}</p><p className={s.number}>{account.number}</p><p className={s.holder}>a.n. {account.holder}</p></div>
            <button type="button" className={s.copy} onClick={() => void copy(account.number, account.id)}>{copied === account.id ? <><Check size={16} aria-hidden="true" /> Disalin</> : <><Copy size={16} aria-hidden="true" /> Salin</>}</button>
          </div>)}
          {settings.qris.url && <div className={s.qris}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the committee's QRIS image */}
            <img src={settings.qris.url} alt="QRIS untuk donasi" />
            <a className={s.copy} href={settings.qris.url} download="qris-donasi" target="_blank" rel="noopener noreferrer"><Download size={16} aria-hidden="true" /> Unduh QRIS</a>
          </div>}
          <label className={s.upload}>
            <FileUp size={18} aria-hidden="true" />
            <span>{proof ? proof.name : `Unggah bukti transfer${settings.proofRequired ? "" : " (opsional)"}`}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={change => { setProof(change.target.files?.[0] ?? null); setErrors({}); }} />
          </label>
          {errors.proof && <p className="field-error">{errors.proof}</p>}
        </div>
      </fieldset>}

      {answers.item?.category === "goods" && answers.label === answers.item.label && <fieldset className={s.group}>
        <legend>Berapa?</legend>
        <div className={s.stepper}>
          <button type="button" onClick={() => set({ amount: Math.max(1, answers.amount - 1) })} aria-label="Kurangi"><Minus size={20} aria-hidden="true" /></button>
          <label><span className="sr-only">Jumlah</span><input className="input" inputMode="decimal" value={answers.amount || ""} onChange={change => set({ amount: Number(change.target.value.replace(",", ".")) || 0 })} aria-invalid={!!errors.amount || undefined} /></label>
          <span className={s.unit}>{answers.item.unit}</span>
          <button type="button" onClick={() => set({ amount: answers.amount + 1 })} aria-label="Tambah"><Plus size={20} aria-hidden="true" /></button>
        </div>
        {errors.amount && <p className="field-error">{errors.amount}</p>}
        {settings.goodsNote && <p className={s.goodsNote}>{settings.goodsNote}</p>}
      </fieldset>}

      <fieldset className={s.group}>
        <legend>Data Anda</legend>
        <label className={s.field}><span>Nama</span>
          <input className="input" value={answers.name} maxLength={150} autoComplete="name" aria-invalid={!!errors.donor_name || undefined} onChange={change => set({ name: change.target.value })} />
        </label>
        {errors.donor_name && <p className="field-error">{errors.donor_name}</p>}
        <div className={s.displays} role="radiogroup" aria-label="Tampil di daftar donatur sebagai">
          {donorDisplays.map(option => <label key={option.key} className={s.display} data-checked={answers.display === option.key || undefined}>
            <input type="radio" name="display" value={option.key} checked={answers.display === option.key} onChange={() => set({ display: option.key })} />
            <span className={s.displayLabel}>{option.label}</span>
            <span className={s.displayHint}>{option.hint}</span>
          </label>)}
        </div>
        <label className={s.field}><span>Nomor WhatsApp (opsional)</span>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={answers.phone} maxLength={30} placeholder="0812 3456 7890" aria-invalid={!!errors.donor_phone || undefined} onChange={change => set({ phone: change.target.value })} />
          <small>Untuk kabar saat bantuan diserahkan. Tidak ditampilkan.</small>
        </label>
        {errors.donor_phone && <p className="field-error">{errors.donor_phone}</p>}
        <label className={s.field}><span>Pesan atau doa (opsional)</span>
          <textarea className="textarea" rows={3} maxLength={500} value={answers.message} onChange={change => set({ message: change.target.value })} />
        </label>
      </fieldset>

      <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.trap} defaultValue="" />
      {message && <p className="field-error" role="alert">{message}</p>}
      <button type="submit" className={s.give} disabled={pending}><HandHeart size={22} aria-hidden="true" /> {pending ? "Mengirim…" : "Kirim donasi"}</button>
    </form>}
  </div>;
}
