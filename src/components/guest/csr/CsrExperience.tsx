"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CircleCheck, Gift, HandHeart, HeartHandshake, MessageCircle, Package, Share2, Users, Wallet } from "lucide-react";
import { donorInitials, formatRupiah, type DonationTotals, type PublicDonor } from "@/lib/donations";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { contactLink } from "../JourneyPanels";
import { useGuestPage } from "../use-guest-page";
import { DonationForm, DONATION_MEMORY_EVENT, donationMemoryKey, parseRemembered } from "./DonationForm";
import s from "./csr.module.css";

export type DonationView = { totals: DonationTotals; donors: PublicDonor[]; ready: boolean };
const subscribeMemory = (change: () => void) => { window.addEventListener(DONATION_MEMORY_EVENT, change); window.addEventListener("storage", change); return () => { window.removeEventListener(DONATION_MEMORY_EVENT, change); window.removeEventListener("storage", change); }; };
const readMemory = (eventId: string) => { try { return localStorage.getItem(donationMemoryKey(eventId)) ?? ""; } catch { return ""; } };
const count = (amount: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(amount);
const percent = (total: number, target: number | null) => target ? Math.min(100, Math.round(total / target * 100)) : null;
const relative = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "hari ini" : days === 1 ? "kemarin" : days < 30 ? `${days} hari lalu` : formatDate(iso, "Asia/Jakarta");
};

/**
 * The CSR page (event kind "csr"): not an invitation but a place to give. What has been collected,
 * who gave, and one button to donate. Only what the committee has received is counted, and each
 * donor appears as they chose (their name, Hamba Allah, or not at all).
 */
