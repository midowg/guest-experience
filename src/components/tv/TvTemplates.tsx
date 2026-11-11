import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import { fit, fitText, TV_VIDEO_MOST_MS, TV_VIDEO_START_MS, youtubeEmbed, type TvBirthday, type TvNote, type TvTimelineEntry, type TvWelcome, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
import { TV_MARK, TV_WELCOME_ART } from "@/lib/routes";
import "@fontsource/playfair-display/800.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource/cormorant-garamond/700-italic.css";
import "@fontsource/cormorant-garamond/700.css";
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
 * The TV's waiting screen: Werkudara's mark on a light disc, a thin ring turning around it, and a
 * line saying what is being made ready. Shown while a video loads (instead of the browser's own
 * play button) and as something takes the TV over. Without motion for those who ask for none.
 */
export function TvLoader({ note }: { note: string }) {
  return <div className={css.loader} role="status" aria-live="polite">
    <span className={css.loaderMark} aria-hidden="true"><i style={{ maskImage: `url(${TV_MARK})`, WebkitMaskImage: `url(${TV_MARK})` }} /></span>
    <p>{note}</p>
  </div>;
}

/**
 * A video across the whole screen, without sound (a browser only starts a video by itself when it
 * is muted): a YouTube video in YouTube's own player, or an uploaded file (`file`, its address) in
 * the browser's. It is told to play, and told again while it has not started: some TV browsers do
 * not start a video by themselves. Until it plays, the waiting screen covers it, so the player's
 * own play button and poster are never on screen. When it ends or fails the board moves on; one
 * that does not start in TV_VIDEO_START_MS is passed over too. With `loop` (the only thing in the
 * playlist, as when it takes the TV over) it repeats, and one that will not start says so.
 */
export function VideoSlide({ video, file, title, loop, onEnd }: { video: string; file?: string; title: string; loop: boolean; onEnd: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const end = useRef(onEnd);
  const started = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [stuck, setStuck] = useState(false);
  useEffect(() => { end.current = onEnd; }, [onEnd]);
  const play = () => { started.current = true; setPlaying(true); setStuck(false); };

  // Not started in time: passed over; or, alone in the playlist, said on the waiting screen (and still tried).
  useEffect(() => {
    const late = window.setTimeout(() => { if (started.current) return; if (loop) setStuck(true); else end.current(); }, TV_VIDEO_START_MS);
    return () => window.clearTimeout(late);
  }, [video, file, loop]);

  // A file: muted by hand (React does not write the attribute a browser looks for), then told to play until it does.
  useEffect(() => {
    const element = player.current;
    if (!file || !element) return;
    element.muted = true; element.defaultMuted = true; element.setAttribute("muted", "");
    // An old TV browser's play() gives nothing back (no promise): asked for, never assumed.
    const start = () => { if (!element.paused) return; try { const tried = element.play() as Promise<void> | undefined; tried?.catch?.(() => undefined); } catch { /* not allowed yet: asked again */ } };
    start();
    const again = window.setInterval(start, 3_000);
    return () => window.clearInterval(again);
  }, [file]);

  // YouTube: its player reports to a page that listens, and takes commands the same way.
  useEffect(() => {
    if (file) return;
    let heard = false;
    const tell = (message: object) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: "widget" }), "*");
    const start = () => { tell({ event: "command", func: "mute", args: [] }); tell({ event: "command", func: "playVideo", args: [] }); };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (!data || typeof data !== "object") return;
      if (!heard) { heard = true; start(); }
      // The player's state arrives as "onStateChange" (a number) or inside "infoDelivery": 1 is playing, 0 ended.
      const state = data.event === "onStateChange" ? data.info
        : data.event === "infoDelivery" && data.info && typeof data.info === "object" ? (data.info as { playerState?: unknown }).playerState : undefined;
      if (state === 1) play();
      if (!loop && (state === 0 || data.event === "onError")) end.current();
    };
    window.addEventListener("message", onMessage);
    // Asked until it answers; then told to play until it does.
    const ask = window.setInterval(() => { if (!heard) tell({ event: "listening" }); else if (!started.current) start(); }, 1_500);
    const most = loop ? 0 : window.setTimeout(() => end.current(), TV_VIDEO_MOST_MS);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(ask); window.clearTimeout(most); };
  }, [video, file, loop]);

  return <section className={`${css.slide} ${css.video}`} data-playing={playing} aria-label={title || "Video"}>
    {file
      // A file that cannot be played (gone, or a kind this TV does not know) is passed over, not left black.
      ? <video ref={player} src={file} autoPlay muted playsInline loop={loop} preload="auto" disablePictureInPicture
        onPlaying={play} onEnded={() => end.current()} onError={() => { if (loop) setStuck(true); else end.current(); }} />
      : <iframe ref={frame} src={youtubeEmbed(video, loop)} title={title || "Video YouTube"} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />}
    {!playing && <TvLoader note={stuck ? "TV ini belum bisa memulai video sendiri" : "Menyiapkan video"} />}
  </section>;
}

