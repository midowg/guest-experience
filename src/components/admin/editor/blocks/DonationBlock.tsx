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

/*
 * Friday Sharing (CSR) in the editor, one block per job: what can be given, how money is paid, who
 * receives the help, what the page shows, and the handover news with its WhatsApp message.
 * Donations themselves are received or rejected on the "Donasi masuk" page.
 */

const categories: { value: DonationCategory; label: string }[] = [{ value: "fund", label: "Dana" }, { value: "goods", label: "Barang" }, { value: "other", label: "Lainnya" }];
const placeholders = ["{nama}", "{bantuan}", "{jumlah}", "{tanggal_serah}", "{penerima}", "{acara}", "{tautan}", "{doa}"];
const showLabels: { key: keyof DonationSettings["show"]; label: string; hint: string }[] = [
  { key: "fundTotal", label: "Total dana terkumpul", hint: "Jumlah rupiah yang sudah diterima panitia." },
  { key: "fundTarget", label: "Target dan progres dana", hint: "Bilah progres bila target dana diisi." },
  { key: "goods", label: "Barang terkumpul", hint: "Kartu per jenis barang, dan jumlah bantuan lain." },
  { key: "donors", label: "Daftar donatur", hint: "Nama (atau Hamba Allah) dan bantuannya. Yang memilih tidak disebutkan tetap tersembunyi." },
  { key: "donorAmounts", label: "Nominal dana per donatur", hint: "Mati: daftar hanya menulis “Dana” tanpa nominal." },
  { key: "messages", label: "Pesan dan doa donatur", hint: "Pesan yang ditulis donatur di bawah namanya." },
];
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "bantuan";
const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

function useDonation(kit: EditorKit) {
  const donation = kit.event.donation;
  return { donation, set: (patch: Partial<DonationSettings>) => kit.update("donation", { ...donation, ...patch }) };
}

