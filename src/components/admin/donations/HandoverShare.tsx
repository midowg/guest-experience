"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { SuggestionChips } from "@/components/admin/editor/controls";
import { groupNews, prayerSuggestions, type DonationRecord, type DonationSettings } from "@/lib/donations";
import { formatDate } from "@/lib/format";
import s from "./donations.module.css";

type Props = { event: { id: string; title: string; timezone: string; donation: DonationSettings }; link: string; donations: DonationRecord[] };

/** "2026-10-30" in the event's time zone, for a date field. */
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * Kabar penyerahan, simply: fill a few lines, see the WhatsApp message as it will look (built from
 * the donations received so far), then share it to a group or copy it. Nothing here is saved.
 */
export function HandoverShare({ event, link, donations }: Props) {
  const settings = event.donation;
  const [day, setDay] = useState(() => dayOf(settings.delivered.at ?? new Date().toISOString(), event.timezone));
  const [intro, setIntro] = useState("Alhamdulillah, bantuan dari teman-teman semua sudah kami serahkan.");
  const [prayer, setPrayer] = useState(settings.notify.prayer || prayerSuggestions[0]);
  const [parts, setParts] = useState({ perRecipient: true, totals: true, donors: true, link: true });
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => groupNews(settings, donations, event, {
    date: day ? formatDate(`${day}T12:00:00+07:00`, event.timezone) : "", intro, prayer, link: parts.link ? link : "",
    perRecipient: parts.perRecipient, totals: parts.totals, donors: parts.donors,
  }), [settings, donations, event, day, intro, prayer, link, parts]);
  const toggle = (key: keyof typeof parts) => setParts(current => ({ ...current, [key]: !current[key] }));
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  return <div className={s.share}>
    <div className={s.shareForm}>
      <label className={s.shareField}><span>Tanggal penyerahan</span><input className="input" type="date" value={day} onChange={change => setDay(change.target.value)} /></label>
      <label className={s.shareField}><span>Kalimat pembuka</span><textarea className="textarea" rows={2} maxLength={500} value={intro} onChange={change => setIntro(change.target.value)} /></label>
      <fieldset className={s.shareParts}>
        <legend>Sertakan</legend>
        <label><input type="checkbox" checked={parts.perRecipient} onChange={() => toggle("perRecipient")} /> Rincian tiap penerima</label>
        <label><input type="checkbox" checked={parts.totals} onChange={() => toggle("totals")} /> Total terkumpul</label>
        <label><input type="checkbox" checked={parts.donors} onChange={() => toggle("donors")} /> Jumlah donatur</label>
        <label><input type="checkbox" checked={parts.link} onChange={() => toggle("link")} /> Tautan halaman</label>
      </fieldset>
      <label className={s.shareField}><span>Doa penutup</span><textarea className="textarea" rows={2} maxLength={300} value={prayer} onChange={change => setPrayer(change.target.value)} /></label>
      <SuggestionChips field="Doa penutup" value={prayer} onPick={setPrayer} options={prayerSuggestions.map(item => ({ label: item.split(/[,.]/)[0], value: item }))} />
    </div>

    <div className={s.sharePreview}>
      <p className={s.sharePreviewLabel}>Pratinjau pesan WhatsApp</p>
      <div className={s.chat}>
        <div className={s.bubble} aria-label="Pratinjau pesan">{text.split("\n").map((line, index) => <Fragment key={index}>{index > 0 && <br />}<WhatsAppLine line={line} /></Fragment>)}</div>
      </div>
      <div className={s.shareActions}>
        <a className={s.wa} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><Send size={16} aria-hidden="true" /> Bagikan ke WhatsApp</a>
        <button type="button" className={s.copyMessage} onClick={() => void copy()}>{copied ? <><Check size={16} aria-hidden="true" /> Tersalin</> : <><Copy size={16} aria-hidden="true" /> Salin pesan</>}</button>
      </div>
      <p className="field-hint">Bagikan ke WhatsApp membuka WhatsApp; pilih grupnya lalu kirim. Angka mengikuti donasi yang sudah diterima dan pembagian di menu Pembagian.</p>
    </div>
  </div>;
}

/** One line of the message as WhatsApp shows it: *text* in bold. */
function WhatsAppLine({ line }: { line: string }) {
  return <>{line.split(/(\*[^*\n]+\*)/g).map((part, index) => /^\*[^*]+\*$/.test(part) ? <strong key={index}>{part.slice(1, -1)}</strong> : <Fragment key={index}>{part}</Fragment>)}</>;
}
