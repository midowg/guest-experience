"use client";

import { useMemo, useState } from "react";
import { Loader2, Printer, RotateCcw } from "lucide-react";
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
 * from this. Pending and rejected donations are not shared out. A tap shows a spinner on that
 * button while it saves; sharing out many at once and Reset show their progress.
 */
export function DonationSplit({ event, initial, ready }: Props) {
  const recipients = event.donation.recipients;
  const [donations, setDonations] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  // "donationId:recipientId" while one tap saves, so only that button spins.
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
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
    setBusy(`${donation.id}:${recipientId}`); setStatus("");
    try {
      const result = await adminRequest<DonationRecord>(adminApi(event.id, `donations/${donation.id}`), { method: "PATCH", body: JSON.stringify({ action: "assign", recipient_id: recipientId }) });
      if (result.data) setDonations(current => current.map(item => item.id === result.data!.id ? result.data! : item));
      setStatus(result.message);
      return true;
    } catch (error) { setStatus(errorMessage(error)); return false; }
    finally { setBusy(""); }
  }
  /** One after another, with "3 dari 10" on screen; stops at the first that fails. */
  async function assignAll(list: DonationRecord[], recipientId: string, verb: string, done: string) {
    for (const [index, donation] of list.entries()) {
      setProgress(`${verb} ${index + 1} dari ${list.length}…`);
      if (!(await assign(donation, recipientId))) { setProgress(""); return; }
    }
    setProgress("");
    setStatus(done);
  }
  async function assignShown() {
    const name = recipients.find(recipient => recipient.id === bulk)?.name ?? "";
    await assignAll(shown.filter(item => item.recipient_id !== bulk), bulk, "Membagikan", `Semua yang tampil dibagikan ke ${name}.`);
  }
  async function reset() {
    const assigned = received.filter(item => item.recipient_id);
    if (!assigned.length) { setStatus("Belum ada donasi yang dibagikan."); return; }
    if (!window.confirm(`Kembalikan ${assigned.length} donasi ke "Belum dibagikan"? Pembagian yang sudah diatur akan dihapus.`)) return;
    await assignAll(assigned, "", "Mengembalikan", "Pembagian direset. Semua donasi kembali ke Belum dibagikan.");
    setFilter("open");
  }
  const working = !!busy || !!progress;

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
          <button type="button" className={s.reset} disabled={working} onClick={() => void reset()}><RotateCcw size={16} aria-hidden="true" /> Reset<span className={s.wide}> pembagian</span></button>
          <ButtonLink variant="secondary" href={adminEventPath(csr, "donations-report")}><Printer size={16} aria-hidden="true" /> Laporan dan CSV</ButtonLink>
        </div>
      </div>
      <p className="field-hint">Pilih penerima untuk tiap donasi yang sudah diterima. Panti yang hanya butuh dana cukup diberi donasi dana, yang butuh barang diberi barang. Laporan cetak mengikuti pembagian ini.{waiting > 0 && ` ${waiting} donasi masih menunggu konfirmasi di Donasi masuk.`}</p>
      <div className={`${s.filters} ${s.filtersScroll}`} role="group" aria-label="Saring">
        <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Belum dibagikan <span>{open.length}</span></button>
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Semua <span>{received.length}</span></button>
        {recipients.map(recipient => <button key={recipient.id} type="button" aria-pressed={filter === recipient.id} onClick={() => setFilter(recipient.id)}>{recipient.name || "Tanpa nama"} <span>{split.byRecipient[recipient.id].count}</span></button>)}
      </div>
      {shown.length > 1 && <div className={s.bulk}>
        <span>Bagikan semua yang tampil ({shown.length}) ke</span>
        <select className="select" value={bulk} onChange={change => setBulk(change.target.value)}>{recipients.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name || "Tanpa nama"}</option>)}</select>
        <button type="button" className={s.bulkGo} disabled={working} onClick={() => void assignShown()}>Terapkan</button>
      </div>}
      <p role="status" className={s.status}>{progress ? <span className={s.saving}><Loader2 size={16} aria-hidden="true" className={s.spin} /> {progress}</span> : status}</p>
      {shown.length === 0 ? <p className={s.empty}>{filter === "open" ? (received.length ? "Semua donasi yang diterima sudah dibagikan." : "Belum ada donasi yang diterima.") : "Belum ada donasi di sini."}</p>
        : <ul className={s.splitList}>
          {shown.map(donation => <li key={donation.id} aria-busy={busy.startsWith(`${donation.id}:`) || undefined}>
            <div className={s.splitGift}>
              <p className={s.splitWhat}>{describeDonation(donation, countedAmount(donation))}</p>
              <p className={s.splitWho}>{donorLabel(donation)} · {formatDate(donation.verified_at ?? donation.created_at, event.timezone)}</p>
            </div>
            <div className={s.splitPick} role="group" aria-label={`Bagikan ${describeDonation(donation, countedAmount(donation))} ke`}>
              {recipients.map(recipient => {
                const target = donation.recipient_id === recipient.id ? "" : recipient.id;
                const saving = busy === `${donation.id}:${target}`;
                return <button key={recipient.id} type="button" aria-pressed={donation.recipient_id === recipient.id} disabled={working} data-saving={saving || undefined} onClick={() => void assign(donation, target)}>
                  {saving ? <><Loader2 size={15} aria-hidden="true" className={s.spin} /> Menyimpan…</> : recipient.name || "Tanpa nama"}
                </button>;
              })}
            </div>
          </li>)}
        </ul>}
    </section>
  </div>;
}