/** The chips donors pick from, goods' handover note and when donations close. */
export function DonationItemsBlock({ kit }: { kit: EditorKit }) {
  const { event, control, errors } = kit;
  const { donation, set } = useDonation(kit);
  const setItem = (index: number, patch: Partial<DonationItem>) => set({ items: donation.items.map((item, at) => at === index ? { ...item, ...patch } : item) });
  const tz = event.timezone;
  function addItem() {
    const keys = new Set(donation.items.map(item => item.key));
    let n = 1; while (keys.has(`bantuan-${n}`)) n++;
    set({ items: [...donation.items, { key: `bantuan-${n}`, label: "", category: "goods", unit: "pcs", target: null }] });
  }
  return <div className="stack">
    <p>Muncul sebagai tombol di form donasi. Donatur boleh memilih <strong>beberapa sekaligus</strong> dan mengisi jumlahnya masing-masing, atau menulis bantuan lain sendiri. Switch di kanan atas membuka atau menutup penerimaan donasi.</p>
    {errors["donation.items"] && <p className="field-error" id="donation.items">{errors["donation.items"].join(" ")}</p>}
    {/* One line per gift, like a table: easy to scan and to fill. */}
    <div className={d.listHead} aria-hidden="true"><span>Nama bantuan</span><span>Kelompok</span><span>Satuan</span><span>Target <small>opsional</small></span><span /></div>
    <ol className={d.list}>
      {donation.items.map((item, index) => <li key={index} className={d.listRow}>
        <input className="input" aria-label="Nama bantuan" value={item.label} maxLength={60} placeholder="Nama bantuan"
          onChange={change => setItem(index, { label: change.target.value, ...(item.key.startsWith("bantuan-") && change.target.value ? { key: uniqueKey(slug(change.target.value), donation.items, index) } : {}) })} />
        <select className="select" aria-label={`Kelompok ${item.label || `bantuan ${index + 1}`}`} value={item.category} onChange={change => setItem(index, { category: change.target.value as DonationCategory, unit: change.target.value === "fund" ? "Rp" : item.unit === "Rp" ? "pcs" : item.unit })}>
          {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {item.category === "goods"
          ? <input className="input" aria-label={`Satuan ${item.label || `bantuan ${index + 1}`}`} value={item.unit} maxLength={20} placeholder="pcs" onChange={change => setItem(index, { unit: change.target.value })} />
          : <span className={d.dash}>{item.category === "fund" ? "Rp" : "-"}</span>}
        {item.category !== "other"
          ? <input className="input" aria-label={`Target ${item.label || `bantuan ${index + 1}`}`} inputMode="numeric" placeholder="Target" value={item.target ?? ""} onChange={change => { const value = Number(change.target.value.replace(/\D/g, "")); setItem(index, { target: value > 0 ? value : null }); }} />
          : <span className={d.dash}>-</span>}
        <div className={d.listTools}>
          <OrderButtons label={item.label || `bantuan ${index + 1}`} index={index} length={donation.items.length} onMove={direction => set({ items: moveItem(donation.items, index, direction) })} />
          <Button type="button" variant="quiet" onClick={() => set({ items: donation.items.filter((_, at) => at !== index) })} aria-label={`Hapus ${item.label || `bantuan ${index + 1}`}`}><Trash2 size={16} aria-hidden="true" /></Button>
        </div>
      </li>)}
    </ol>
    <div className={d.tools}>
      <Button type="button" variant="secondary" disabled={donation.items.length >= 40} onClick={addItem}><Plus size={16} aria-hidden="true" /> Tambah bantuan</Button>
      <Button type="button" variant="quiet" onClick={() => { if (!donation.items.length || window.confirm("Ganti daftar dengan pilihan bawaan? Target yang sudah diisi ikut hilang.")) set({ items: defaultDonationItems() }); }}><RotateCcw size={16} aria-hidden="true" /> Pilihan bawaan</Button>
    </div>
    {control("donation.goodsNote", "Cara menyerahkan barang", donation.goodsNote, value => set({ goodsNote: value }), { multiline: true, maxLength: 1000, hint: "Muncul saat donatur memilih barang. Misalnya alamat titip, jam, batas tanggal, atau bahwa panitia bisa menjemput." })}
    <Check label="Wajib foto barang" checked={donation.goodsPhotoRequired} onChange={value => set({ goodsPhotoRequired: value })} />
    <p className="field-hint">Bila menyala, donatur harus menyertakan foto tiap barang. Foto dikecilkan di HP donatur sebelum dikirim, dan tampil di Donasi masuk saat konfirmasi.</p>
    <label className={d.field}><span>Donasi ditutup pada <small>opsional</small></span>
      <input id="donation.closesAt" className="input" type="datetime-local" value={toZoneInput(donation.closesAt, tz)} onChange={change => set({ closesAt: fromZoneInput(change.target.value, tz) || null })} />
      <small className="field-hint">Setelah lewat, tombol Donasi diganti tulisan “Donasi sudah ditutup”. Total dan daftar donatur tetap tampil.</small>
    </label>
  </div>;
}

/** Bank accounts (copied with one tap on the page), the QRIS image, and whether a proof is required. */
export function DonationPaymentBlock({ kit }: { kit: EditorKit }) {
  const { errors } = kit;
  const { donation, set } = useDonation(kit);
  const setAccount = (index: number, patch: Partial<DonationSettings["accounts"][number]>) => set({ accounts: donation.accounts.map((item, at) => at === index ? { ...item, ...patch } : item) });
  return <div className="stack">
    <p>Donatur mentransfer sendiri. Nomor rekening tampil dengan tombol Salin, dan QRIS bisa diunduh. Setiap transfer tetap Anda cek di mutasi sebelum ditekan <strong>Terima</strong>.</p>
    {errors["donation.accounts"] && <p className="field-error" id="donation.accounts">{errors["donation.accounts"].join(" ")}</p>}
    {donation.accounts.map((account, index) => <div key={account.id} className={d.item}>
      <div className={d.itemRow}>
        <label className={d.field}><span>Bank</span><input className="input" value={account.bank} maxLength={60} placeholder="BCA" onChange={change => setAccount(index, { bank: change.target.value })} /></label>
        <label className={d.field}><span>Nomor rekening</span><input className="input" inputMode="numeric" value={account.number} maxLength={40} onChange={change => setAccount(index, { number: change.target.value })} /></label>
        <label className={d.field}><span>Atas nama</span><input className="input" value={account.holder} maxLength={120} onChange={change => setAccount(index, { holder: change.target.value })} /></label>
      </div>
      <div className={d.itemTools}><span /><Button type="button" variant="quiet" onClick={() => set({ accounts: donation.accounts.filter((_, at) => at !== index) })} aria-label={`Hapus rekening ${account.bank}`}><Trash2 size={16} aria-hidden="true" /></Button></div>
    </div>)}
    <Button type="button" variant="secondary" disabled={donation.accounts.length >= 5} onClick={() => set({ accounts: [...donation.accounts, { id: newId("rek"), bank: "", number: "", holder: "" }] })}><Plus size={16} aria-hidden="true" /> Tambah rekening</Button>
    <PhotoField name="donation.qris.url" label="Gambar QRIS (opsional)" value={donation.qris.url} srcset={donation.qris.srcset} hint="Unggah gambar QRIS resmi milik panitia atau yayasan." onChange={value => set({ qris: { ...donation.qris, ...value, alt: "QRIS untuk donasi" } })} error={errors["donation.qris.url"]?.join(" ")} />
    <Check label="Wajib unggah bukti transfer" checked={donation.proofRequired} onChange={value => set({ proofRequired: value })} />
  </div>;
}

/** Who receives the help: one or more, shown on the page under "Disalurkan ke". */
export function DonationRecipientsBlock({ kit }: { kit: EditorKit }) {
  const { errors } = kit;
  const { donation, set } = useDonation(kit);
  const setRecipient = (index: number, patch: Partial<DonationSettings["recipients"][number]>) => set({ recipients: donation.recipients.map((item, at) => at === index ? { ...item, ...patch } : item) });
  return <div className="stack">
    <p>Ke mana bantuan ini disalurkan. Boleh lebih dari satu, misalnya dua panti asuhan dan satu sekolah. Tampil di halaman donasi sebagai <strong>Disalurkan ke</strong>, dan namanya masuk ke pesan WhatsApp lewat <code>{"{penerima}"}</code>. Apa yang diserahkan ke masing-masing diatur di <strong>Donasi → Pembagian</strong>.</p>
    {!donation.recipients.length && <p className="field-hint">Belum ada penerima. Halaman donasi tetap bisa terbit tanpa bagian ini.</p>}
    <ol className={d.items}>
      {donation.recipients.map((recipient, index) => <li key={recipient.id} className={d.item}>
        <div className={d.itemRow}>
          <label className={d.field}><span>Nama penerima</span><input id={`donation.recipients.${index}.name`} className="input" value={recipient.name} maxLength={150} placeholder="Panti Asuhan Kasih Ibu" aria-invalid={!!errors[`donation.recipients.${index}.name`] || undefined} onChange={change => setRecipient(index, { name: change.target.value })} /></label>
          <label className={d.field}><span>Lokasi <small>opsional</small></span><input className="input" value={recipient.place} maxLength={200} placeholder="Sleman, Yogyakarta" onChange={change => setRecipient(index, { place: change.target.value })} /></label>
        </div>
        {errors[`donation.recipients.${index}.name`] && <p className="field-error">{errors[`donation.recipients.${index}.name`].join(" ")}</p>}
        <label className={d.field}><span>Keterangan <small>opsional</small></span><textarea className="textarea" rows={2} value={recipient.description} maxLength={500} placeholder="60 anak usia sekolah; kebutuhan utama perlengkapan sekolah dan sembako." onChange={change => setRecipient(index, { description: change.target.value })} /></label>
        <PhotoField name={`donation.recipients.${index}.photo.url`} label="Foto (opsional)" value={recipient.photo.url} srcset={recipient.photo.srcset} onChange={value => setRecipient(index, { photo: { ...recipient.photo, ...value, alt: recipient.photo.alt || `Foto ${recipient.name || "penerima bantuan"}` } })} />
        <div className={d.itemTools}>
          <OrderButtons label={recipient.name || `penerima ${index + 1}`} index={index} length={donation.recipients.length} onMove={direction => set({ recipients: moveItem(donation.recipients, index, direction) })} />
          <Button type="button" variant="quiet" onClick={() => set({ recipients: donation.recipients.filter((_, at) => at !== index) })} aria-label={`Hapus ${recipient.name || `penerima ${index + 1}`}`}><Trash2 size={16} aria-hidden="true" /></Button>
        </div>
      </li>)}
    </ol>
    <Button type="button" variant="secondary" disabled={donation.recipients.length >= 20} onClick={() => set({ recipients: [...donation.recipients, { id: newId("penerima"), name: "", description: "", place: "", photo: { url: "", alt: "", srcset: [] } }] })}><Plus size={16} aria-hidden="true" /> Tambah penerima</Button>
  </div>;
}

/** What the public page shows: totals, target, goods, the donor list, amounts and messages. */
export function DonationDisplayBlock({ kit }: { kit: EditorKit }) {
  const { donation, set } = useDonation(kit);
  return <div className="stack">
    <p>Hanya donasi yang Anda <strong>terima</strong> di halaman <em>Donasi masuk</em> yang dihitung dan tampil.</p>
    <div className={d.switches}>
      {showLabels.map(option => <label key={option.key} className={d.switch}>
        <input type="checkbox" role="switch" checked={donation.show[option.key]} onChange={change => set({ show: { ...donation.show, [option.key]: change.target.checked } })} />
        <span><strong>{option.label}</strong><small>{option.hint}</small></span>
      </label>)}
    </div>
  </div>;
}

/** After the handover: the date, a photo and words on the page, and the WhatsApp message to each donor. */
export function DonationNewsBlock({ kit }: { kit: EditorKit }) {
  const { event, control } = kit;
  const { donation, set } = useDonation(kit);
  const tz = event.timezone;
  return <div className="stack">
    <p>Isi setelah bantuan diserahkan. Halaman donasi menampilkan kabarnya, dan di halaman <em>Donasi masuk</em> muncul tombol kirim WhatsApp ke tiap donatur.</p>
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
  </div>;
}

function uniqueKey(base: string, items: DonationItem[], self: number) {
  const taken = new Set(items.filter((_, at) => at !== self).map(item => item.key));
  let key = base, n = 2;
  while (taken.has(key)) key = `${base}-${n++}`;
  return key;
}
