import { POSTER_LABEL } from "@/lib/poster";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { PosterStudio } from "./PosterStudio";
import styles from "./studio.module.css";

/** The guest page around Studio Poster, in the event's theme. Only the poster data reaches the browser. */
export function PosterPage({ event }: { event: Pick<EventRecord, "id" | "title" | "theme" | "poster"> }) {
  return <main className={styles.page} data-theme={event.theme?.key ?? "werkudara"} style={themeStyle(event.theme)}>
    <header className={styles.head}>
      <p className={styles.eyebrow}>{POSTER_LABEL} · {event.title}</p>
      <h1>Buat poster Anda</h1>
      <p>Isi kotak di poster, atur foto, lalu unduh untuk dibagikan. Semua isian hanya tersimpan di perangkat ini.</p>
    </header>
    <PosterStudio eventId={event.id} eventTitle={event.title} poster={event.poster} />
  </main>;
}
