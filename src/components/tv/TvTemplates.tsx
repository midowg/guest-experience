import { useEffect, useRef, type ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import { fit, fitText, TV_VIDEO_MOST_MS, youtubeEmbed, type TvNote, type TvTimelineEntry, type TvWelcome, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
import { TV_WELCOME_ART } from "@/lib/routes";
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

/**
 * A guest is welcomed, in the design picked for the row. "werkudara": the office's welcome sign
 * (its own picture: the logo, WELCOME, the four lines of business) with the guest's name in its
 * empty middle; the sign keeps its 16:9 shape on any screen, on the sign's own blue. "foto": the
 * visit's cover photo, darkened, behind the greeting and the name. "polos": the board's colours.
 */
export function WelcomeSlide({ welcome, design }: { welcome: TvWelcome; design: TvWelcomeDesign }) {
  const facts = (welcome.hours || welcome.place) && <ul className={css.welcomeFacts}>
    {welcome.hours && <li><Clock aria-hidden="true" />{welcome.hours}</li>}
    {welcome.place && <li><MapPin aria-hidden="true" />{welcome.place}</li>}
  </ul>;
  if (design === "werkudara") {
    // A long name is set smaller, so it stays inside the sign's empty middle.
    const size = welcome.name.length > 44 ? "kecil" : welcome.name.length > 26 ? "sedang" : "besar";
    return <section className={`${css.slide} ${css.sign}`} aria-label={`Sambutan untuk ${welcome.name}`}>
      <div className={css.signFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TV_WELCOME_ART} alt="Welcome. Werkudara Group." />
        <div className={css.signText}>
          <h1 data-size={size}>{welcome.name}</h1>
          {welcome.note && <p>{welcome.note}</p>}
          {facts}
        </div>
      </div>
    </section>;
  }
  const photo = design === "foto" ? welcome.image : "";
  // A long name is set smaller, so it stays on two lines at most.
  const size = welcome.name.length > 36 ? 6.5 : welcome.name.length > 20 ? 8.5 : 11;
  return <section className={`${css.slide} ${css.welcome}`} data-photo={!!photo} aria-label={`Sambutan untuk ${welcome.name}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {photo && <img className={css.welcomePhoto} src={photo} alt="" aria-hidden="true" referrerPolicy="no-referrer" />}
    <div className={css.welcomeText}>
      <p className={css.welcomeGreeting}>{welcome.greeting}</p>
      <h1 style={{ fontSize: u(size) }}>{welcome.name}</h1>
      {welcome.note && <p className={css.welcomeNote}>{welcome.note}</p>}
      {facts}
    </div>
  </section>;
}

/**
 * A YouTube video, in YouTube's own player across the whole screen, without sound. The player says
 * when the video has ended (or failed), and the board moves on; one that never says so is left
 * after TV_VIDEO_MOST_MS. With `loop` (the only thing in the playlist) it repeats instead.
 */
export function VideoSlide({ video, title, loop, onEnd }: { video: string; title: string; loop: boolean; onEnd: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const end = useRef(onEnd);
  useEffect(() => { end.current = onEnd; }, [onEnd]);
  useEffect(() => {
    if (loop) return;
    let heard = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (!data || typeof data !== "object") return;
      heard = true;
      // The player's state arrives as "onStateChange" (a number) or inside "infoDelivery"; 0 is "ended".
      const state = data.event === "onStateChange" ? data.info
        : data.event === "infoDelivery" && data.info && typeof data.info === "object" ? (data.info as { playerState?: unknown }).playerState : undefined;
      if (state === 0 || data.event === "onError") end.current();
    };
    window.addEventListener("message", onMessage);
    // The player only reports to a page that has said it is listening; asked until it answers.
    const ask = window.setInterval(() => {
      if (heard) { window.clearInterval(ask); return; }
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    }, 500);
    const most = window.setTimeout(() => end.current(), TV_VIDEO_MOST_MS);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(ask); window.clearTimeout(most); };
  }, [video, loop]);
  return <section className={`${css.slide} ${css.video}`} aria-label={title || "Video"}>
    <iframe ref={frame} src={youtubeEmbed(video, loop)} title={title || "Video YouTube"} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
  </section>;
}
