"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Check, OrderButtons, SuggestionChips } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { defaultDonationItems, defaultNotifyTemplate, prayerSuggestions, type DonationCategory, type DonationItem, type DonationSettings } from "@/lib/donations";
import { fromZoneInput, toZoneInput } from "@/lib/format";
import d from "./donation-block.module.css";

const categories: { value: DonationCategory; label: string }[] = [{ value: "fund", label: "Dana" }, { value: "goods", label: "Barang" }, { value: "other", label: "Lainnya" }];
const placeholders = ["{nama}", "{bantuan}", "{jumlah}", "{tanggal_serah}", "{acara}", "{tautan}", "{doa}"];
const showLabels: { key: keyof DonationSettings["show"]; label: string; hint: string }[] = [
  { key: "fundTotal", label: "Total dana terkumpul", hint: "Jumlah rupiah yang sudah diterima panitia." },
  { key: "fundTarget", label: "Target dan progres dana", hint: "Bilah progres bila target dana diisi." },
  { key: "goods", label: "Barang terkumpul", hint: "Kartu per jenis barang, dan jumlah bantuan lain." },
  { key: "donors", label: "Daftar donatur", hint: "Nama (atau Hamba Allah) dan bantuannya. Yang memilih tidak disebutkan tetap tersembunyi." },
  { key: "donorAmounts", label: "Nominal dana per donatur", hint: "Mati: daftar hanya menulis “Dana” tanpa nominal." },
  { key: "messages", label: "Pesan dan doa donatur", hint: "Pesan yang ditulis donatur di bawah namanya." },
];
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bantuan";

/**
 * CSR donations in the editor: the chips donors pick from, how money is paid, what goods donors
 * need to know, what the public page shows, and the handover news with its WhatsApp message.
 * Donations themselves are received or rejected on the "Donasi masuk" page.
 */
