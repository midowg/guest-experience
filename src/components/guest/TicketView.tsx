"use client";

import { ArrowLeft, Download, FileText, MessageCircle, Ticket } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { whatsappUrl } from "@/lib/invitation-messages";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { LanguageSwitch, useEventLanguage, useWording, WordingProvider } from "./language";
import styles from "./guest.module.css";
import { eventPath } from "@/lib/routes";

export type TicketData = { name: string; partySize: number; qrSvg: string; qrPng: string; pageUrl: string; backUrl: string } | null;
type Props = { event: EventRecord; ticket: TicketData; reason: "ready" | "not-attending" | "unavailable" };

/** Draws the ticket as one image: event, guest, and the QR, for the phone's photo gallery. */
async function ticketImage(event: EventRecord, ticket: NonNullable<TicketData>, lines: { title: string; when: string; party: string; show: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1500;
  const ctx = canvas.getContext("2d")!;
  await document.fonts.ready;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1080, 1500);
  ctx.fillStyle = getComputedStyle(document.querySelector("[data-ticket]")!).getPropertyValue("--color-primary").trim() || "#1551a0";
  ctx.fillRect(0, 0, 1080, 120);
  ctx.fillStyle = "#ffffff"; ctx.font = "800 40px Nunito, sans-serif"; ctx.fillText(lines.title.toUpperCase(), 72, 78);
  ctx.fillStyle = "#1d1d24"; ctx.font = "800 60px Nunito, sans-serif";
  const words = event.title.split(" "); let line = ""; let y = 230;
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > 936 && line) { ctx.fillText(line, 72, y); line = word; y += 72; } else line = line ? `${line} ${word}` : word;
  }
  ctx.fillText(line, 72, y);
  ctx.font = "600 36px Nunito, sans-serif"; ctx.fillStyle = "#4a5060"; ctx.fillText(lines.when, 72, y + 70);
  ctx.fillStyle = "#1d1d24"; ctx.font = "800 52px Nunito, sans-serif"; ctx.fillText(ticket.name, 72, y + 170);
  if (ticket.partySize > 1) { ctx.font = "600 36px Nunito, sans-serif"; ctx.fillText(lines.party, 72, y + 225); }
  const qr = new Image();
  await new Promise(resolve => { qr.onload = resolve; qr.src = ticket.qrPng; });
  ctx.drawImage(qr, 240, 1500 - 720, 600, 600);
  ctx.font = "600 32px Nunito, sans-serif"; ctx.fillStyle = "#4a5060"; ctx.textAlign = "center"; ctx.fillText(lines.show, 540, 1500 - 70);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `tiket-${event.slug}.png`;
  link.click();
}

/** The guest's entry ticket: who, when, and the QR to show at the door, with ways to keep it offline. */
export function TicketView(props: Props) {
  const [lang, setLang] = useEventLanguage(props.event.language);
  return <WordingProvider lang={lang}><TicketBody {...props} lang={lang} setLang={setLang} /></WordingProvider>;
}

function TicketBody({ event, ticket, reason, lang, setLang }: Props & { lang: "id" | "en"; setLang: (lang: "id" | "en") => void }) {
  const { t, dateTime } = useWording();
  const title = lang === "en" && event.translations?.en?.title ? event.translations.en.title : event.title;
  const when = event.starts_at ? dateTime(event.starts_at, event.timezone) : "";
  return <div lang={lang} className={styles.experience} data-theme={event.theme?.key ?? "werkudara"} style={themeStyle(event.theme)} data-ticket>
    <main className={`container ${styles.ticketPage}`}>
      <div className={styles.photoTop} data-no-print>
        <a href={ticket?.backUrl ?? eventPath(event)} className={styles.photoBack}><ArrowLeft size={16} aria-hidden="true" /> {t("photos.back")}</a>
        {event.language === "id_en" && <LanguageSwitch lang={lang} onChange={setLang} />}
      </div>
      {!ticket ? <div className={styles.ticketCard}>
        <p className={styles.ticketBand}><Ticket size={18} aria-hidden="true" /> {t("ticket.title")}</p>
        <div className={styles.ticketBody}><h1>{title}</h1><p>{t(reason === "not-attending" ? "ticket.notYet" : "ticket.unavailable")}</p></div>
      </div> : <>
        <article className={styles.ticketCard}>
          <p className={styles.ticketBand}><Ticket size={18} aria-hidden="true" /> {t("ticket.title")}</p>
          <div className={styles.ticketBody}>
            <h1>{title}</h1>
            {when && <p className={styles.ticketWhen}>{when}</p>}
            {event.venue_name && <p className={styles.ticketWhen}>{event.venue_name}</p>}
            <p className={styles.ticketName}>{ticket.name}</p>
            {ticket.partySize > 1 && <p>{t("ticket.party", { n: ticket.partySize })}</p>}
            <div className={styles.ticketQr} role="img" aria-label={t("ticket.show")} dangerouslySetInnerHTML={{ __html: ticket.qrSvg }} />
            <p className={styles.ticketShow}>{t("ticket.show")}</p>
          </div>
        </article>
        <section className={styles.ticketSave} data-no-print aria-labelledby="ticket-save">
          <h2 id="ticket-save">{t("ticket.save")}</h2>
          <div className={styles.ticketActions}>
            <Button type="button" onClick={() => void ticketImage(event, ticket, { title: t("ticket.title"), when, party: t("ticket.party", { n: ticket.partySize }), show: t("ticket.show") })}><Download size={16} aria-hidden="true" /> {t("ticket.image")}</Button>
            <Button type="button" variant="secondary" onClick={() => window.print()}><FileText size={16} aria-hidden="true" /> {t("ticket.pdf")}</Button>
            <ButtonLink variant="secondary" href={whatsappUrl(null, t("ticket.whatsappMessage", { event: title, link: ticket.pageUrl }))} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> {t("ticket.whatsapp")}<span className="sr-only">{t("common.newTab")}</span></ButtonLink>
          </div>
          <p className={styles.sheetNote}>{t("ticket.private")}</p>
        </section>
      </>}
    </main>
  </div>;
}
