"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, CircleCheck, Gift, HandHeart, HeartHandshake, Home, MapPin, MessageCircle, Package, PartyPopper, Share2, Sparkles } from "lucide-react";
import { donorInitials, formatRupiah, listNames, type DonationTotals, type PublicDonor } from "@/lib/donations";
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
 * who gave, and one button to donate, on one short and cheerful page; the recipients and the full donor list
 * open as pages of their own. Only what the committee has received is counted, and each
 * donor appears as they chose (their name, Hamba Allah, or not at all).
 */
export function CsrExperience({ event, view, preview = false }: { event: EventRecord; view: DonationView; preview?: boolean }) {
  useGuestPage(event, preview);
  const settings = event.donation;
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState<"" | "penerima" | "donatur">("");
  const closePage = useCallback(() => setPage(""), []);
  const [shared, setShared] = useState("");
  // What this browser gave before, read after hydration (the server has no such memory).
  const memory = useSyncExternalStore(subscribeMemory, () => readMemory(event.id), () => "");
  const mine = useMemo(() => parseRemembered(memory), [memory]);
  const [openedAt] = useState(() => Date.now());
  const closed = !settings.enabled || (!!settings.closesAt && openedAt >= Date.parse(settings.closesAt));
  const canGive = view.ready && !closed && settings.items.length > 0;
  const { totals } = view;
  const contactHref = event.sections.some(section => section.key === "contact" && section.enabled) ? contactLink(event.contact) : null;
  const hero = event.hero.url;

  async function share() {
    const url = location.href.split("#")[0];
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else { await navigator.clipboard.writeText(url); setShared("Tautan disalin."); }
    } catch { /* closed by the person */ }
  }

  const recipients = settings.recipients;
  const goodsTiles = totals.goods.length + (totals.other > 0 ? 1 : 0);
  const nothingYet = !totals.fund && !totals.goods.length && !totals.other;
  // A few faces of the people who gave, as on a charity page; hidden donors are never among them.
  const faces = view.donors.slice(0, 4);

  return <div className={s.csr} data-theme={event.theme?.key ?? "berbagi"} style={themeStyle(event.theme)}>
    <main className={s.main}>
      <header className={s.intro}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the small Werkudara mark, a static file */}
        <img className={s.logo} src="/werkudara_icon.png" alt="Werkudara" width={52} height={52} />
        <p className={s.eyebrow}><HandHeart size={16} aria-hidden="true" /> {event.organizer || "Kegiatan sosial"}</p>
        <h1 className={s.title}>{event.title}</h1>
        <span className={s.squiggle} aria-hidden="true" />
        {event.subtitle && <p className={s.subtitle}>{event.subtitle}</p>}
      </header>
      {hero && <div className={s.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the event's own cover photo, already sized */}
        <img src={hero} alt={event.hero.alt} />
        <span className={s.sticker} aria-hidden="true"><Sparkles size={16} /> Yuk, berbagi!</span>
      </div>}

      <div className={s.body}>
        {/* What has been collected: one warm card under the photo, money first, then who gave and the goods. */}
        <section className={s.collected} data-lifted={hero ? "" : undefined} aria-labelledby="terkumpul">
          <h2 id="terkumpul" className={s.collectedLabel}><PartyPopper size={16} aria-hidden="true" /> Terkumpul</h2>
          {totals.fund && <>
            <strong className={s.fundValue}>{formatRupiah(totals.fund.total)}</strong>
            {totals.fund.target && <Progress total={totals.fund.total} target={totals.fund.target} label={`dari target ${formatRupiah(totals.fund.target)}`} />}
          </>}
          <div className={s.people}>
            {faces.length > 0 && <span className={s.faces} aria-hidden="true">
              {faces.map(donor => <span key={donor.id} className={s.face}>{donorInitials(donor.name)}</span>)}
              {totals.donors > faces.length && <span className={s.face} data-more="">+{totals.donors - faces.length}</span>}
            </span>}
            <span><strong>{totals.donors} orang baik</strong> {totals.donors ? "sudah ikut berbagi" : "menunggu Anda"}</span>
          </div>
          {goodsTiles > 0 && <ul className={s.goods} aria-label="Barang terkumpul">
            {totals.goods.map(item => <li key={item.key}><Package size={15} aria-hidden="true" /><span><strong>{count(item.total)}</strong>{item.target ? `/${count(item.target)}` : ""} {item.unit} {item.label}</span></li>)}
            {totals.other > 0 && <li><Gift size={15} aria-hidden="true" /><span><strong>{totals.other}</strong> bantuan lain</span></li>}
          </ul>}
          {nothingYet && <p className={s.empty}>Belum ada bantuan yang dikonfirmasi. Jadilah yang pertama.</p>}
          <p className={s.note}>Diperbarui setelah dikonfirmasi panitia{totals.pending > 0 ? ` · ${totals.pending} donasi menunggu konfirmasi` : ""}.</p>
        </section>

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

        {/* Where the help goes has a page of its own; here only a button naming who receives it. */}
        {recipients.length > 0 && <button type="button" className={s.recipientsButton} onClick={() => setPage("penerima")}>
          <span className={s.recipientsIcon} aria-hidden="true"><Home size={22} /></span>
          <span className={s.recipientsText}>
            <span className={s.recipientsTitle}>Disalurkan ke {recipients.length > 1 ? `${recipients.length} penerima` : recipients[0].name}</span>
            <span className={s.recipientsNames}>{recipients.length > 1 ? listNames(recipients.map(recipient => recipient.name)) : recipients[0].place || "Lihat penerima bantuan"}</span>
          </span>
          <ChevronRight size={22} aria-hidden="true" className={s.chevron} />
        </button>}

        {settings.show.donors && <section className={s.section} aria-labelledby="donatur">
          <div className={s.sectionHead}>
            <h2 id="donatur">Daftar donatur</h2>
            {view.donors.length > SHOWN && <button type="button" className={s.more} onClick={() => setPage("donatur")}>Lihat semua ({view.donors.length})</button>}
          </div>
          {view.donors.length === 0 ? <p className={s.empty}>Nama donatur muncul di sini setelah dikonfirmasi panitia.</p>
            : <DonorList donors={view.donors.slice(0, SHOWN)} />}
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
        ? <button type="button" className={s.give} onClick={() => setFormOpen(true)}><HandHeart size={22} aria-hidden="true" /> Ikut berbagi</button>
        : <p className={s.closed}>{!view.ready ? "Donasi belum dapat diterima." : "Donasi untuk kegiatan ini sudah ditutup. Terima kasih atas kebaikan Anda."}</p>}
    </div>

    {page === "penerima" && <Sheet title="Disalurkan ke" onClose={closePage}>
      <p className={s.sheetLead}>Bantuan yang terkumpul diserahkan langsung oleh {event.organizer || "panitia"} kepada {recipients.length > 1 ? `${recipients.length} penerima` : "penerima"} berikut.</p>
      <ul className={s.recipients}>
        {recipients.map(recipient => <li key={recipient.id} className={s.recipient}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a photo the committee uploaded */}
          {recipient.photo.url ? <img src={recipient.photo.url} alt={recipient.photo.alt || recipient.name} /> : <span className={s.recipientIcon} aria-hidden="true"><Home size={24} /></span>}
          <div className={s.recipientText}>
            <p className={s.recipientName}>{recipient.name}</p>
            {recipient.place && <p className={s.recipientPlace}><MapPin size={14} aria-hidden="true" /> {recipient.place}</p>}
            {recipient.description && <p className={s.recipientDescription}>{recipient.description}</p>}
          </div>
        </li>)}
      </ul>
    </Sheet>}
    {page === "donatur" && <Sheet title="Semua donatur" onClose={closePage}><DonorList donors={view.donors} /></Sheet>}

    {formOpen && <DonationForm event={event} preview={preview} onClose={() => setFormOpen(false)} />}
  </div>;
}

