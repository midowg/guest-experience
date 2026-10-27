"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { donorDisplays, parseRupiah, type DonationItem, type DonationRecord, type DonorDisplay } from "@/lib/donations";
import { adminApi } from "@/lib/routes";
import s from "./donations.module.css";

/** A donation handed over in person (cash, goods dropped off), recorded as already received. */
export function ManualDonation({ eventId, items, onAdded, onCancel }: { eventId: string; items: DonationItem[]; onAdded: (donation: DonationRecord) => void; onCancel: () => void }) {
  const [item, setItem] = useState<DonationItem | null>(items[0] ?? null);
  const [label, setLabel] = useState(items[0]?.label ?? "");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [display, setDisplay] = useState<DonorDisplay>("name");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const chosen = item && label === item.label ? item : null;

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    setPending(true); setError("");
    try {
      const body = {
        item_key: chosen?.key ?? "", item_label: label.trim(), category: chosen?.category ?? "other", unit: chosen?.unit ?? "",
        amount: chosen?.category === "fund" ? parseRupiah(amount) : Number(amount.replace(",", ".")) || 0,
        donor_name: name.trim(), display, donor_phone: phone.trim(), message: message.trim(),
      };
      const result = await adminRequest<DonationRecord>(adminApi(eventId, "donations"), { method: "POST", body: JSON.stringify(body) });
      if (result.data) onAdded(result.data);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setPending(false); }
  }

  return <form className={s.manual} onSubmit={submit} aria-label="Tambah donasi manual">
    <p className="field-hint">Untuk dana tunai atau barang yang diserahkan langsung ke panitia. Langsung tercatat sebagai diterima.</p>
    <div className={s.chips} role="group" aria-label="Bantuan">
      {items.map(option => <button key={option.key} type="button" aria-pressed={chosen?.key === option.key} onClick={() => { setItem(option); setLabel(option.label); }}>{option.label}</button>)}
    </div>
    <div className={s.grid}>
      <label className={s.field}><span>Bantuan</span><input className="input" value={label} maxLength={120} onChange={change => setLabel(change.target.value)} required /></label>
      <label className={s.field}><span>{chosen?.category === "fund" ? "Nominal (Rp)" : `Jumlah${chosen?.unit ? ` (${chosen.unit})` : ""}`}</span><input className="input" inputMode="decimal" value={amount} onChange={change => setAmount(change.target.value)} /></label>
      <label className={s.field}><span>Nama donatur</span><input className="input" value={name} maxLength={150} onChange={change => setName(change.target.value)} required /></label>
      <label className={s.field}><span>Tampil sebagai</span><select className="select" value={display} onChange={change => setDisplay(change.target.value as DonorDisplay)}>
        {donorDisplays.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select></label>
      <label className={s.field}><span>WhatsApp (opsional)</span><input className="input" type="tel" value={phone} maxLength={30} onChange={change => setPhone(change.target.value)} /></label>
      <label className={s.field}><span>Pesan (opsional)</span><input className="input" value={message} maxLength={500} onChange={change => setMessage(change.target.value)} /></label>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className={s.tools}>
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan sebagai diterima"}</Button>
      <Button type="button" variant="quiet" onClick={onCancel}>Batal</Button>
    </div>
  </form>;
}
