"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Copy, Download, FileUp, HandHeart, Info, Minus, Package, Plus, Wallet, X } from "lucide-react";
import { describeDonation, donorLabel, donorDisplays, formatRupiah, otherGiftSuggestions, parseRupiah, type DonationCategory, type DonationItem, type DonorDisplay } from "@/lib/donations";
import { guestApi } from "@/lib/routes";
import { compressImage, fileSize } from "@/lib/compress-image";
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
type Gift = { item_key: string; item_label: string; category: DonationCategory; amount: number; unit: string };
/** One kind of goods the donor gives: its name (a listed one or their own words), how many, and a photo. */
type GoodsRow = { id: string; name: string; amount: number; photo: File | null };
const newRow = (): GoodsRow => ({ id: crypto.randomUUID().slice(0, 8), name: "", amount: 1, photo: null });
const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

/**
 * The donation form, full screen. It starts with one simple choice, Dana or Barang (or both). Barang
 * is one row to fill (the goods' name, with small suggestions under it, how many, and a photo) and a
 * button to add another. Photos are made smaller on the phone before they are sent. Then how to
 * hand it over (bank account and QRIS for money, the committee's note for goods), the donor's name
 * and how it appears, an optional WhatsApp number for the handover news, and a message or prayer.
 * Each gift is sent as its own donation, so the committee can receive them one by one.
 */