/** A sprig of small white blossoms, drawn here (the card's own flowers are stock pictures of its design tool). */
function Sprig({ className }: { className: string }) {
  const blossom = (x: number, y: number, size: number, key: number) => <g key={key} transform={`translate(${x} ${y}) scale(${size})`}>
    {[0, 72, 144, 216, 288].map(turn => <ellipse key={turn} cx="0" cy="-5.2" rx="3.4" ry="5.2" fill="#fdfcf8" stroke="#e4dfd2" strokeWidth=".5" transform={`rotate(${turn})`} />)}
    <circle r="1.9" fill="#e9c452" />
  </g>;
  return <svg className={className} viewBox="0 0 120 90" aria-hidden="true" focusable="false">
    <path d="M6 86 C30 70 44 52 62 40 C78 30 96 26 114 12" fill="none" stroke="#7d6a4a" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M62 40 C66 30 74 24 84 22 M44 54 C40 44 42 36 48 30" fill="none" stroke="#7d6a4a" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M114 12 C108 8 100 9 96 14 C102 18 110 17 114 12 Z" fill="#8ea05c" />
    {[[30, 68, 1.15], [50, 28, 1], [66, 44, 1.2], [86, 20, .95], [96, 30, 1.05], [44, 50, .85], [76, 34, .8]].map(([x, y, size], index) => blossom(x, y, size, index))}
  </svg>;
}

/**
 * A birthday greeting, after the team's card: light paper, Werkudara's mark, the name heavy with
 * "Birthday" in blue under it and the day and month beside it, the person in a grey frame on a
 * blue panel, "Happy Birthday …" and the wish in italics, the foot. A photo that is the person
 * alone (`cut`) stands in front of the frame, the head above its edge, as on the card; any other
 * photo fills the blue panel. Lying on its side the frame is on the left and the words on the
 * right; upright (tv.module.css) it is the card's own order. Without a photo the panel shows the mark.
 */
export function BirthdaySlide({ birthday }: { birthday: TvBirthday }) {
  // A long name is set smaller, so it stays on two lines.
  const size = birthday.name.length > 30 ? "kecil" : birthday.name.length > 18 ? "sedang" : "besar";
  const mark = { maskImage: `url(${TV_MARK})`, WebkitMaskImage: `url(${TV_MARK})` };
  return <section className={`${css.slide} ${css.bday}`} aria-label={`Ucapan ulang tahun untuk ${birthday.name}`}>
    <i className={css.bdayMark} style={mark} aria-hidden="true" />
    <div className={css.bdayName}>
      <div><h1 data-size={size}>{birthday.name}</h1><span className={css.bdayScript} aria-hidden="true">Birthday</span></div>
      {birthday.day && <p><strong>{birthday.day}</strong><span>{birthday.month}</span></p>}
    </div>
    <div className={css.bdayPhoto} data-cut={birthday.cut}>
      <div className={css.bdayFrame}>
        <div className={css.bdayPanel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {birthday.photo && !birthday.cut ? <img src={birthday.photo} alt="" referrerPolicy="no-referrer" /> : !birthday.photo && <i style={mark} aria-hidden="true" />}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {birthday.photo && birthday.cut && <img className={css.bdayPerson} src={birthday.photo} alt="" referrerPolicy="no-referrer" />}
        <Sprig className={css.bdaySprigLeft} />
        <Sprig className={css.bdaySprigRight} />
      </div>
    </div>
    <div className={css.bdayWish}>
      <h2>Happy Birthday {birthday.call}</h2>
      <p>{birthday.wish}</p>
    </div>
    <p className={css.bdayFoot}><strong>Werkudara</strong> Group | werkudara.com</p>
  </section>;
}
