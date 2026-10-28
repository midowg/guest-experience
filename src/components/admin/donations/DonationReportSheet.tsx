"use client";

import { useState } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { formatRupiah, giftsText, listNames, splitByRecipient, type DonationRecord, type DonationReport, type DonationSettings, type RecipientGifts } from "@/lib/donations";
import { formatDate } from "@/lib/format";
import { adminApi, adminEventPath } from "@/lib/routes";
import styles from "@/components/admin/beo/beo-print.module.css";
import s from "./donation-report.module.css";

type Props = {
  event: { id: string; title: string; organizer: string; timezone: string; donation: DonationSettings; contactName: string };
  report: DonationReport;
  /** Every donation (names already as each donor chose), for what each recipient was given. */
  donations: DonationRecord[];
  initialRecipient: string;
  printedAt: string;
};

const count = (amount: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(amount);
/** "2026-10-30" in the event's time zone, for a date field. */
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * The handover report as one printable A4 sheet: who it is for, what was collected (received
 * donations only), the donors as each chose to appear, and two signature boxes. Addressed to one
 * recipient it lists what that recipient was given (Donasi → Pembagian); for all recipients it adds
 * how the help was shared out and what is left. The admin also fills the handover date and who
 * signs (printed only, nothing saved) and whether donors are listed. The CSV download is here too.
 */
export function DonationReportSheet({ event, report, donations, initialRecipient, printedAt }: Props) {
  const { donation } = event;
  const [recipientId, setRecipientId] = useState(initialRecipient);
  const [showDonors, setShowDonors] = useState(true);
  const [showAmounts, setShowAmounts] = useState(false);
  const recipient = donation.recipients.find(item => item.id === recipientId);
  const [day, setDay] = useState(donation.delivered.at ? dayOf(donation.delivered.at, event.timezone) : "");
  const [giver, setGiver] = useState({ name: event.contactName, org: event.organizer || "Panitia" });
  const [receiver, setReceiver] = useState({ name: "", org: "" });
  const organizer = event.organizer || "Panitia";
  const receiverOrg = receiver.org || recipient?.name || "Penerima bantuan";
  const handedOver = day ? formatDate(`${day}T12:00:00+07:00`, event.timezone) : "";
  const csr = { id: event.id, event_kind: "csr" };
  const split = splitByRecipient(donation, donations);
  const gifts = recipient ? split.byRecipient[recipient.id] : null;
  const rows = gifts ? giftRows(gifts) : [];

  return <div className={styles.screen}>
    <div className={`${styles.toolbar} ${s.toolbar}`}>
      <a href={adminEventPath(csr, "donations")} className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke Donasi masuk</a>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Cetak</button>
        <a href={adminApi(event.id, "donations/export")} download><Download size={16} aria-hidden="true" /> Unduh CSV</a>
      </div>
      <div className={s.options}>
        {donation.recipients.length > 0 && <label>Untuk <select className="select" value={recipientId} onChange={change => setRecipientId(change.target.value)}>
          <option value="">Semua penerima</option>
          {donation.recipients.map(item => <option key={item.id} value={item.id}>{item.name || "Tanpa nama"}</option>)}
        </select></label>}
        <label><input type="checkbox" checked={showDonors} onChange={change => setShowDonors(change.target.checked)} /> Daftar donatur</label>
        {showDonors && <label><input type="checkbox" checked={showAmounts} onChange={change => setShowAmounts(change.target.checked)} /> Nominal dana per donatur</label>}
      </div>
      <fieldset className={s.fill}>
        <legend>Isi lembar ini sebelum mencetak</legend>
        <label><span>Tanggal penyerahan</span><input className="input" type="date" value={day} onChange={change => setDay(change.target.value)} /></label>
        <label><span>Diserahkan oleh: nama</span><input className="input" value={giver.name} maxLength={80} placeholder="Nama yang menyerahkan" onChange={change => setGiver({ ...giver, name: change.target.value })} /></label>
        <label><span>Diserahkan oleh: instansi atau jabatan</span><input className="input" value={giver.org} maxLength={80} onChange={change => setGiver({ ...giver, org: change.target.value })} /></label>
        <label><span>Diterima oleh: nama</span><input className="input" value={receiver.name} maxLength={80} placeholder="Kosongkan untuk ditulis tangan" onChange={change => setReceiver({ ...receiver, name: change.target.value })} /></label>
        <label><span>Diterima oleh: instansi atau jabatan</span><input className="input" value={receiver.org} maxLength={80} placeholder={recipient?.name || "Pengurus panti"} onChange={change => setReceiver({ ...receiver, org: change.target.value })} /></label>
        <p>Isian ini hanya untuk cetakan, tidak disimpan. Nama yang dikosongkan dicetak sebagai garis untuk ditulis tangan.</p>
      </fieldset>
      {donation.recipients.length > 0 && split.unassigned.count > 0 && <p className={s.warn}>{split.unassigned.count} donasi yang diterima belum dibagikan ke penerima. Bagikan di <a href={adminEventPath(csr, "donations-split")}>Pembagian</a>.</p>}
      <p className={styles.includes}>Hanya donasi yang sudah <strong>diterima</strong> di Donasi masuk. Donatur yang memilih tidak disebutkan tertulis &ldquo;Tanpa nama&rdquo;. Nomor WhatsApp dan bukti transfer tidak dicetak.</p>
    </div>

    <article className={styles.sheet} aria-label="Laporan penyerahan donasi">
      <div className={`${styles.band} ${s.band}`}>LAPORAN PENYERAHAN DONASI</div>
      <header className={styles.head}>
        <p className={styles.kicker}>{organizer}</p>
        <h1>{event.title}</h1>
        <p className={styles.muted}>{handedOver ? `Diserahkan pada ${handedOver}` : "Tanggal penyerahan: ____________________"}</p>
      </header>

      <section>
        <h2>Kepada</h2>
        {recipient ? <p><strong>{recipient.name}</strong>{recipient.place ? `, ${recipient.place}` : ""}</p>
          : <p>{listNames(donation.recipients.map(item => item.name).filter(Boolean)) || "Penerima bantuan"}</p>}
      </section>

      {recipient ? <>
        <div className={styles.numbers}>
          <div className={`${styles.main} ${s.main}`}><span>Dana diserahkan</span><strong>{gifts?.fund ? formatRupiah(gifts.fund) : "-"}</strong></div>
          <div><span>Donasi untuk penerima ini</span><strong>{gifts?.count ?? 0}</strong><small>dari {report.count} donasi diterima</small></div>
        </div>
        <section>
          <h2>Rincian bantuan untuk {recipient.name || "penerima ini"}</h2>
          {rows.length ? <table>
            <thead><tr><th style={{ width: "10mm" }}>No</th><th>Bantuan</th><th style={{ width: "45mm" }}>Jumlah</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><td>{index + 1}</td><td>{row.label}</td><td>{row.amount}</td></tr>)}</tbody>
          </table> : <p className={styles.muted}>Belum ada donasi yang dibagikan ke penerima ini.</p>}
        </section>
      </> : <>
      <div className={styles.numbers}>
        <div className={`${styles.main} ${s.main}`}><span>Dana terkumpul</span><strong>{formatRupiah(report.fund)}</strong></div>
        <div><span>Jenis barang</span><strong>{report.goods.length + (report.other.length ? 1 : 0)}</strong><small>termasuk bantuan lain</small></div>
        <div><span>Donasi diterima</span><strong>{report.count}</strong></div>
      </div>

      <section>
        <h2>Rincian bantuan terkumpul</h2>
        {report.fund === 0 && !report.goods.length && !report.other.length ? <p className={styles.muted}>Belum ada donasi yang diterima.</p>
          : <table>
            <thead><tr><th style={{ width: "10mm" }}>No</th><th>Bantuan</th><th style={{ width: "45mm" }}>Jumlah</th></tr></thead>
            <tbody>
              {report.fund > 0 && <tr><td>1</td><td>Dana</td><td>{formatRupiah(report.fund)}</td></tr>}
              {report.goods.map((item, index) => <tr key={`${item.label}|${item.unit}`}><td>{index + 1 + (report.fund > 0 ? 1 : 0)}</td><td>{item.label}</td><td>{count(item.total)} {item.unit}</td></tr>)}
              {report.other.length > 0 && <tr><td>{report.goods.length + 1 + (report.fund > 0 ? 1 : 0)}</td><td>Bantuan lain: {report.other.join("; ")}</td><td>{report.other.length} bantuan</td></tr>}
            </tbody>
          </table>}
      </section>

      {split.anyAssigned && <section>
        <h2>Pembagian per penerima</h2>
        <table>
          <thead><tr><th>Penerima</th><th style={{ width: "38mm" }}>Dana</th><th>Barang</th></tr></thead>
          <tbody>
            {donation.recipients.map(item => { const given = split.byRecipient[item.id]; return <tr key={item.id}><td>{item.name || "Tanpa nama"}</td><td>{given.fund ? formatRupiah(given.fund) : "-"}</td><td>{giftsText(given) || "-"}</td></tr>; })}
            {split.unassigned.count > 0 && <tr className={s.left}><td>Belum dibagikan</td><td>{split.unassigned.fund ? formatRupiah(split.unassigned.fund) : "-"}</td><td>{giftsText(split.unassigned) || "-"}</td></tr>}
          </tbody>
        </table>
      </section>}
      </>}

      {showDonors && report.donors.length > 0 && <section className={s.donors}>
        <h2>Donatur</h2>
        <table>
          <thead><tr><th style={{ width: "10mm" }}>No</th><th>Nama</th><th>Bantuan</th>{showAmounts && <th style={{ width: "38mm" }}>Nominal</th>}</tr></thead>
          <tbody>{report.donors.map((donor, index) => <tr key={donor.id}><td>{index + 1}</td><td>{donor.name}</td><td>{donor.gift}</td>{showAmounts && <td>{donor.amount}</td>}</tr>)}</tbody>
        </table>
      </section>}

      {donation.delivered.note && <section><h2>Catatan</h2><p className={styles.notes}>{donation.delivered.note}</p></section>}

      <section className={s.signs}>
        <Signature role="Diserahkan oleh," org={giver.org || organizer} name={giver.name} />
        <Signature role="Diterima oleh," org={receiverOrg} name={receiver.name} />
      </section>

      <footer className={styles.foot}><span>{organizer} · Friday Sharing</span><span>Dicetak {formatDate(printedAt, event.timezone)}</span></footer>
    </article>
  </div>;
}

/** One signature box: who signs for whom, room to sign, and the name on the line (or a blank line to write it in). */
function Signature({ role, org, name }: { role: string; org: string; name: string }) {
  return <div>
    <p>{role}</p>
    <p className={s.org}>{org}</p>
    <span className={s.space} />
    <p className={s.signName}>{name || " "}</p>
  </div>;
}

/** What one recipient was given as table rows: the money, each kind of goods, then gifts written freely. */
function giftRows(gifts: RecipientGifts): { label: string; amount: string }[] {
  return [
    ...(gifts.fund > 0 ? [{ label: "Dana", amount: formatRupiah(gifts.fund) }] : []),
    ...gifts.goods.map(item => ({ label: item.label, amount: `${count(item.total)} ${item.unit}`.trim() })),
    ...gifts.other.map(text => ({ label: text, amount: "-" })),
  ];
}
