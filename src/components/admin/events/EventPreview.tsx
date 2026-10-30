import { CalendarDays, MapPin } from "lucide-react";
import { formatDate, formatDateRange } from "@/lib/format";
import { localDay } from "@/lib/event-phase";
import { themeDefinition } from "@/lib/themes";
import type { EventRecord, PlainImage } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

const eyebrows: Record<EventRecord["event_kind"], string> = {
  acara: "Undangan acara", program: "Panduan peserta", handbook: "Panduan peserta", kunjungan: "Undangan kunjungan", eguide: "E-Guide",
  csr: "Friday Sharing", panduan: "Panduan lokasi", kartu: "Kartu",
};

/** The smallest generated size is plenty for a card; outside links have only their own url. */
const thumb = (image: PlainImage | undefined) => image?.url ? (image.srcset?.[0]?.url ?? image.url) : "";

/**
 * A small picture of the guest page's opening, from the event itself: its cover photo (or the
 * theme's colour), the label, title, date and place, in the event's own colours and heading font.
 * Seen at a glance on "Semua acara", so a card says what the page looks like, not only its name.
 */
export function EventPreview({ event }: { event: EventRecord }) {
  const t = themeDefinition(event.theme?.key ?? "werkudara").tokens;
  const photo = thumb(event.event_kind === "eguide" ? event.guide?.cover?.photo : event.hero);
  // A range only when the end is a later day; a draft whose end is still before its start shows the start.
  const days = !!event.starts_at && !!event.ends_at && localDay(event.ends_at, event.timezone) > localDay(event.starts_at, event.timezone);
  const when = !event.starts_at ? "" : days && event.ends_at ? formatDateRange(event.starts_at, event.ends_at, event.timezone) : formatDate(event.starts_at, event.timezone);
  const logo = thumb(event.client_logo);
  return <div className={styles.cardPreview} style={{ background: t.hero, color: t.onHero }} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {photo && <img className={styles.cardPreviewPhoto} src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    {photo && <span className={styles.cardPreviewScrim} style={{ background: `linear-gradient(to top, rgba(${t.scrimRgb}, .88), rgba(${t.scrimRgb}, .25) 70%, rgba(${t.scrimRgb}, .05))` }} />}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {logo && <img className={styles.cardPreviewLogo} src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    <span className={styles.cardPreviewText}>
      <span className={styles.cardPreviewEyebrow} style={{ color: t.heroAccent }}>{eyebrows[event.event_kind ?? "acara"]}</span>
      <strong className={styles.cardPreviewTitle} style={{ fontFamily: t.fontHeading, fontWeight: t.headingWeight }}>{event.event_kind === "eguide" ? event.guide?.cover?.title || event.title : event.title}</strong>
      {(when || event.venue_name) && <span className={styles.cardPreviewFacts}>
        {when && <span><CalendarDays size={11} /> {when}</span>}
        {event.venue_name && <span><MapPin size={11} /> {event.venue_name}</span>}
      </span>}
    </span>
  </div>;
}