export function CsrExperience({ event, view, preview = false }: { event: EventRecord; view: DonationView; preview?: boolean }) {
  useGuestPage(event, preview);
  const settings = event.donation;
  const [formOpen, setFormOpen] = useState(false);
  const [allDonors, setAllDonors] = useState(false);
  const [shared, setShared] = useState("");
  // What this browser gave before, read after hydration (the server has no such memory).
  const memory = useSyncExternalStore(subscribeMemory, () => readMemory(event.id), () => "");
  const mine = useMemo(() => parseRemembered(memory), [memory]);
  const [openedAt] = useState(() => Date.now());
  const closed = !settings.enabled || (!!settings.closesAt && openedAt >= Date.parse(settings.closesAt));
  const canGive = view.ready && !closed && settings.items.length > 0;
  const { totals } = view;
  const donors = allDonors ? view.donors : view.donors.slice(0, 8);
  const contactHref = event.sections.some(section => section.key === "contact" && section.enabled) ? contactLink(event.contact) : null;
  const hero = event.hero.url;

  async function share() {
    const url = location.href.split("#")[0];
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else { await navigator.clipboard.writeText(url); setShared("Tautan disalin."); }
    } catch { /* closed by the person */ }
  }

  return <div className={s.csr} data-theme={event.theme?.key ?? "segar"} style={themeStyle(event.theme)}>
    <main className={s.main}>
      <header className={s.cover} data-plain={hero ? undefined : ""}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the event's own cover photo, already sized */}
        {hero && <img src={hero} alt={event.hero.alt} />}
        <div className={s.coverText}>
          <p className={s.eyebrow}><HandHeart size={16} aria-hidden="true" /> {event.organizer || "Kegiatan sosial"}</p>
          <h1 className={s.title}>{event.title}</h1>
          {event.subtitle && <p className={s.subtitle}>{event.subtitle}</p>}
        </div>
      </header>

      <div className={s.body}>
        {event.introduction && <p className={s.lead}>{event.introduction}</p>}

        {settings.delivered.at && <section className={s.delivered} aria-label="Bantuan sudah diserahkan">
          {/* eslint-disable-next-line @next/next/no-img-element -- the handover photo the committee uploaded */}
          {settings.delivered.photo.url && <img src={settings.delivered.photo.url} alt={settings.delivered.photo.alt || "Foto penyerahan bantuan"} />}
          <div>
            <p className={s.deliveredTitle}><CircleCheck size={20} aria-hidden="true" /> Bantuan sudah diserahkan pada {formatDate(settings.delivered.at, event.timezone)}</p>
            {settings.delivered.note && <p>{settings.delivered.note}</p>}
          </div>
        </section>}

        {mine.length > 0 && <section className={s.mine} aria-label="Donasi Anda">
          <HeartHandshake size={22} aria-hidden="true" />
          <div>
            <p className={s.mineTitle}>Terima kasih, {mine[0].name}</p>
            <p>Donasi Anda: {mine.map(item => item.gift).join(", ")}. Tercatat dan {settings.delivered.at ? "sudah ikut diserahkan" : "menunggu konfirmasi panitia"}.</p>
          </div>
        </section>}

        <section className={s.section} aria-labelledby="terkumpul">
          <div className={s.sectionHead}>
            <h2 id="terkumpul">Terkumpul</h2>
            <span className={s.donorCount}><Users size={16} aria-hidden="true" /> {totals.donors} orang baik</span>
          </div>
          <ul className={s.totals}>
            {totals.fund && <li className={s.total} data-kind="fund">
              <span className={s.totalIcon}><Wallet size={20} aria-hidden="true" /></span>
              <span className={s.totalLabel}>Dana</span>
              <strong className={s.totalValue}>{formatRupiah(totals.fund.total)}</strong>
              {totals.fund.target && <Progress total={totals.fund.total} target={totals.fund.target} label={`dari ${formatRupiah(totals.fund.target)}`} />}
            </li>}
            {totals.goods.map(item => <li key={item.key} className={s.total}>
              <span className={s.totalIcon}><Package size={20} aria-hidden="true" /></span>
              <span className={s.totalLabel}>{item.label}</span>
              <strong className={s.totalValue}>{count(item.total)} <small>{item.unit}</small></strong>
              {item.target && <Progress total={item.total} target={item.target} label={`dari ${count(item.target)} ${item.unit}`} />}
            </li>)}
            {totals.other > 0 && <li className={s.total}>
              <span className={s.totalIcon}><Gift size={20} aria-hidden="true" /></span>
              <span className={s.totalLabel}>Bantuan lain</span>
              <strong className={s.totalValue}>{totals.other} <small>bantuan</small></strong>
            </li>}
          </ul>
          {!totals.fund && !totals.goods.length && !totals.other && <p className={s.empty}>Belum ada bantuan yang dikonfirmasi. Jadilah yang pertama.</p>}
          <p className={s.note}>Diperbarui setelah dikonfirmasi panitia{totals.pending > 0 ? ` · ${totals.pending} donasi menunggu konfirmasi` : ""}.</p>
        </section>

        {settings.show.donors && <section className={s.section} aria-labelledby="donatur">
          <div className={s.sectionHead}><h2 id="donatur">Daftar donatur</h2></div>
          {view.donors.length === 0 ? <p className={s.empty}>Nama donatur muncul di sini setelah dikonfirmasi panitia.</p>
            : <ul className={s.donors}>
              {donors.map(donor => <li key={donor.id} className={s.donor}>
                <span className={s.avatar} aria-hidden="true">{donorInitials(donor.name)}</span>
                <div className={s.donorText}>
                  <p className={s.donorName}>{donor.name}</p>
                  <p className={s.donorGift}>{donor.gift} · {relative(donor.at)}</p>
                  {donor.message && <p className={s.donorMessage}>“{donor.message}”</p>}
                </div>
              </li>)}
            </ul>}
          {view.donors.length > 8 && <button type="button" className={s.more} onClick={() => setAllDonors(!allDonors)}>{allDonors ? "Tampilkan lebih sedikit" : `Lihat semua (${view.donors.length})`}</button>}
        </section>}

        <section className={s.footerLinks} aria-label="Bantuan lain">
          <button type="button" className={s.linkButton} onClick={() => void share()}><Share2 size={18} aria-hidden="true" /> Bagikan halaman ini</button>
          {contactHref && <a className={s.linkButton} href={contactHref.href} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> Tanya {event.contact.name}</a>}
          <p role="status" className={s.note}>{shared}</p>
        </section>
      </div>
    </main>

    <div className={s.bar}>
      {canGive
        ? <button type="button" className={s.give} onClick={() => setFormOpen(true)}><HandHeart size={22} aria-hidden="true" /> Donasi sekarang</button>
        : <p className={s.closed}>{!view.ready ? "Donasi belum dapat diterima." : "Donasi untuk kegiatan ini sudah ditutup. Terima kasih atas kebaikan Anda."}</p>}
    </div>

    {formOpen && <DonationForm event={event} preview={preview} onClose={() => setFormOpen(false)} />}
  </div>;
}

function Progress({ total, target, label }: { total: number; target: number; label: string }) {
  const value = percent(total, target) ?? 0;
  return <span className={s.progress}>
    <span className={s.bar0} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`${value}% ${label}`}><span style={{ width: `${value}%` }} /></span>
    <span className={s.progressText}>{value}% {label}</span>
  </span>;
}
