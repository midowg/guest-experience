import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clock, MapPin } from "lucide-react";
import { fit, fitText, TV_VIDEO_MOST_MS, TV_VIDEO_START_MS, youtubeEmbed, type TvBirthday, type TvNote, type TvTimelineEntry, type TvTitleShow, type TvWelcome, type TvWelcomeDesign } from "@/lib/pra-wam/tv";
import { TV_BIRTHDAY_CARD, TV_BIRTHDAY_FLOWERS, TV_MARK, TV_WELCOME_ART } from "@/lib/routes";
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
export function VideoSlide({ video, file, title, loop, sound = false, titleShow = "awal", onEnd }: { video: string; file?: string; title: string; loop: boolean; sound?: boolean; titleShow?: TvTitleShow; onEnd: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const end = useRef(onEnd);
  const started = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [stuck, setStuck] = useState(false);
  /** Asked to play with sound, but this TV's browser refused sound nobody asked for by hand: it plays silent, and says how to turn it on. */
  const [silenced, setSilenced] = useState(false);
  useEffect(() => { end.current = onEnd; }, [onEnd]);
  const play = () => { started.current = true; setPlaying(true); setStuck(false); };

  // Not started in time: passed over; or, alone in the playlist, said on the waiting screen (and still tried).
  useEffect(() => {
    const late = window.setTimeout(() => { if (started.current) return; if (loop) setStuck(true); else end.current(); }, TV_VIDEO_START_MS);
    return () => window.clearTimeout(late);
  }, [video, file, loop]);

  // A file: muted by hand (React does not write the attribute a browser looks for), then told to play until it does.
  // With sound: tried with it first; a browser that refuses gets it silent, and one press on the TV turns the sound on.
  useEffect(() => {
    const element = player.current;
    if (!file || !element) return;
    let quiet = !sound, tries = 0;
    const hush = (on: boolean) => { element.muted = on; element.defaultMuted = on; if (on) element.setAttribute("muted", ""); else element.removeAttribute("muted"); };
    hush(quiet);
    const ask = () => { try { return element.play() as Promise<void> | undefined; } catch { return undefined; } };
    const silence = () => { if (quiet) return; quiet = true; hush(true); setSilenced(true); };
    const start = () => {
      if (!element.paused) return;
      // An old TV browser's play() gives nothing back (no promise): still stopped at the next ask is taken as "sound refused".
      if (tries > 0) silence();
      tries += 1;
      ask()?.catch?.(() => { if (quiet) return; silence(); ask()?.catch?.(() => undefined); });
    };
    start();
    const again = window.setInterval(start, 3_000);
    const unlock = () => { if (!sound || !quiet) return; quiet = false; hush(false); setSilenced(false); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.clearInterval(again); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [file, sound]);

  // YouTube: its player reports to a page that listens, and takes commands the same way.
  useEffect(() => {
    if (file) return;
    let heard = false;
    const tell = (message: object) => frame.current?.contentWindow?.postMessage(JSON.stringify({ ...message, id: 1, channel: "widget" }), "*");
    const start = () => { tell({ event: "command", func: "mute", args: [] }); tell({ event: "command", func: "playVideo", args: [] }); };
    // Sound: asked for once the video plays. A browser that refuses stops the video instead: it is then started again silent.
    let loud: "no" | "asked" | "refused" | "on" = "no", askedAt = 0;
    const unmute = () => { tell({ event: "command", func: "unMute", args: [] }); tell({ event: "command", func: "setVolume", args: [100] }); };
    const unlock = () => { if (!sound || loud !== "refused") return; loud = "on"; unmute(); setSilenced(false); };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (!data || typeof data !== "object") return;
      if (!heard) { heard = true; start(); }
      // The player's state arrives as "onStateChange" (a number) or inside "infoDelivery": 1 is playing, 0 ended.
      const state = data.event === "onStateChange" ? data.info
        : data.event === "infoDelivery" && data.info && typeof data.info === "object" ? (data.info as { playerState?: unknown }).playerState : undefined;
      if (state === 1) {
        play();
        if (sound && loud === "no") { loud = "asked"; askedAt = Date.now(); unmute(); }
      }
      // Stopped right after sound was asked for: this browser will not play sound by itself.
      if (state === 2 && loud === "asked" && Date.now() - askedAt < 6_000) { loud = "refused"; setSilenced(true); start(); }
      if (!loop && (state === 0 || data.event === "onError")) end.current();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    // Asked until it answers; then told to play until it does.
    const ask = window.setInterval(() => { if (!heard) tell({ event: "listening" }); else if (!started.current) start(); }, 1_500);
    const most = loop ? 0 : window.setTimeout(() => end.current(), TV_VIDEO_MOST_MS);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); window.clearInterval(ask); window.clearTimeout(most); };
  }, [video, file, loop, sound]);

  return <section className={`${css.slide} ${css.video}`} data-playing={playing} aria-label={title || "Video"}>
    {file
      // A file that cannot be played (gone, or a kind this TV does not know) is passed over, not left black.
      ? <video ref={player} src={file} autoPlay muted={!sound} playsInline loop={loop} preload="auto" disablePictureInPicture
        onPlaying={play} onEnded={() => end.current()} onError={() => { if (loop) setStuck(true); else end.current(); }} />
      : <iframe ref={frame} src={youtubeEmbed(video, loop)} title={title || "Video YouTube"} allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />}
    {!playing && <TvLoader note={stuck ? "TV ini belum bisa memulai video sendiri" : "Menyiapkan video"} />}
    {/* The video's name, small, in a corner: the screen has bars beside an upright video. Shown once it plays; "awal" lets it go by itself. */}
    {playing && title.trim() && titleShow !== "tidak" && <p className={css.videoChip} data-mode={titleShow} data-title="video">{title}</p>}
    {playing && silenced && <p className={css.soundHint} role="note">Suara belum menyala. Tekan OK di remote atau klik layar sekali.</p>}
  </section>;
}

/**
 * A birthday greeting: the team's own card. The card's picture (blank: paper, mark, "Birthday",
 * the grey frame with its blue panel, the flowers, the foot) is shown whole, upright, in the
 * middle of any screen on the card's paper colour; on it, where the card has them, the name, the
 * day and month, the person, "Happy Birthday …" and the wish. A photo that is the person alone
 * (`cut`) stands on the panel's lower edge with the head above the frame, behind the card's own
 * flowers; any other photo fills the blue panel. Everything is sized by the card's height, so it
 * sits the same on every TV.
 */
export function BirthdaySlide({ birthday }: { birthday: TvBirthday }) {
  // A long name is set smaller, so it stays on two lines beside the date.
  const size = birthday.name.length > 28 ? "kecil" : birthday.name.length > 18 ? "sedang" : "besar";
  return <section className={`${css.slide} ${css.bday}`} aria-label={`Ucapan ulang tahun untuk ${birthday.name}`}>
    <div className={css.bdayCard}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={css.bdayArt} src={TV_BIRTHDAY_CARD} alt="" />
      <h1 className={css.bdayName} data-size={size}>{birthday.name}</h1>
      {birthday.day && <p className={css.bdayDate}><strong>{birthday.day}</strong><span>{birthday.month}</span></p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {birthday.photo && <img className={birthday.cut ? css.bdayPerson : css.bdayPhoto} src={birthday.photo} alt="" referrerPolicy="no-referrer" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {birthday.photo && birthday.cut && <img className={css.bdayArt} src={TV_BIRTHDAY_FLOWERS} alt="" />}
      <div className={css.bdayWish}>
        <h2>Happy Birthday {birthday.call}</h2>
        <p>{birthday.wish}</p>
      </div>
    </div>
  </section>;
}
