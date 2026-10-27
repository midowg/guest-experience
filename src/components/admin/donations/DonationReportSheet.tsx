"use client";

import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { formatRupiah, listNames, type DonationReport, type DonationSettings } from "@/lib/donations";
import { formatDate } from "@/lib/format";
import { adminEventPath } from "@/lib/routes";
import styles from "@/components/admin/beo/beo-print.module.css";
import s from "./donation-report.module.css";

type Props = {
  event: { id: string; title: string; organizer: string; timezone: string; donation: DonationSettings; contactName: string };
  report: DonationReport;
  initialRecipient: string;
  printedAt: string;
};

const count = (amount: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(amount);
/** "2026-10-30" in the event's time zone, for a date field. */
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * The handover report as one printable A4 sheet: who it is for, what was collected (received
 * donations only), the donors as each chose to appear, and two signature boxes. The admin picks
 * the recipient, fills the handover date and who signs on each side (printed under the signature
 * lines; nothing is saved), and whether the donor list and each donor's amount are printed.
 */
export function DonationReportSheet({ event, report, initialRecipient, printedAt }: Props) {
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

  return <div className={styles.screen}>
    <div className={styles.toolbar}>
      <a href={adminEventPath(event.id, "donations")} className={styles.back}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke Donasi masuk</a>
      <div className={styles.actions}>
        <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Cetak</button>
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

      <div className={styles.numbers}>
        <div className={`${styles.main} ${s.main}`}><span>Dana terkumpul</span><strong>{formatRupiah(report.fund)}</strong></div>
        <div><span>Jenis barang</span><strong>{report.goods.length + (report.other.length ? 1 : 0)}</strong><small>termasuk bantuan lain</small></div>
        <div><span>Donasi diterima</span><strong>{report.count}</strong></div>
      </div>

      <section>
        <h2>Rincian bantuan</h2>
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

/** One signature box: who signs for whom, room to sign, and the name under the line (or a blank to write in). */
function Signature({ role, org, name }: { role: string; org: string; name: string }) {
  return <div>
    <p>{role}</p>
    <p className={s.org}>{org}</p>
    <span className={s.space} />
    <p className={s.signName}>{name || " "}</p>
    <p className={styles.muted}>{name ? "Tanda tangan" : "Nama dan tanda tangan"}</p>
  </div>;
}
