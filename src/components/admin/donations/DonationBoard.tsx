"use client";

import { useMemo, useState } from "react";
import { Check, Eye, MessageCircle, Plus, Printer, RotateCcw, Send, Trash2, X, FileText } from "lucide-react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { parseContactPhone } from "@/lib/contact-phone";
import { describeDonation, donorLabel, donationTotals, formatRupiah, notifyMessage, parseRupiah, type DonationRecord, type DonationSettings } from "@/lib/donations";
import { formatDate, formatDateTime } from "@/lib/format";
import { whatsappUrl } from "@/lib/invitation-messages";
import { adminApi, adminEventPath } from "@/lib/routes";
import { HandoverShare } from "./HandoverShare";
import { ManualDonation } from "./ManualDonation";
import s from "./donations.module.css";

type Props = {
  event: { id: string; title: string; timezone: string; donation: DonationSettings };
  /** The public page's address, put in the handover message. */
  link: string;
  initial: DonationRecord[]; migrated: boolean;
};
type Filter = "all" | "pending" | "received" | "rejected";
const filters: { key: Filter; label: string }[] = [{ key: "all", label: "Semua" }, { key: "pending", label: "Menunggu" }, { key: "received", label: "Diterima" }, { key: "rejected", label: "Ditolak" }];
const everything = (settings: DonationSettings): DonationSettings => ({ ...settings, show: { fundTotal: true, fundTarget: true, goods: true, donors: true, donorAmounts: true, messages: true } });
const amountText = (donation: DonationRecord, amount: number) => donation.category === "fund" ? formatRupiah(amount) : `${amount}${donation.unit ? ` ${donation.unit}` : ""}`;

/**
 * The committee's donation desk: what came in, each donation to receive (with what actually
 * arrived) or reject, donations handed over in person, a spreadsheet, and, once the help has been
 * handed over, a WhatsApp message to every donor who left a number, one tap each.
 */
