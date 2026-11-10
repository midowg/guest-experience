import type { ReactNode } from "react";
import { fit, fitText, type TvNote, type TvTimelineEntry } from "@/lib/pra-wam/tv";
import css from "./tv.module.css";

/*
 * The playlist's templates that are not a room calendar or a picture (migration 202611100007):
 * Timeline's forums and events, panitia's announcements, and a text typed in Admin TV. Each is a
 * full slide in the board's own units, with the same head as the calendars.
 */

const tones = [css.c0, css.c1, css.c2, css.c3, css.c4, css.c5, css.c6, css.c7, css.c8];
const u = (units: number) => `calc(${Math.round(units * 1000) / 1000} * var(--u))`;
const noteDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });

function Slide({ kicker, title, clock, label, children }: { kicker: string; title: string; clock: string; label: string; children: ReactNode }) {
  return <section className={`${css.slide} ${css.schedule}`} aria-label={label}>
    <header className={css.head}>
      <div className={css.headText}><p className={css.kicker}>{kicker}</p><h1 className={css.date}>{title}</h1></div>
      <p className={css.clock}>{clock}<span>WIB</span></p>
    </header>
    <div className={css.body}>{children}</div>
  </section>;
}

/** Timeline: what is on and what comes next, each with its dates and how far off it is. Rows share the height, so all of them are on screen. */
export function TimelineSlide({ entries, clock, height }: { entries: readonly TvTimelineEntry[]; clock: string; height: number }) {
  const row = fit(height, entries.length, 13);
  const text = fitText(row, 0.3, 3.2), small = fitText(row, 0.2, 2.1);
  return <Slide kicker="Timeline Pra WAM" title="Forum dan acara" clock={clock} label="Timeline Pra WAM">
    {entries.length === 0 ? <div className={css.message}><h2>Belum ada forum atau acara berikutnya</h2><p>Jadwal dari Kelola acara muncul di sini dengan sendirinya.</p></div>
      : <ul className={css.tlList}>{entries.map(entry => <li key={entry.id} className={`${css.tlRow} ${tones[entry.color % tones.length]}`} data-state={entry.state} style={{ height: u(row - 1), marginBottom: u(1) }}>
        <i className={css.dot} aria-hidden="true" />
        <span className={css.tlMain}>
          <strong className={css.one} style={{ fontSize: u(text) }}>{entry.title}</strong>
          <span className={css.one} style={{ fontSize: u(small) }}>{entry.state === "berlangsung" && <em>Sedang berlangsung · </em>}{entry.left}</span>
        </span>
        <span className={css.tlWhen} style={{ fontSize: u(small) }}><strong style={{ fontSize: u(Math.min(text, 2.6)) }}>{entry.when}</strong>{entry.hours && <span>{entry.hours}</span>}</span>
      </li>)}</ul>}
  </Slide>;
}

/** Panitia's announcements to everyone, newest first: the title, what it says, and when it was sent. */
export function NotesSlide({ notes, clock }: { notes: readonly TvNote[]; clock: string }) {
  const shown = notes.slice(0, 3);
  return <Slide kicker="Pengumuman" title="Dari panitia" clock={clock} label="Pengumuman panitia">
    {shown.length === 0 ? <div className={css.message}><h2>Belum ada pengumuman baru</h2><p>Pengumuman panitia untuk semua peserta muncul di sini.</p></div>
      : <ul className={css.noteList} data-count={shown.length}>{shown.map(note => <li key={note.id} className={css.note}>
        <strong>{note.title}</strong>
        {note.body && <p>{note.body}</p>}
        <small>{noteDate.format(new Date(note.at))}</small>
      </li>)}</ul>}
  </Slide>;
}

/** A text typed in Admin TV: a title and what it says, large, in the middle of the screen. */
export function TextSlide({ title, body }: { title: string; body: string }) {
  return <section className={`${css.slide} ${css.textSlide}`} aria-label={title || "Teks"}>
    {title && <h1>{title}</h1>}
    {body && <p>{body}</p>}
  </section>;
}
