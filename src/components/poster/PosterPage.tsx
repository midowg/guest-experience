import { POSTER_LABEL, type CardType } from "@/lib/poster";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { PosterStudio } from "./PosterStudio";
import styles from "./card-studio.module.css";

const headings: Record<CardType, string> = { poster: "Buat poster Anda", ucapan: "Buat kartu ucapan Anda", idcard: "Buat ID card Anda", sertifikat: "Buat sertifikat Anda", undangan: "Buat kartu undangan Anda" };

/** The guest page around Studio Poster, in the event's theme. Only the poster data reaches the browser. */
export function PosterPage({ event }: { event: Pick<EventRecord, "id" | "title" | "theme" | "poster"> }) {
  return <main className={styles.page} data-theme={event.theme?.key ?? "werkudara"} style={themeStyle(event.theme)}>
    <header className={styles.head}>
      <p className={styles.eyebrow}>{POSTER_LABEL} · {event.title}</p>
      <h1>{headings[event.poster.cardType] ?? headings.poster}</h1>
      <p>Isi formnya, kartu langsung berubah, lalu unduh untuk dibagikan atau dicetak. Semua isian hanya tersimpan di perangkat ini.</p>
    </header>
    <PosterStudio eventId={event.id} eventTitle={event.title} poster={event.poster} />
  </main>;
}