/** How many donors the page itself lists; the rest are on a page of their own. */
const SHOWN = 3;

function DonorList({ donors }: { donors: PublicDonor[] }) {
  return <ul className={s.donors}>
    {donors.map(donor => <li key={donor.id} className={s.donor}>
      <span className={s.avatar} aria-hidden="true">{donorInitials(donor.name)}</span>
      <div className={s.donorText}>
        <p className={s.donorName}>{donor.name}</p>
        <p className={s.donorGift}>{donor.gift} · {relative(donor.at)}</p>
        {donor.message && <p className={s.donorMessage}>“{donor.message}”</p>}
      </div>
    </li>)}
  </ul>;
}

/** A page of its own over the donation page (recipients, all donors): Escape or the back button returns. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return <div className={s.sheet} role="dialog" aria-modal="true" aria-label={title}>
    <div className={s.sheetHead}>
      <button type="button" className={s.close} onClick={onClose} aria-label="Kembali"><ArrowLeft size={22} aria-hidden="true" /></button>
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      <span aria-hidden="true" className={s.sheetSpacer} />
    </div>
    <div className={s.sheetBody}>{children}</div>
  </div>;
}

function Progress({ total, target, label, small = false }: { total: number; target: number; label: string; small?: boolean }) {
  const value = percent(total, target) ?? 0;
  return <span className={s.progress} data-small={small ? "" : undefined}>
    <span className={s.bar0} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`${value}% ${label}`}><span style={{ width: `${value ? Math.max(value, 3) : 0}%` }} /></span>
    <span className={s.progressText}>{small ? `${value}%` : <><b>{value}%</b> {label}</>}</span>
  </span>;
}