export function DonationForm({ event, preview = false, onClose }: { event: EventRecord; preview?: boolean; onClose: () => void }) {
  const settings = event.donation;
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<GoodsRow[]>([]);
  const [shrinking, setShrinking] = useState(0);
  const giveGoods = rows.length > 0;
  const [name, setName] = useState("");
  const [display, setDisplay] = useState<DonorDisplay>("name");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ name: string; gifts: string[] } | null>(null);
  const [copied, setCopied] = useState("");
  const identities = useRef<Record<string, RetryIdentity>>({});
  const sent = useRef<Set<string>>(new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const fundItems = settings.items.filter(item => item.category === "fund");
  const goodsItems = settings.items.filter(item => item.category !== "fund");
  const fund = fundItems.filter(item => item.key in picked);
  const giveFund = fund.length > 0;
  // The committee's goods first, then general examples, each once.
  const suggestions = useMemo(() => [...goodsItems.map(item => item.label), ...otherGiftSuggestions]
    .filter((label, index, all) => all.findIndex(other => other.toLowerCase() === label.toLowerCase()) === index).slice(0, 10), [goodsItems]);
  const listed = (name: string) => goodsItems.find(item => item.label.toLowerCase() === name.trim().toLowerCase());
  const touched = () => { setErrors({}); setMessage(""); };

  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  function toggle(item: DonationItem) {
    touched();
    setPicked(current => {
      const next = { ...current };
      if (item.key in next) delete next[item.key];
      else next[item.key] = item.category === "goods" ? 1 : 0;
      return next;
    });
  }
  /** Dana: picks the (first) money item, or drops every money item. */
  function toggleFund() {
    touched();
    setPicked(current => {
      const next = { ...current };
      if (fundItems.some(item => item.key in next)) for (const item of fundItems) delete next[item.key];
      else if (fundItems[0]) next[fundItems[0].key] = 0;
      return next;
    });
  }
  /** Barang: opens one row to fill; closing it drops every row. */
  function toggleGoods() {
    touched();
    setRows(giveGoods ? [] : [newRow()]);
  }
  const setRow = (id: string, patch: Partial<GoodsRow>) => { touched(); setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row)); };
  const setAmount = (key: string, amount: number) => { touched(); setPicked(current => ({ ...current, [key]: amount })); };
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text.replace(/\s/g, "")); setCopied(what); } catch { setCopied(""); }
  }

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    if (pending) return;
    // A listed goods name counts under its chip; anything else is written in the donor's own words.
    const named = rows.filter(row => row.name.trim());
    const gifts: (Gift & { key: string; photo: File | null })[] = [
      ...fund.map(item => ({ key: item.key, photo: proof, item_key: item.key, item_label: item.label, category: item.category, amount: picked[item.key] ?? 0, unit: item.unit })),
      ...named.map(row => {
        const item = listed(row.name);
        return { key: `barang-${row.id}`, photo: row.photo, item_key: item?.key ?? "", item_label: item?.label ?? row.name.trim(), category: item?.category ?? "other" as const, amount: row.amount, unit: item?.unit || "pcs" };
      }),
    ];
    const donor = { donor_name: display === "name" ? name.trim() : "", display, donor_phone: phone.trim(), message: note.trim(), website: honeypot.current?.value ?? "" };
    const next: Record<string, string> = {};
    if (!gifts.length) next.gift = giveGoods ? "Tulis barang yang ingin diberikan." : "Pilih bantuan yang ingin diberikan: dana atau barang.";
    if (settings.goodsPhotoRequired) for (const row of named) if (!row.photo) next[`photo:${row.id}`] = "Unggah foto barang ini.";
    const bodies = gifts.map(({ key, photo, ...gift }) => {
      identities.current[key] = submissionIdentity({ ...gift, ...donor, proof: photo ? `${photo.name}:${photo.size}` : "" }, identities.current[key] ?? null, () => crypto.randomUUID());
      const body = { ...gift, ...donor, idempotency_key: identities.current[key].key };
      const parsed = donationInputSchema.safeParse(body);
      if (!parsed.success) for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        next[field === "amount" || field === "item_label" ? `${field}:${key}` : field] ??= issue.message;
      }
      return { key, body, photo };
    });
    if (fund.length && settings.proofRequired && !proof) next.proof = "Unggah bukti transfer.";
    if (shrinking) next.form = "Tunggu sebentar, foto sedang dikecilkan.";
    if (Object.keys(next).length) { setErrors(next); setMessage("Periksa isian yang ditandai."); return; }
    const labels = bodies.map(({ body }) => describeDonation(body));
    if (preview) { setDone({ name: donorLabel(donor), gifts: labels }); return; }
    setPending(true);
    try {
      let proofSent = false;
      for (const { key, body, photo } of bodies) {
        // A gift already recorded on an earlier try is not sent again.
        if (sent.current.has(body.idempotency_key)) continue;
        const data = new FormData();
        data.set("payload", JSON.stringify(body));
        // The transfer proof goes with the (first) money; each goods photo with its own row.
        if (body.category === "fund" ? photo && !proofSent : photo) { data.set("proof", photo!); if (body.category === "fund") proofSent = true; }
        const response = await fetch(guestApi.donation(event), { method: "POST", body: data });
        const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; fieldErrors?: Record<string, string[]> } | null;
        if (!response.ok || !result?.ok) {
          setErrors(Object.fromEntries(Object.entries(result?.fieldErrors ?? {}).map(([field, list]) => [field === "amount" ? `amount:${key}` : field, list[0]])));
          setMessage(`${result?.message || "Donasi belum terkirim. Periksa koneksi, lalu coba lagi."}${sent.current.size ? " Bantuan yang sudah tercatat tidak akan terkirim dua kali." : ""}`);
          return;
        }
        sent.current.add(body.idempotency_key);
      }
      const shownName = donorLabel(donor);
      remember(event.id, { name: shownName, gift: labels.join(", "), at: new Date().toISOString() });
      setDone({ name: shownName, gifts: labels });
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
      <ul className={s.doneGifts}>{done.gifts.map(gift => <li key={gift} className={s.doneGift}>{gift}</li>)}</ul>
      <p>Panitia akan mengonfirmasi donasi Anda. Setelah dikonfirmasi, donasi ikut terhitung di halaman ini{phone ? ", dan Anda akan mendapat kabar lewat WhatsApp saat bantuan diserahkan" : ""}.</p>
      <button type="button" className={s.give} onClick={onClose}><Check size={20} aria-hidden="true" /> Selesai</button>
    </div>

    : <form className={s.form} onSubmit={submit} noValidate>
      <fieldset className={s.group}>
        <legend>Bantuan apa?</legend>
        <p className={s.hint}>Boleh pilih keduanya.</p>
        <div className={s.kinds}>
          {fundItems.length > 0 && <button type="button" className={s.kind} aria-pressed={giveFund} aria-label="Dana" aria-describedby="jenis-dana" onClick={toggleFund}>
            <span className={s.kindIcon}><Wallet size={22} aria-hidden="true" /></span>
            <span className={s.kindLabel}>Dana</span>
            <span className={s.kindHint} id="jenis-dana">Transfer{settings.qris.url ? " atau QRIS" : " rekening"}</span>
            {giveFund && <Check size={18} aria-hidden="true" className={s.kindCheck} />}
          </button>}
          <button type="button" className={s.kind} aria-pressed={giveGoods} aria-label="Barang" aria-describedby="jenis-barang" onClick={toggleGoods}>
            <span className={s.kindIcon}><Package size={22} aria-hidden="true" /></span>
            <span className={s.kindLabel}>Barang</span>
            <span className={s.kindHint} id="jenis-barang">{goodsItems.slice(0, 2).map(item => item.label).join(", ") || "Tulis barangnya"}{goodsItems.length > 2 ? ", dll." : ""}</span>
            {giveGoods && <Check size={18} aria-hidden="true" className={s.kindCheck} />}
          </button>
        </div>

        {fundItems.length > 1 && giveFund && <div className={s.chips} role="group" aria-label="Pilihan dana">
          {fundItems.map(item => <button key={item.key} type="button" className={s.chip} aria-pressed={item.key in picked} onClick={() => toggle(item)}>{item.key in picked && <Check size={16} aria-hidden="true" />} {item.label}</button>)}
        </div>}

        {giveGoods && <div className={s.goodsPick}>
          {rows.map((row, index) => {
            const item = listed(row.name);
            const unit = item?.unit || "pcs";
            const label = rows.length > 1 ? `Barang ${index + 1}` : "Barang";
            return <div key={row.id} className={s.goodsEntry} role="group" aria-label={label}>
              <div className={s.goodsEntryHead}>
                <span>{label}</span>
                {rows.length > 1 && <button type="button" className={s.remove} onClick={() => { touched(); setRows(current => current.filter(other => other.id !== row.id)); }}>Hapus</button>}
              </div>
              {/* The name and how many on one line: type the number, or tap minus and plus. */}
              <div className={s.goodsLine}>
                <input className="input" value={row.name} maxLength={120} placeholder="Mis. selimut" aria-label={rows.length > 1 ? `Nama barang ${index + 1}` : "Nama barang"} aria-invalid={!!errors[`item_label:barang-${row.id}`] || undefined} onChange={change => setRow(row.id, { name: change.target.value })} />
                <div className={s.qty}>
                  <button type="button" onClick={() => setRow(row.id, { amount: Math.max(1, row.amount - 1) })} aria-label={`Kurangi ${row.name || "barang"}`}><Minus size={16} aria-hidden="true" /></button>
                  <input className="input" inputMode="decimal" aria-label={`Jumlah ${row.name || "barang"}`} value={row.amount || ""} onChange={change => setRow(row.id, { amount: Number(change.target.value.replace(",", ".")) || 0 })} aria-invalid={!!errors[`amount:barang-${row.id}`] || undefined} />
                  <span className={s.qtyUnit}>{unit}</span>
                  <button type="button" onClick={() => setRow(row.id, { amount: row.amount + 1 })} aria-label={`Tambah jumlah ${row.name || "barang"}`}><Plus size={16} aria-hidden="true" /></button>
                </div>
              </div>
              <div className={s.chips} role="group" aria-label="Saran barang">
                {suggestions.map(text => <button key={text} type="button" className={s.suggest} aria-pressed={row.name.trim().toLowerCase() === text.toLowerCase()} onClick={() => setRow(row.id, { name: text })}>{text}</button>)}
              </div>
              {errors[`item_label:barang-${row.id}`] && <p className="field-error">{errors[`item_label:barang-${row.id}`]}</p>}
              {errors[`amount:barang-${row.id}`] && <p className="field-error">{errors[`amount:barang-${row.id}`]}</p>}
              <PhotoPick label={`Foto barang${settings.goodsPhotoRequired ? "" : " (opsional)"}`} accept={PHOTO_TYPES} file={row.photo} error={errors[`photo:${row.id}`]}
                onBusy={busy => setShrinking(count => count + (busy ? 1 : -1))} onChange={photo => setRow(row.id, { photo })} />
            </div>;
          })}
          <button type="button" className={s.addGoods} disabled={rows.length >= 10} onClick={() => { touched(); setRows(current => [...current, newRow()]); }}><Plus size={18} aria-hidden="true" /> Tambah barang</button>
          {settings.goodsNote && <p className={s.goodsNote}>{settings.goodsNote}</p>}
        </div>}
        {errors.gift && <p className="field-error">{errors.gift}</p>}
      </fieldset>

      {fund.map(item => <fieldset key={item.key} className={s.group}>
        <legend>{item.label}: berapa?</legend>
        <div className={s.chips} role="group" aria-label={`Nominal cepat ${item.label}`}>
          {quickAmounts.map(amount => <button key={amount} type="button" className={s.chip} aria-pressed={picked[item.key] === amount} onClick={() => setAmount(item.key, amount)}>{formatRupiah(amount).replace(".000", " rb").replace("Rp ", "")}</button>)}
        </div>
        <label className={s.field}><span>Nominal {item.label.toLowerCase()}</span>
          <input className="input" inputMode="numeric" value={picked[item.key] ? formatRupiah(picked[item.key]) : ""} placeholder="Rp 0" aria-invalid={!!errors[`amount:${item.key}`] || undefined} onChange={change => setAmount(item.key, parseRupiah(change.target.value))} />
        </label>
        {errors[`amount:${item.key}`] && <p className="field-error">{errors[`amount:${item.key}`]}</p>}
      </fieldset>)}

      {fund.length > 0 && <div className={s.pay}>
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
        <PhotoPick label={`Unggah bukti transfer${settings.proofRequired ? "" : " (opsional)"}`} accept={`${PHOTO_TYPES},application/pdf`} file={proof} error={errors.proof}
          onBusy={busy => setShrinking(count => count + (busy ? 1 : -1))} onChange={file => { touched(); setProof(file); }} />
      </div>}

      <fieldset className={s.group}>
        <legend>Data Anda</legend>
        <p className={s.hint}>Bagaimana Anda ingin tercantum?</p>
        <div className={s.displays} role="radiogroup" aria-label="Tampil di daftar donatur sebagai">
          {donorDisplays.map(option => <label key={option.key} className={s.display} data-checked={display === option.key || undefined}>
            <input type="radio" name="display" value={option.key} checked={display === option.key} onChange={() => { touched(); setDisplay(option.key); }} />
            <span className={s.displayLabel}>{option.label}</span>
            <span className={s.displayHint}>{option.hint}</span>
          </label>)}
        </div>
        {display === "name" ? <>
          <label className={s.field}><span>Nama</span>
            <input className="input" value={name} maxLength={150} autoComplete="name" aria-invalid={!!errors.donor_name || undefined} onChange={change => { touched(); setName(change.target.value); }} />
          </label>
          {errors.donor_name && <p className="field-error">{errors.donor_name}</p>}
        </> : <p className={s.assure}><Info size={18} aria-hidden="true" /> Tidak perlu mengisi nama. Donasi Anda tetap dikonfirmasi panitia dan ikut terhitung di total, tanpa nama di mana pun, termasuk di catatan panitia.</p>}
        <label className={s.field}><span>Nomor WhatsApp (opsional)</span>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={30} placeholder="0812 3456 7890" aria-invalid={!!errors.donor_phone || undefined} onChange={change => { touched(); setPhone(change.target.value); }} />
          <small>Untuk kabar saat bantuan diserahkan. Tidak ditampilkan.</small>
        </label>
        {errors.donor_phone && <p className="field-error">{errors.donor_phone}</p>}
        <label className={s.field}><span>Pesan atau doa (opsional)</span>
          <textarea className="textarea" rows={3} maxLength={500} value={note} onChange={change => setNote(change.target.value)} />
        </label>
      </fieldset>

      <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.trap} defaultValue="" />
      {(message || errors.form) && <p className="field-error" role="alert">{errors.form || message}</p>}
      {/* Stays in view at the bottom, above Safari's address bar on an iPhone, so sending never needs a hunt. */}
      <div className={s.submitBar}><button type="submit" className={s.give} disabled={pending}><HandHeart size={22} aria-hidden="true" /> {pending ? "Mengirim…" : "Kirim donasi"}</button></div>
    </form>}
  </div>;
}

