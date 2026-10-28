"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { countedAmount, describeDonation, donorLabel, formatRupiah, giftsText, splitByRecipient, type DonationRecord, type DonationSettings } from "@/lib/donations";
import { formatDate } from "@/lib/format";
import { adminApi, adminEventPath } from "@/lib/routes";
import s from "./donations.module.css";

type Props = { event: { id: string; timezone: string; donation: DonationSettings }; initial: DonationRecord[]; ready: boolean };
type Filter = "open" | "all" | string;

/**
 * Donasi → Pembagian: every received donation with one tap per recipient (Panti A, B, C) to say
 * where it goes, and a running summary of what each recipient gets. The handover report prints
 * from this. Pending and rejected donations are not shared out.
 */
export function DonationSplit({ event, initial, ready }: Props) {
  const recipients = event.donation.recipients;
  const [donations, setDonations] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [bulk, setBulk] = useState(recipients[0]?.id ?? "");
  const csr = { id: event.id, event_kind: "csr" };
  const received = useMemo(() => donations.filter(item => item.status === "received"), [donations]);
  const split = useMemo(() => splitByRecipient(event.donation, donations), [event.donation, donations]);
  const known = new Set(recipients.map(recipient => recipient.id));
  const open = received.filter(item => !known.has(item.recipient_id));
  const shown = filter === "open" ? open : filter === "all" ? received : received.filter(item => item.recipient_id === filter);
  const waiting = donations.filter(item => item.status === "pending").length;

  async function assign(donation: DonationRecord, recipientId: string) {
    setBusy(donation.id); setStatus("");
    try {
      const result = await adminRequest<DonationRecord>(adminApi(event.id, `donations/${donation.id}`), { method: "PATCH", body: JSON.stringify({ action: "assign", recipient_id: recipientId }) });
      if (result.data) setDonations(current => current.map(item => item.id === result.data!.id ? result.data! : item));
      setStatus(result.message);
      return true;
    } catch (error) { setStatus(errorMessage(error)); return false; }
    finally { setBusy(""); }
  }
  async function assignShown() {
    const name = recipients.find(recipient => recipient.id === bulk)?.name ?? "";
    for (const donation of shown.filter(item => item.recipient_id !== bulk)) if (!(await assign(donation, bulk))) return;
    setStatus(`Semua yang tampil dibagikan ke ${name}.`);
  }

  if (!ready) return <Notice tone="warning">Pembagian menunggu migrasi <code>202610280001_donation_recipient.sql</code>. Setelah pemilik menerapkannya, donasi yang sudah diterima bisa dibagikan ke tiap penerima di sini.</Notice>;
  if (!recipients.length) return <Notice>Belum ada penerima. Tambahkan dulu di <a href={adminEventPath(csr)}>Edit halaman</a> → Penerima bantuan.</Notice>;

  return <div className={s.board}>
    <div className={s.summary}>
      {recipients.map(recipient => {
        const gifts = split.byRecipient[recipient.id];
        return <div key={recipient.id} className={s.stat}>
          <span>{recipient.name || "Tanpa nama"}</span>
          <strong>{gifts.fund ? formatRupiah(gifts.fund) : "-"}</strong>
          <small>{giftsText(gifts) || "Belum ada barang"} · {gifts.count} donasi</small>
        </div>;
      })}
      <div className={s.stat} data-kind="open"><span>Belum dibagikan</span><strong>{split.unassigned.fund ? formatRupiah(split.unassigned.fund) : "-"}</strong><small>{giftsText(split.unassigned) || "Tidak ada barang"} · {split.unassigned.count} donasi</small></div>
    </div>

    <section className={s.list} aria-labelledby="pembagian">
      <div className={s.listHead}>
        <h2 id="pembagian">Bagikan donasi</h2>
        <div className={s.tools}>
          <ButtonLink variant="secondary" href={adminEventPath(csr, "donations-report")}><Printer size={16} aria-hidden="true" /> Laporan dan CSV</ButtonLink>
        </div>
      </div>
      <p className="field-hint">Pilih penerima untuk tiap donasi yang sudah diterima. Panti yang hanya butuh dana cukup diberi donasi dana, yang butuh barang diberi barang. Laporan cetak mengikuti pembagian ini.{waiting > 0 && ` ${waiting} donasi masih menunggu konfirmasi di Donasi masuk.`}</p>
      <div className={s.filters} role="group" aria-label="Saring">
        <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Belum dibagikan <span>{open.length}</span></button>
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Semua <span>{received.length}</span></button>
        {recipients.map(recipient => <button key={recipient.id} type="button" aria-pressed={filter === recipient.id} onClick={() => setFilter(recipient.id)}>{recipient.name || "Tanpa nama"} <span>{split.byRecipient[recipient.id].count}</span></button>)}
      </div>
      {shown.length > 1 && <div className={s.bulk}>
        <span>Bagikan semua yang tampil ({shown.length}) ke</span>
        <select className="select" value={bulk} onChange={change => setBulk(change.target.value)}>{recipients.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name || "Tanpa nama"}</option>)}</select>
        <button type="button" className={s.bulkGo} disabled={!!busy} onClick={() => void assignShown()}>Terapkan</button>
      </div>}
      <p role="status" className={s.status}>{status}</p>
      {shown.length === 0 ? <p className={s.empty}>{filter === "open" ? (received.length ? "Semua donasi yang diterima sudah dibagikan." : "Belum ada donasi yang diterima.") : "Belum ada donasi di sini."}</p>
        : <ul className={s.splitList}>
          {shown.map(donation => <li key={donation.id} aria-busy={busy === donation.id || undefined}>
            <div className={s.splitGift}>
              <p className={s.splitWhat}>{describeDonation(donation, countedAmount(donation))}</p>
              <p className={s.splitWho}>{donorLabel(donation)} · {formatDate(donation.verified_at ?? donation.created_at, event.timezone)}</p>
            </div>
            <div className={s.splitPick} role="group" aria-label={`Bagikan ${describeDonation(donation, countedAmount(donation))} ke`}>
              {recipients.map(recipient => <button key={recipient.id} type="button" aria-pressed={donation.recipient_id === recipient.id} disabled={!!busy} onClick={() => void assign(donation, donation.recipient_id === recipient.id ? "" : recipient.id)}>{recipient.name || "Tanpa nama"}</button>)}
            </div>
          </li>)}
        </ul>}
    </section>
  </div>;
}