export function DonationBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors } = kit;
  const donation = event.donation;
  const set = (patch: Partial<DonationSettings>) => update("donation", { ...donation, ...patch });
  const setItem = (index: number, patch: Partial<DonationItem>) => set({ items: donation.items.map((item, at) => at === index ? { ...item, ...patch } : item) });
  const tz = event.timezone;

  function addItem() {
    const keys = new Set(donation.items.map(item => item.key));
    let n = 1; while (keys.has(`bantuan-${n}`)) n++;
    set({ items: [...donation.items, { key: `bantuan-${n}`, label: "", category: "goods", unit: "", target: null }] });
  }

  return <div className="stack">
    <p>Halaman donasi menampilkan apa yang sudah terkumpul, daftar donatur, dan tombol <strong>Donasi sekarang</strong>. Hanya donasi yang Anda <strong>terima</strong> di halaman <em>Donasi masuk</em> yang dihitung.</p>

    <section className={d.part} aria-labelledby="donasi-bantuan">
      <h3 id="donasi-bantuan">Pilihan bantuan</h3>
      <p className="field-hint">Muncul sebagai tombol di form. Satu ketukan mengisi bantuan dan satuannya; donatur tetap bisa menulis bantuan lain sendiri.</p>
      {errors["donation.items"] && <p className="field-error" id="donation.items">{errors["donation.items"].join(" ")}</p>}
      <ol className={d.items}>
        {donation.items.map((item, index) => <li key={index} className={d.item}>
          <div className={d.itemRow}>
            <label className={d.field}><span>Nama bantuan</span><input className="input" value={item.label} maxLength={60} placeholder="Sembako"
              onChange={change => setItem(index, { label: change.target.value, ...(item.key.startsWith("bantuan-") && change.target.value ? { key: uniqueKey(slug(change.target.value), donation.items, index) } : {}) })} /></label>
            <label className={d.field}><span>Kelompok</span><select className="select" value={item.category} onChange={change => setItem(index, { category: change.target.value as DonationCategory, unit: change.target.value === "fund" ? "Rp" : item.unit === "Rp" ? "" : item.unit })}>
              {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            {item.category === "goods" && <label className={d.field}><span>Satuan</span><input className="input" value={item.unit} maxLength={20} placeholder="paket" onChange={change => setItem(index, { unit: change.target.value })} /></label>}
            {item.category !== "other" && <label className={d.field}><span>Target {item.category === "fund" ? "(Rp)" : ""} <small>opsional</small></span>
              <input className="input" inputMode="numeric" value={item.target ?? ""} onChange={change => { const value = Number(change.target.value.replace(/\D/g, "")); setItem(index, { target: value > 0 ? value : null }); }} /></label>}
          </div>
          <div className={d.itemTools}>
            <OrderButtons label={item.label || `bantuan ${index + 1}`} index={index} length={donation.items.length} onMove={direction => set({ items: moveItem(donation.items, index, direction) })} />
            <Button type="button" variant="quiet" onClick={() => set({ items: donation.items.filter((_, at) => at !== index) })} aria-label={`Hapus ${item.label || `bantuan ${index + 1}`}`}><Trash2 size={16} aria-hidden="true" /></Button>
          </div>
        </li>)}
      </ol>
      <div className={d.tools}>
        <Button type="button" variant="secondary" disabled={donation.items.length >= 40} onClick={addItem}><Plus size={16} aria-hidden="true" /> Tambah bantuan</Button>
        <Button type="button" variant="quiet" onClick={() => { if (!donation.items.length || window.confirm("Ganti daftar dengan pilihan bawaan? Target yang sudah diisi ikut hilang.")) set({ items: defaultDonationItems() }); }}><RotateCcw size={16} aria-hidden="true" /> Pilihan bawaan</Button>
      </div>
    </section>

    <section className={d.part} aria-labelledby="donasi-bayar">
      <h3 id="donasi-bayar">Pembayaran dana</h3>
      <p className="field-hint">Donatur mentransfer sendiri. Nomor rekening tampil dengan tombol Salin; QRIS bisa diunduh.</p>
      {errors["donation.accounts"] && <p className="field-error" id="donation.accounts">{errors["donation.accounts"].join(" ")}</p>}
      {donation.accounts.map((account, index) => <div key={account.id} className={d.itemRow}>
        <label className={d.field}><span>Bank</span><input className="input" value={account.bank} maxLength={60} placeholder="BCA" onChange={change => set({ accounts: donation.accounts.map((item, at) => at === index ? { ...item, bank: change.target.value } : item) })} /></label>
        <label className={d.field}><span>Nomor rekening</span><input className="input" inputMode="numeric" value={account.number} maxLength={40} onChange={change => set({ accounts: donation.accounts.map((item, at) => at === index ? { ...item, number: change.target.value } : item) })} /></label>
        <label className={d.field}><span>Atas nama</span><input className="input" value={account.holder} maxLength={120} onChange={change => set({ accounts: donation.accounts.map((item, at) => at === index ? { ...item, holder: change.target.value } : item) })} /></label>
        <Button type="button" variant="quiet" onClick={() => set({ accounts: donation.accounts.filter((_, at) => at !== index) })} aria-label={`Hapus rekening ${account.bank}`}><Trash2 size={16} aria-hidden="true" /></Button>
      </div>)}
      <Button type="button" variant="secondary" disabled={donation.accounts.length >= 5} onClick={() => set({ accounts: [...donation.accounts, { id: `rek-${Date.now().toString(36)}`, bank: "", number: "", holder: "" }] })}><Plus size={16} aria-hidden="true" /> Tambah rekening</Button>
      <PhotoField name="donation.qris.url" label="Gambar QRIS (opsional)" value={donation.qris.url} srcset={donation.qris.srcset} hint="Unggah gambar QRIS resmi milik panitia atau yayasan." onChange={value => set({ qris: { ...donation.qris, ...value, alt: "QRIS untuk donasi" } })} error={errors["donation.qris.url"]?.join(" ")} />
      <Check label="Wajib unggah bukti transfer" checked={donation.proofRequired} onChange={value => set({ proofRequired: value })} />
    </section>

    <section className={d.part} aria-labelledby="donasi-barang">
      <h3 id="donasi-barang">Barang dan batas waktu</h3>
      {control("donation.goodsNote", "Cara menyerahkan barang", donation.goodsNote, value => set({ goodsNote: value }), { multiline: true, maxLength: 1000, hint: "Muncul saat donatur memilih barang. Misalnya alamat titip, jam, batas tanggal, atau bahwa panitia bisa menjemput." })}
      <label className={d.field}><span>Donasi ditutup pada <small>opsional</small></span>
        <input id="donation.closesAt" className="input" type="datetime-local" value={toZoneInput(donation.closesAt, tz)} onChange={change => set({ closesAt: fromZoneInput(change.target.value, tz) || null })} />
        <small className="field-hint">Setelah lewat, tombol Donasi diganti tulisan “Donasi sudah ditutup”. Total dan daftar donatur tetap tampil.</small>
      </label>
    </section>

    <section className={d.part} aria-labelledby="donasi-tampil">
      <h3 id="donasi-tampil">Yang tampil di halaman</h3>
      <div className={d.switches}>
        {showLabels.map(option => <label key={option.key} className={d.switch}>
          <input type="checkbox" role="switch" checked={donation.show[option.key]} onChange={change => set({ show: { ...donation.show, [option.key]: change.target.checked } })} />
          <span><strong>{option.label}</strong><small>{option.hint}</small></span>
        </label>)}
      </div>
    </section>

    <section className={d.part} aria-labelledby="donasi-serah">
      <h3 id="donasi-serah">Kabar penyerahan</h3>
      <p className="field-hint">Isi setelah bantuan diserahkan. Halaman donasi menampilkan kabarnya, dan di halaman <em>Donasi masuk</em> muncul tombol kirim WhatsApp ke tiap donatur.</p>
      <label className={d.field}><span>Tanggal diserahkan</span>
        <input id="donation.delivered.at" className="input" type="date" value={donation.delivered.at ? toZoneInput(donation.delivered.at, tz).slice(0, 10) : ""} onChange={change => set({ delivered: { ...donation.delivered, at: change.target.value ? fromZoneInput(`${change.target.value}T10:00`, tz) || null : null } })} />
      </label>
      <PhotoField name="donation.delivered.photo.url" label="Foto penyerahan (opsional)" value={donation.delivered.photo.url} srcset={donation.delivered.photo.srcset} onChange={value => set({ delivered: { ...donation.delivered, photo: { ...donation.delivered.photo, ...value, alt: donation.delivered.photo.alt || "Foto penyerahan bantuan" } } })} />
      {control("donation.delivered.note", "Ucapan di halaman", donation.delivered.note, value => set({ delivered: { ...donation.delivered, note: value } }), { multiline: true, maxLength: 1000 })}
      {control("donation.notify.template", "Pesan WhatsApp ke donatur", donation.notify.template, value => set({ notify: { ...donation.notify, template: value } }), { multiline: true, maxLength: 2000, hint: `Isian otomatis: ${placeholders.join(" ")}. Tiap donatur menerima pesan dengan namanya dan bantuannya sendiri.` })}
      <div className={d.tools}>
        <Button type="button" variant="quiet" onClick={() => set({ notify: { ...donation.notify, template: defaultNotifyTemplate } })}><RotateCcw size={16} aria-hidden="true" /> Pesan bawaan</Button>
      </div>
      {control("donation.notify.prayer", "Doa penutup", donation.notify.prayer, value => set({ notify: { ...donation.notify, prayer: value } }), { maxLength: 300, hint: "Masuk ke pesan lewat {doa}." })}
      <SuggestionChips field="Doa penutup" value={donation.notify.prayer} onPick={value => set({ notify: { ...donation.notify, prayer: value } })} options={prayerSuggestions.map(text => ({ label: text.split(/[,.]/)[0], value: text }))} />
    </section>
    <p className="field-hint">Butuh pengingat? Donasi baru masuk berstatus <strong>Menunggu</strong> sampai Anda cek mutasi rekening atau barangnya, lalu tekan Terima.</p>
  </div>;
}

function uniqueKey(base: string, items: DonationItem[], self: number) {
  const taken = new Set(items.filter((_, at) => at !== self).map(item => item.key));
  let key = base, n = 2;
  while (taken.has(key)) key = `${base}-${n++}`;
  return key;
}