/**
 * A photo (or, for a transfer, a PDF) to send with a gift. A photo is made smaller right away, on
 * the phone, and shown as a small preview with its new size; nothing large leaves the phone.
 */
function PhotoPick({ label, accept, file, error, onChange, onBusy }: { label: string; accept: string; file: File | null; error?: string; onChange: (file: File | null) => void; onBusy: (busy: boolean) => void }) {
  const [working, setWorking] = useState(false);
  const preview = useMemo(() => file && file.type.startsWith("image/") && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function pick(picked: File | null) {
    if (!picked) return;
    setWorking(true); onBusy(true);
    try { onChange(await compressImage(picked)); }
    finally { setWorking(false); onBusy(false); }
  }
  return <div className={s.photoPick}>
    <label className={s.upload}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen photo */}
      {preview ? <img src={preview} alt="" className={s.thumb} /> : <FileUp size={18} aria-hidden="true" />}
      <span>{working ? "Mengecilkan foto…" : file ? `${file.name} · ${fileSize(file.size)}` : label}</span>
      <input type="file" accept={accept} className="sr-only" aria-label={label} onChange={change => { const picked = change.target.files?.[0] ?? null; change.target.value = ""; void pick(picked); }} />
    </label>
    {file && !working && <button type="button" className={s.chipSmall} onClick={() => onChange(null)}><X size={14} aria-hidden="true" /> Hapus foto</button>}
    {error && <p className="field-error">{error}</p>}
  </div>;
}