export function DonationBoard({ event, link, initial, migrated }: Props) {
  const [donations, setDonations] = useState(initial);
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const totals = useMemo(() => donationTotals(everything(event.donation), donations), [event.donation, donations]);
  const counts = useMemo(() => Object.fromEntries(filters.map(item => [item.key, item.key === "all" ? donations.length : donations.filter(donation => donation.status === item.key).length])) as Record<Filter, number>, [donations]);
  const shown = donations.filter(donation => (filter === "all" || donation.status === filter) && (!query || `${donation.donor_name} ${donation.item_label} ${donation.donor_phone}`.toLowerCase().includes(query.toLowerCase())));
  const delivered = event.donation.delivered.at;
  const toNotify = donations.filter(donation => donation.status === "received" && parseContactPhone(donation.donor_phone));
  const notified = toNotify.filter(donation => donation.notified_at).length;

  // An update comes back without the photo address; the one from the page load is kept.
  function replace(next: DonationRecord) { setDonations(current => current.map(item => item.id === next.id ? { ...next, proof_url: next.proof_url ?? item.proof_url } : item)); }
  async function act(donation: DonationRecord, body: Record<string, unknown>) {
    setBusy(donation.id); setStatus("");
    try {
      const result = await adminRequest<DonationRecord>(adminApi(event.id, `donations/${donation.id}`), { method: "PATCH", body: JSON.stringify(body) });
      if (result.data) replace(result.data);
      setStatus(result.message);
      return true;
    } catch (error) { setStatus(errorMessage(error)); return false; }
    finally { setBusy(""); }
  }
  async function receive(donation: DonationRecord) {
    const typed = amounts[donation.id];
    const amount = typed === undefined ? null : donation.category === "fund" ? parseRupiah(typed) : Number(typed.replace(",", ".")) || 0;
    await act(donation, { action: "receive", received_amount: amount !== null && amount !== donation.amount ? amount : null });
  }
  async function reject() {
    const donation = donations.find(item => item.id === rejecting?.id);
    if (!donation || !rejecting) return;
    if (await act(donation, { action: "reject", reason: rejecting.reason })) setRejecting(null);
  }
  async function remove(donation: DonationRecord) {
    if (!window.confirm(`Hapus donasi dari ${donorLabel(donation)}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setBusy(donation.id);
    try {
      const result = await adminRequest(adminApi(event.id, `donations/${donation.id}`), { method: "DELETE" });
      setDonations(current => current.filter(item => item.id !== donation.id)); setStatus(result.message);
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(""); }
  }
  async function proof(donation: DonationRecord) {
    // Opened at once so the phone's pop-up blocker allows it, then pointed at the signed address.
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await adminRequest<{ url: string }>(adminApi(event.id, `donations/${donation.id}/bukti`));
      if (tab && result.data) tab.location.href = result.data.url; else tab?.close();
    } catch (error) { tab?.close(); setStatus(errorMessage(error)); }
  }

  if (!migrated) return <Notice tone="warning">Donasi menunggu migrasi <code>202610270003_donations.sql</code>. Setelah diterapkan, donasi dari halaman CSR muncul di sini.</Notice>;

  return <div className={s.board}>
    <section className={s.summary} aria-label="Ringkasan donasi">
      {totals.fund && <div className={s.stat} data-kind="fund"><span>Dana diterima</span><strong>{formatRupiah(totals.fund.total)}</strong>{totals.fund.target && <small>dari target {formatRupiah(totals.fund.target)}</small>}</div>}
      {totals.goods.map(item => <div key={item.key} className={s.stat}><span>{item.label}</span><strong>{item.total} {item.unit}</strong>{item.target && <small>dari {item.target} {item.unit}</small>}</div>)}
      {totals.other > 0 && <div className={s.stat}><span>Bantuan lain</span><strong>{totals.other}</strong></div>}
      <div className={s.stat}><span>Donatur diterima</span><strong>{totals.donors}</strong><small>{totals.pending} menunggu konfirmasi</small></div>
    </section>

    <section className={s.notify} aria-labelledby="kabar">
      <h2 id="kabar"><Send size={20} aria-hidden="true" /> Kabar penyerahan</h2>
      <p className="field-hint">Setelah bantuan diserahkan, susun kabarnya di sini lalu bagikan ke grup WhatsApp.</p>
      <HandoverShare event={event} link={link} donations={donations} />
      <details className={s.perDonor}>
        <summary>Kirim juga ke tiap donatur (opsional)</summary>
        {!delivered ? <p className="field-hint">Isi tanggal penyerahan di Edit halaman → Kabar penyerahan, lalu tombol kirim WhatsApp ke tiap donatur yang mengisi nomornya muncul di sini.</p>
          : toNotify.length === 0 ? <p className="field-hint">Belum ada donatur diterima yang mengisi nomor WhatsApp.</p>
          : <>
            <p className={s.progressLine}><strong>{notified} / {toNotify.length}</strong> donatur sudah dikabari · diserahkan {formatDate(delivered, event.timezone)}</p>
            <ul className={s.notifyList}>
              {toNotify.map(donation => {
                const phone = parseContactPhone(donation.donor_phone)!;
                const text = notifyMessage(event.donation, donation, event, link, formatDate(delivered, event.timezone));
                return <li key={donation.id} data-sent={donation.notified_at ? "" : undefined}>
                  <div><p className={s.name}>{donorLabel(donation)}</p><p className={s.meta}>{describeDonation(donation, donation.received_amount ?? donation.amount)} · {phone.local}</p></div>
                  {donation.notified_at
                    ? <span className={s.sent}><Check size={16} aria-hidden="true" /> Terkirim</span>
                    : <a className={s.wa} href={whatsappUrl(phone.international, text)} target="_blank" rel="noopener noreferrer" onClick={() => void act(donation, { action: "notified" })}><MessageCircle size={16} aria-hidden="true" /> Kirim WA</a>}
                </li>;
              })}
            </ul>
          </>}
      </details>
    </section>

    <section className={s.list} aria-labelledby="daftar-donasi">
      <div className={s.listHead}>
        <h2 id="daftar-donasi">Donasi masuk</h2>
        <div className={s.tools}>
          <Button type="button" variant="secondary" onClick={() => setAdding(!adding)} aria-expanded={adding}><Plus size={16} aria-hidden="true" /> Tambah manual</Button>
          <ButtonLink variant="secondary" href={adminEventPath({ id: event.id, event_kind: "csr" }, "donations-report")}><Printer size={16} aria-hidden="true" /> Laporan dan CSV</ButtonLink>
        </div>
      </div>
      {adding && <ManualDonation eventId={event.id} items={event.donation.items} onAdded={donation => { setDonations(current => [donation, ...current]); setAdding(false); setFilter("received"); setStatus("Donasi dicatat sebagai diterima."); }} onCancel={() => setAdding(false)} />}
      <div className={s.filters} role="group" aria-label="Saring status">
        {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label} <span>{counts[item.key]}</span></button>)}
        <input className="input" type="search" placeholder="Cari nama atau bantuan" value={query} onChange={change => setQuery(change.target.value)} aria-label="Cari donasi" />
      </div>
      <p role="status" className={s.status}>{status}</p>
      {shown.length === 0 ? <p className={s.empty}>{filter === "pending" ? "Tidak ada donasi yang menunggu konfirmasi." : "Belum ada donasi di sini."}</p>
        : <ul className={s.rows}>
          {shown.map(donation => <li key={donation.id} className={s.row} data-status={donation.status}>
            {donation.proof_url && <a className={s.proofThumb} href={donation.proof_url} target="_blank" rel="noopener noreferrer" aria-label={`${donation.category === "fund" ? "Bukti transfer" : "Foto barang"} dari ${donorLabel(donation)}`}>
              {/\.pdf$/i.test(donation.proof_key) ? <span><FileText size={22} aria-hidden="true" /> PDF</span>
                // eslint-disable-next-line @next/next/no-img-element -- a signed address that expires; next/image would cache it
                : <img src={donation.proof_url} alt="" loading="lazy" />}
              <small>{donation.category === "fund" ? "Bukti transfer" : "Foto barang"}</small>
            </a>}
            <div className={s.who}>
              <p className={s.name}>{donorLabel(donation)}</p>
              <p className={s.gift}>{describeDonation(donation)}{donation.status === "received" && donation.received_amount !== null && <> · <strong>diterima {amountText(donation, donation.received_amount)}</strong></>}</p>
              {donation.message && <p className={s.message}>“{donation.message}”</p>}
              <p className={s.meta}>{formatDateTime(donation.created_at)}{donation.donor_phone ? ` · ${donation.donor_phone}` : ""}{donation.status === "rejected" && donation.reject_reason ? ` · Ditolak: ${donation.reject_reason}` : ""}</p>
            </div>
            <div className={s.actions}>
              {donation.proof_key && !donation.proof_url && <Button type="button" variant="quiet" className={s.minor} onClick={() => void proof(donation)}><Eye size={16} aria-hidden="true" /> {donation.category === "fund" ? "Bukti" : "Foto"}</Button>}
              {donation.status === "pending" && rejecting?.id !== donation.id && <>
                {donation.category !== "other" && <label className={s.amount}><span className="sr-only">Jumlah yang diterima</span>
                  <input className="input" inputMode="decimal" value={amounts[donation.id] ?? (donation.category === "fund" ? formatRupiah(donation.amount) : String(donation.amount))}
                    onChange={change => setAmounts(current => ({ ...current, [donation.id]: change.target.value }))} />
                </label>}
                <Button type="button" className={s.decide} disabled={busy === donation.id} onClick={() => void receive(donation)}><Check size={16} aria-hidden="true" /> Terima</Button>
                <Button type="button" variant="secondary" className={s.decide} disabled={busy === donation.id} onClick={() => setRejecting({ id: donation.id, reason: "" })}><X size={16} aria-hidden="true" /> Tolak</Button>
              </>}
              {rejecting?.id === donation.id && <div className={s.reject}>
                <label><span className="sr-only">Alasan ditolak</span><input className="input" placeholder="Alasan, mis. transfer tidak ditemukan" value={rejecting.reason} maxLength={300} onChange={change => setRejecting({ id: donation.id, reason: change.target.value })} /></label>
                <Button type="button" variant="danger" disabled={busy === donation.id || rejecting.reason.trim().length < 2} onClick={() => void reject()}>Tolak</Button>
                <Button type="button" variant="quiet" onClick={() => setRejecting(null)}>Batal</Button>
              </div>}
              {donation.status !== "pending" && <Button type="button" variant="quiet" className={s.minor} disabled={busy === donation.id} onClick={() => void act(donation, { action: "pending" })}><RotateCcw size={16} aria-hidden="true" /> {donation.status === "received" ? "Batalkan terima" : "Kembalikan"}</Button>}
              <Button type="button" variant="quiet" className={s.minor} disabled={busy === donation.id} onClick={() => void remove(donation)} aria-label={`Hapus donasi ${donorLabel(donation)}`}><Trash2 size={16} aria-hidden="true" /></Button>
            </div>
          </li>)}
        </ul>}
    </section>
  </div>;
}
