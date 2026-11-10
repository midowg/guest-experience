"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Hourglass, Maximize } from "lucide-react";
import { rangeLabel, type Countdown } from "@/lib/pra-wam/timeline";
import QRCode from "qrcode";
import { TV_HOME_PATH } from "@/lib/routes";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import {
  dayEntries, decimalHour, entryOwner, entryState, fit, isPhoneScreen, legendFor, legendItem, legendRows, shouldReload, tvLegend, tvLegendUnits, fitText, hourSpan, imageFit, msUntilReload, itemLabel, nowAt, place, playlistOf, shownDays, tvDateLabel, tvDayHead, tvScreen, tvWeekLabel,
  type TvDay, type TvDayEntry, type TvEntry, type TvFeed, type TvLegendItem, type TvRoom,
} from "@/lib/pra-wam/tv";
import base from "@/components/pra-wam/pra-wam.module.css";
import { TvPhone } from "./TvPhone";
import { NotesSlide, TextSlide, TimelineSlide } from "./TvTemplates";
import css from "./tv.module.css";

/** How often a TV asks for content, and how often it re-reads the clock for "now". */
const POLL_MS = 10_000;
const TICK_MS = 10_000;
/** How long "Layar penuh" stays after the last touch or mouse move. */
const CONTROLS_MS = 4_000;
/** The head's height and the slide's paddings in units, as tv.module.css draws them. */
const HEAD = 18, PAD_X = 4, PAD_BOTTOM = 5;

/** When this TV last loaded itself afresh for a new build, kept for the tab so a reload is not repeated at once. */
const RELOADED_AT = "tv-dimuat-ulang";
function lastReload(): number | null {
  try { const at = Number(window.sessionStorage.getItem(RELOADED_AT)); return Number.isFinite(at) && at > 0 ? at : null; }
  catch { return null; }
}

/** Whether this tab already obeyed a reload request (remembered for the tab, so the reload itself does not ask again). */
const RELOAD_ASKED = "tv-diminta-muat-ulang";
function reloadDone(asked: string): boolean {
  try { if (window.sessionStorage.getItem(RELOAD_ASKED) === asked) return true; window.sessionStorage.setItem(RELOAD_ASKED, asked); return false; }
  catch { return false; }
}

const onResize = (notify: () => void) => { window.addEventListener("resize", notify); return () => window.removeEventListener("resize", notify); };
const screenSize = () => `${window.innerWidth}x${window.innerHeight}`;
const onFullscreen = (notify: () => void) => { document.addEventListener("fullscreenchange", notify); return () => document.removeEventListener("fullscreenchange", notify); };
/** A length in the board's units. */
const u = (units: number) => `calc(${Math.round(units * 1000) / 1000} * var(--u))`;
const span = (entry: Pick<TvEntry, "start" | "end">) => `${clockLabel(entry.start)}–${clockLabel(entry.end)}`;

/**
 * The board an office TV plays: today's rooms as a calendar, the week's as a calendar, then the
 * pictures, on a loop. A calendar always fits the screen: its rows and text shrink as it fills.
 * With `feedUrl` the board keeps itself fresh (every 10 seconds, and when the tab is shown again),
 * keeps playing what it has when the network drops, and loads the page afresh once a night.
 * Without it (a layout check) it plays `initial` as given.
 */
export function TvBoard({ initial, feedUrl }: { initial: TvFeed; feedUrl?: string }) {
  const [feed, setFeed] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.now));
  const [gone, setGone] = useState(false);
  const [index, setIndex] = useState(0);
  /** The loop stopped by hand (a phone's Jeda): the item stays until someone moves on or starts it again. */
  const [paused, setPaused] = useState(false);
  const [natural, setNatural] = useState<Record<string, [number, number]>>({});
  const [active, setActive] = useState(false);
  const showing = useRef("");
  /** The server's clock minus this TV's, so a TV with a wrong clock still draws "now" in the right place. */
  const offset = useRef(0);
  const size = useSyncExternalStore(onResize, screenSize, () => "1920x1080");
  const fullscreen = useSyncExternalStore(onFullscreen, () => !!document.fullscreenElement, () => false);
  /** A touch screen: what a phone has and a TV does not (see isPhoneScreen). */
  const touch = useSyncExternalStore(onResize, () => navigator.maxTouchPoints > 0, () => false);
  const [width, height] = size.split("x").map(Number);

  // The clock: the server's time at first, then this TV's own clock corrected by the difference.
  useEffect(() => {
    offset.current = Date.parse(initial.now) - Date.now();
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), TICK_MS);
    return () => window.clearInterval(timer);
  }, [initial.now]);

  // Fresh content. A failed request changes nothing: the TV keeps playing what it has.
  useEffect(() => {
    if (!feedUrl) return;
    let stopped = false;
    const load = async () => {
      try {
        // With the screen's size and what it is showing, for Admin TV's Pantauan.
        const response = await fetch(`${feedUrl}?w=${window.innerWidth}&h=${window.innerHeight}&item=${encodeURIComponent(showing.current)}`, { cache: "no-store", credentials: "same-origin" });
        if (stopped) return;
        if (response.status === 404) { setGone(true); return; }
        if (!response.ok) return;
        const result = await response.json() as { ok?: boolean; data?: TvFeed };
        if (stopped || !result.ok || !result.data) return;
        // A newer build of the site answered: this page is old, so it loads itself afresh (once in a few minutes at most).
        // Admin TV asked this TV to load itself afresh (Muat ulang TV) after this page was opened: once per request.
        const asked = result.data.reloadAt;
        if (asked && Date.parse(asked) > Date.parse(initial.now) && !reloadDone(asked)) { window.location.reload(); return; }
        if (shouldReload(initial.version, result.data.version, lastReload(), Date.now())) {
          try { window.sessionStorage.setItem(RELOADED_AT, String(Date.now())); } catch { /* private mode: reload anyway */ }
          window.location.reload();
          return;
        }
        offset.current = Date.parse(result.data.now) - Date.now();
        setGone(false); setFeed(result.data); setNow(Date.parse(result.data.now));
      } catch { /* offline: keep playing */ }
    };
    const shown = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    document.addEventListener("visibilitychange", shown);
    // A TV stays on for weeks: load the page afresh at 03.00 WIB, so it also picks up a new version.
    const reload = window.setTimeout(() => window.location.reload(), msUntilReload(new Date()));
    return () => { stopped = true; window.clearInterval(timer); window.clearTimeout(reload); document.removeEventListener("visibilitychange", shown); };
  }, [feedUrl, initial.version, initial.now]);

  // Keep the screen awake where the browser allows it; a kiosk app does this better.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const ask = () => { if (document.visibilityState === "visible") navigator.wakeLock.request("screen").then(got => { lock = got; }, () => undefined); };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => { document.removeEventListener("visibilitychange", ask); void lock?.release().catch(() => undefined); };
  }, []);

  // The QR code: to the address the admin gave, or to the address this TV itself opened.
  const { qrShow, qrUrl } = feed.settings;
  const [qr, setQr] = useState<{ of: string; src: string } | null>(null);
  useEffect(() => {
    if (!qrShow) return;
    let live = true;
    const here = window.location.pathname.startsWith(TV_HOME_PATH) ? window.location.pathname : TV_HOME_PATH;
    const target = qrUrl || `${window.location.origin}${here}`;
    void QRCode.toDataURL(target, { margin: 1, width: 480, errorCorrectionLevel: "M" }).then(src => { if (live) setQr({ of: `${qrUrl}`, src }); }, () => undefined);
    return () => { live = false; };
  }, [qrShow, qrUrl]);

  // "Layar penuh" shows while someone is at the TV, then goes (and the pointer with it).
  useEffect(() => {
    let timer = 0;
    const wake = () => { setActive(true); window.clearTimeout(timer); timer = window.setTimeout(() => setActive(false), CONTROLS_MS); };
    const events = ["pointermove", "pointerdown", "keydown"] as const;
    for (const name of events) window.addEventListener(name, wake);
    return () => { window.clearTimeout(timer); for (const name of events) window.removeEventListener(name, wake); };
  }, []);

  const screen = useMemo(() => tvScreen(width, height), [width, height]);
  const items = useMemo(() => playlistOf(feed), [feed]);
  const position = items.length ? index % items.length : 0;
  const current = items[position];
  const following = items.length > 1 ? items[(position + 1) % items.length] : undefined;

  // What this TV is showing, said to the server with each ask (a ref: the asking loop is not restarted by it).
  const showingNow = current ? itemLabel(current) : "";
  useEffect(() => { showing.current = showingNow; }, [showingNow]);

  // Only a phone can stop the loop (its Jeda button): a TV has no such control and always plays on.
  // `?hp=1` in the address asks for the phone's list on any screen: to check it from a computer, or to share the list on purpose.
  const asked = useSyncExternalStore(onResize, () => new URLSearchParams(window.location.search).get("hp") === "1", () => false);
  const phone = asked || isPhoneScreen(width, height, touch);
  const stopped = paused && phone;
  // The loop: each item stays its own time. Keyed on the item, so a clock tick does not restart it.
  const currentKey = current?.key, currentSeconds = current?.seconds, count = items.length;
  useEffect(() => {
    if (!currentKey || !currentSeconds || count < 2 || stopped) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % count), currentSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [currentKey, currentSeconds, count, stopped]);

  const time = wibTime(new Date(now).toISOString());
  const clock = clockLabel(time);
  const today = feed.days.find(day => day.date === feed.date)?.rooms ?? [];
  const week = shownDays(feed.days);
  /** The room a calendar has below the head, in units. */
  const room = { width: screen.width - PAD_X * 2, height: screen.height - HEAD - PAD_BOTTOM };

  const entriesToday = today.flatMap(item => item.entries);
  const onNow = entriesToday.filter(entry => entryState(entry, now) === "berlangsung").length;
  const dayNote = [`${today.length} ruang dipakai`, `${entriesToday.length} jadwal`, ...(onNow ? [`${onNow} sedang berlangsung`] : [])].join(" · ");
  const weekCount = week.reduce((sum, day) => sum + day.rooms.reduce((count, item) => count + item.entries.length, 0), 0);

  // One colour per activity for the whole week, so it is the same on both calendars; each shows the ones it draws.
  const legend = useMemo(() => tvLegend(feed.days), [feed.days]);
  const dayLegend = legendRows(legendFor(legend, today), room.width);
  const weekLegend = legendRows(legendFor(legend, week.flatMap(day => day.rooms)), room.width);
  const under = (shown: Legend) => ({ width: room.width, height: room.height - legendHeight(shown) });

  // A phone (someone scanned the QR code): the same content as a list that scrolls, with the loop under the reader's control.
  if (phone) {
    return <div data-wam-look={feed.look} data-wam-theme={feed.settings.mode} style={{ display: "contents" }}><div className={base.app}>
      <TvPhone feed={feed} now={now} clock={clock} items={items} position={position} paused={paused} gone={gone} legend={legend} onGo={setIndex} onPause={setPaused} />
    </div></div>;
  }

  // WAM's own theme (Admin WAM → Tema aplikasi), in the mode picked for the TVs: dark unless the admin chose light.
  return <div data-wam-look={feed.look} data-wam-theme={feed.settings.mode} style={{ display: "contents" }}><div className={base.app}>
  <main className={css.board} data-idle={!active} data-orientation={screen.wide ? "mendatar" : "tegak"} data-qr={qrShow ? feed.settings.qrPosition : undefined}>
    {gone ? <div className={css.slide}><Message title="Tautan TV ini sudah tidak berlaku" body="Minta tautan baru di Admin WAM → TV Announcement." /></div>
      : !current ? <div className={css.slide}><Message title="Belum ada yang ditayangkan" body="Tambahkan gambar atau nyalakan jadwal ruang di Admin WAM → TV Announcement." /></div>
      : current.kind === "hari"
        ? <Schedule key={current.key} kicker="Jadwal ruang hari ini" title={tvDateLabel(feed.date)} note={today.length ? dayNote : undefined} clock={clock} legend={dayLegend} countdown={feed.countdown} wide={screen.wide}>
          {today.length === 0 ? <Message title="Belum ada ruang yang dipakai hari ini" body="Booking baru muncul di sini dengan sendirinya." />
            : screen.wide ? <DayWide rooms={today} legend={legend} now={now} time={time} room={under(dayLegend)} /> : <DayTall rooms={today} legend={legend} now={now} time={time} room={under(dayLegend)} />}
        </Schedule>
        : current.kind === "minggu"
          ? <Schedule key={current.key} kicker="Jadwal ruang minggu ini" title={tvWeekLabel(week.map(day => day.date))} note={weekCount ? `${weekCount} jadwal minggu ini` : undefined} clock={clock} legend={weekLegend} countdown={feed.countdown} wide={screen.wide}>
            {week.every(day => day.rooms.length === 0) ? <Message title="Belum ada ruang yang dipakai minggu ini" body="Booking baru muncul di sini dengan sendirinya." />
              : screen.wide ? <WeekWide days={week} legend={legend} today={feed.date} now={now} room={under(weekLegend)} /> : <WeekTall days={week} legend={legend} today={feed.date} now={now} room={under(weekLegend)} />}
          </Schedule>
          : current.kind === "timeline" ? <TimelineSlide key={current.key} entries={feed.timeline ?? []} clock={clock} height={room.height} />
          : current.kind === "pengumuman" ? <NotesSlide key={current.key} notes={feed.notes ?? []} clock={clock} />
          : current.kind === "teks" ? <TextSlide key={current.key} title={current.title} body={current.body} />
          : <section key={current.key} className={`${css.slide} ${css.picture}`} aria-label={current.slide.title || "Gambar pengumuman"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.slide.src} alt={current.slide.title || "Gambar pengumuman"} referrerPolicy="no-referrer"
              data-fit={natural[current.slide.id] ? imageFit(...natural[current.slide.id], width, height) : "contain"}
              onLoad={event => { const { naturalWidth, naturalHeight } = event.currentTarget; const id = current.slide.id; setNatural(known => ({ ...known, [id]: [naturalWidth, naturalHeight] })); }} />
          </section>}
    {/* The next picture is fetched while this item shows, so it appears at once. */}
    {following?.kind === "gambar" && following.key !== current?.key
      // eslint-disable-next-line @next/next/no-img-element
      && <img key={following.key} className={css.preload} src={following.slide.src} alt="" aria-hidden="true" referrerPolicy="no-referrer" />}
    {!gone && current && qrShow && qr?.of === qrUrl && <aside className={css.qr} data-position={feed.settings.qrPosition} aria-label="Kode QR">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.src} alt={`Kode QR${feed.settings.qrLabel ? `: ${feed.settings.qrLabel}` : ""}`} />
      {feed.settings.qrLabel && <span>{feed.settings.qrLabel}</span>}
    </aside>}
    {active && !fullscreen && <button type="button" className={css.full} onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
      <Maximize size={20} aria-hidden="true" />Layar penuh
    </button>}
  </main>
  </div></div>;
}

/** The legend's colours, in TV_COLORS order (tv.module.css). */
const tones = [css.c0, css.c1, css.c2, css.c3, css.c4, css.c5, css.c6, css.c7, css.c8];
type Legend = { rows: TvLegendItem[][]; more: number };
/** The height the legend takes above a calendar, in units. */
const legendHeight = (legend: Legend) => (legend.rows.length ? legend.rows.length * tvLegendUnits.row + 1 : 0);
const clamp = (value: number, least: number, most: number) => Math.max(least, Math.min(most, value));

/** An activity's number on a dot of its colour: what ties a block to its name in the legend, colour or no colour. */
function Badge({ code, size }: { code: number | null; size: number }) {
  return code == null ? null : <b className={css.badge} style={{ fontSize: u(size) }}>{code}</b>;
}

function Schedule({ kicker, title, note, clock, legend, countdown, wide = true, children }: { kicker: string; title: string; note?: string; clock: string; legend: Legend; countdown?: Countdown | null; wide?: boolean; children: ReactNode }) {
  // On a TV standing up there is no room beside the clock: the countdown takes the note's line.
  const below = !!countdown && !wide;
  return <section className={`${css.slide} ${css.schedule}`} aria-label={kicker}>
    <header className={css.head}>
      <div className={css.headText}><p className={css.kicker}>{kicker}</p><h1 className={css.date}>{title}</h1>
        {below ? <p className={`${css.summary} ${css.countdownLine}`} role="note"><Hourglass aria-hidden="true" />{countdownText(countdown)}</p>
          : note && <p className={css.summary}>{note}</p>}</div>
      {countdown && !below && <CountdownNote countdown={countdown} />}
      <p className={css.clock}>{clock}<span>WIB</span></p>
    </header>
    {/* Each activity once, with its number and colour: the blocks below carry the number, not the name. */}
    {legend.rows.length > 0 && <ul className={css.legend} aria-label="Kegiatan, dengan nomor dan warnanya">
      {legend.rows.map((row, index) => <li key={index} className={css.legendRow}>
        {row.map(item => <span key={item.title} className={`${css.chip} ${tones[item.color]}`}><Badge code={item.code} size={1.7} /><span className={css.one}>{item.title}</span></span>)}
        {index === legend.rows.length - 1 && legend.more > 0 && <span className={css.chipMore}>+{legend.more} lainnya</span>}
      </li>)}
    </ul>}
    <div className={css.body}>{children}</div>
  </section>;
}

/**
 * Pra WAM's countdown in the head (10 Nov 2026, asked by panitia): what is on and how long until it
 * ends, or what comes next and how long until it starts. Two lines, beside the clock.
 */
const countdownText = (countdown: Countdown) => `${countdown.entry.title} ${countdown.edge} ${countdown.left} · ${rangeLabel(countdown.date, countdown.date)}`;
function CountdownNote({ countdown }: { countdown: Countdown }) {
  return <p className={css.countdown} role="note">
    <span className={css.countdownTitle}><Hourglass aria-hidden="true" /><span className={css.one}>{countdown.entry.title}</span></span>
    <span className={css.countdownLeft}>{countdown.edge} <strong>{countdown.left}</strong> · {rangeLabel(countdown.date, countdown.date)}</span>
  </p>;
}

type Room = { width: number; height: number };
const pad = (hour: number) => `${String(hour).padStart(2, "0")}.00`;
/** Every whole hour of a span, and the ones that get a label (every second one on a long day). */
function hoursOf(from: number, to: number) {
  const all = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const step = to - from > 12 ? 2 : 1;
  return { all, labelled: all.filter(hour => (hour - from) % step === 0), at: (hour: number) => ((hour - from) / Math.max(1, to - from)) * 100 };
}
/** The widest a line of hours ("11.00–12.30") is at a text size, and a block's padding, in units. */
const HOURS_LETTERS = 7, START_LETTERS = 3.4, BLOCK_PAD = 2.2;
/** The hours of a block `wide` units wide: the whole span when it fits at the smallest size, else the start; and the text size that fits. */
function hoursIn(entry: Pick<TvEntry, "start" | "end">, wide: number, most: number) {
  const whole = wide >= 1.25 * HOURS_LETTERS + BLOCK_PAD;
  return { text: whole ? span(entry) : clockLabel(entry.start), size: clamp((wide - BLOCK_PAD) / (whole ? HOURS_LETTERS : START_LETTERS), 1.25, most) };
}

/**
 * Today on a landscape TV: a card per room against the hours. Cards share the height, so every
 * room in use is on screen. A block says who booked it (department and name) on as many lines as
 * it takes, with its hours small underneath; its activity is its number and colour.
 */
function DayWide({ rooms, legend, now, time, room }: { rooms: TvRoom[]; legend: readonly TvLegendItem[]; now: number; time: string; room: Room }) {
  const AXIS = 5, NAME = 26, GAP = 0.5;
  const hours = hourSpan(rooms), marks = hoursOf(hours.from, hours.to);
  const row = fit(room.height - AXIS, rooms.length, 22);
  const roomy = row >= 11;
  const track = room.width - NAME;
  const nowPlace = nowAt(time, hours);
  // Before the hours start nothing is over; after they end all of it is.
  const gone = nowPlace ?? (decimalHour(time) > hours.to ? 100 : 0);
  return <>
    <div className={css.axis} style={{ left: u(NAME), height: u(AXIS) }}>
      {marks.labelled.map(hour => <span key={hour} className={css.hour} style={{ left: `${marks.at(hour)}%` }}>{pad(hour)}</span>)}
    </div>
    <div className={css.rows} style={{ top: u(AXIS) }}>
      {nowPlace != null && <div className={css.over} style={{ left: u(NAME), right: 0, height: u(row * rooms.length) }}>
        <div className={css.nowLine} style={{ left: `${nowPlace}%` }}><b>{clockLabel(time)}</b></div>
      </div>}
      {rooms.map(item => <div key={item.id} className={css.row} style={{ height: u(row) }}>
        <div className={css.rowName} style={{ width: u(NAME) }}>
          <strong className={row >= 7 ? css.wrap : css.one} style={{ fontSize: u(fitText(row, 0.16, 2.6)), WebkitLineClamp: 2 }}>{item.name}</strong>
          {row >= 10 && <small className={css.one} style={{ fontSize: u(1.6) }}>{item.entries.length} jadwal</small>}
        </div>
        <div className={css.track}>
          {marks.all.slice(1, -1).map(hour => <i key={hour} style={{ left: `${marks.at(hour)}%` }} />)}
          {gone > 0 && <div className={css.gone} style={{ width: `${gone}%` }} />}
          {item.entries.map(entry => {
            const spot = place(entry, hours), state = entryState(entry, now), who = legendItem(legend, entry.title);
            const wide = (spot.size / 100) * track;
            const when = hoursIn(entry, wide, 1.6);
            const on = state === "berlangsung" && wide >= 10;
            // The booker's text is sized by the block's width and wraps: a narrow block gets more, shorter lines.
            const text = clamp((wide - BLOCK_PAD) * 0.13, 1.35, 2.6);
            const lines = Math.max(1, Math.floor((row - GAP * 2 - 1.6 - 3 - when.size * 1.3 * (on ? 2 : 1)) / (text * 1.2)));
            return <div key={entry.key} className={`${css.block} ${tones[who.color]}`} data-state={state} title={entry.title}
              style={{ left: `${spot.at}%`, width: `${spot.size}%`, top: u(GAP), bottom: u(GAP) }}>
              {roomy ? <>
                {wide >= 4.6 && <Badge code={who.code} size={1.5} />}
                {entry.by && <span className={`${css.wrap} ${css.title}`} style={{ fontSize: u(text), WebkitLineClamp: lines }}>{entry.by}</span>}
                <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(when.size) }}>{when.text}</span>
                {on && <span className={`${css.one} ${css.on}`} style={{ fontSize: u(when.size) }}>Berlangsung</span>}
              </> : <span className={css.inline} style={{ fontSize: u(clamp(row * 0.3, 1.25, 1.8)) }}>
                {wide >= 4.6 && <Badge code={who.code} size={clamp(row * 0.26, 1.2, 1.5)} />}<span className={css.one}>{when.text}</span>
              </span>}
            </div>;
          })}
        </div>
      </div>)}
    </div>
  </>;
}

/** Today on a portrait TV: a card per room, the hours running down. Cards share the width. */
function DayTall({ rooms, legend, now, time, room }: { rooms: TvRoom[]; legend: readonly TvLegendItem[]; now: number; time: string; room: Room }) {
  const SIDE = 9, TOP = 7, GAP = 0.4;
  const hours = hourSpan(rooms), marks = hoursOf(hours.from, hours.to);
  const column = fit(room.width - SIDE, rooms.length, 40);
  const wide = column - GAP * 2 - 0.8;
  const nowPlace = nowAt(time, hours);
  const gone = nowPlace ?? (decimalHour(time) > hours.to ? 100 : 0);
  const text = clamp((wide - BLOCK_PAD) * 0.12, 1.3, 2);
  return <>
    <div className={css.cols} style={{ left: u(SIDE), height: u(TOP) }}>
      {rooms.map(item => <div key={item.id} className={css.colName} style={{ width: u(column), fontSize: u(fitText(column, 0.15, 2.6)) }}>{item.name}</div>)}
    </div>
    <div className={css.side} style={{ top: u(TOP), width: u(SIDE) }}>
      {marks.labelled.map(hour => <span key={hour} className={css.hour} style={{ top: `${marks.at(hour)}%` }}>{pad(hour)}</span>)}
    </div>
    {nowPlace != null && <div className={css.overDown} style={{ top: u(TOP), left: u(SIDE) }}>
      <div className={css.nowBar} style={{ top: `${nowPlace}%` }}><b>{clockLabel(time)}</b></div>
    </div>}
    <div className={css.down} style={{ top: u(TOP), left: u(SIDE) }}>
      {rooms.map(item => <div key={item.id} className={css.lane} style={{ width: u(column) }}>
        <div className={css.laneTrack}>
          {marks.all.slice(1, -1).map(hour => <i key={hour} style={{ top: `${marks.at(hour)}%` }} />)}
          {gone > 0 && <div className={css.goneDown} style={{ height: `${gone}%` }} />}
          {item.entries.map(entry => {
            const spot = place(entry, hours), state = entryState(entry, now), who = legendItem(legend, entry.title);
            const when = hoursIn(entry, wide, 1.6);
            return <div key={entry.key} className={`${css.block} ${tones[who.color]}`} data-state={state} title={entry.title}
              style={{ top: `${spot.at}%`, height: `${spot.size}%`, left: u(GAP), right: u(GAP) }}>
              {wide >= 4.6 && <Badge code={who.code} size={1.5} />}
              {entry.by && <span className={`${css.wrap} ${css.title}`} style={{ fontSize: u(text), WebkitLineClamp: 3 }}>{entry.by}</span>}
              <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(when.size) }}>{when.text}</span>
              {state === "berlangsung" && <span className={`${css.one} ${css.on}`} style={{ fontSize: u(when.size) }}>Berlangsung</span>}
            </div>;
          })}
        </div>
      </div>)}
    </div>
  </>;
}

function DayHead({ date, today, height, text }: { date: string; today: string; height: number; text: number }) {
  const head = tvDayHead(date);
  return <div className={css.dayHead} style={{ height: u(height), fontSize: u(text), alignItems: "center" }}>
    <strong className={css.one}>{head.name}</strong><span className={css.one}>{head.day}</span>{date === today && <em>Hari ini</em>}
  </div>;
}

/**
 * The week on a landscape TV: a column per day. The fullest day decides the entry size, so every
 * entry of the week is on screen. An entry leads with its hours, large; its room and who booked
 * it go underneath when there is the height for it.
 */
function WeekWide({ days, legend, today, now, room }: { days: TvDay[]; legend: readonly TvLegendItem[]; today: string; now: number; room: Room }) {
  const HEADING = 7, GAP = 0.9, COLUMN_GAP = 2.4;
  const lists = days.map(day => ({ day, entries: dayEntries(day) }));
  const unit = fit(room.height - HEADING - 1, Math.max(...lists.map(list => list.entries.length)), 10);
  const column = (room.width - COLUMN_GAP * (days.length - 1)) / days.length;
  // Two lines an entry (the hours, then the room and whose it is) down to about fourteen entries a day; one line past that.
  const stacked = unit >= 4.6;
  const hours = stacked ? Math.min(fitText(unit - GAP, 0.4, 2.4), fitText(column, 0.062, 2.4)) : Math.min(fitText(unit, 0.42, 2.2), fitText(column, 0.06, 2.2));
  const small = Math.min(fitText(unit - GAP, 0.25, 1.75), fitText(column, 0.052, 1.75));
  const lines = 1;
  return <div className={css.week} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: u(COLUMN_GAP) }}>
    {lists.map(({ day, entries }) => <div key={day.date} className={css.weekDay} data-today={day.date === today}>
      <DayHead date={day.date} today={today} height={HEADING - 1} text={fitText(column, 0.085, 2.6)} />
      {entries.length === 0 && <p className={css.free} style={{ marginTop: u(1.2), fontSize: u(2) }}>Kosong</p>}
      {entries.map(entry => <WeekItem key={`${entry.key}:${entry.room}`} entry={entry} who={legendItem(legend, entry.title)} now={now} height={unit - GAP} gap={GAP}
        hours={hours} small={stacked ? small : null} lines={lines} width={column - 7.6} />)}
    </div>)}
  </div>;
}

/** The week on a portrait TV: a band per day, one line per entry. All lines share the height. */
function WeekTall({ days, legend, today, now, room }: { days: TvDay[]; legend: readonly TvLegendItem[]; today: string; now: number; room: Room }) {
  const HEADING = 1.6, GAP = 0.4;
  const lists = days.map(day => ({ day, entries: dayEntries(day) }));
  const lines = lists.reduce((sum, list) => sum + Math.max(1, list.entries.length) + HEADING, 0);
  const line = fit(room.height, lines, 6.5);
  return <div className={css.bands}>
    {lists.map(({ day, entries }) => <div key={day.date} className={css.weekDay} data-today={day.date === today} style={{ flex: "none" }}>
      <DayHead date={day.date} today={today} height={line * HEADING} text={fitText(line, 0.5, 2.8)} />
      {entries.length === 0 && <p className={`${css.free} ${css.one}`} style={{ height: u(line), lineHeight: u(line), fontSize: u(fitText(line, 0.42, 2)) }}>Kosong</p>}
      {entries.map(entry => <WeekItem key={`${entry.key}:${entry.room}`} entry={entry} who={legendItem(legend, entry.title)} now={now} height={line - GAP} gap={GAP}
        hours={fitText(line, 0.42, 2.4)} small={null} lines={1} width={room.width - 6} withBooker />)}
    </div>)}
  </div>;
}

/**
 * One entry of the week: its activity's number, its hours (the thing read from afar), then its
 * room and who booked it. `small`: the size of that second line under the hours; null puts
 * everything on one line (the room only, or with the booker where the line is long: `withBooker`).
 */
function WeekItem({ entry, who, now, height, gap, hours, small, lines, width, withBooker = false }: {
  entry: TvDayEntry; who: { color: number; code: number | null }; now: number; height: number; gap: number; hours: number; small: number | null; lines: number;
  /** The room the text has beside the number, in units. */
  width: number; withBooker?: boolean;
}) {
  const state = entryState(entry, now);
  // Whose it is: the person alone for a one-on-one, the department in full for anything else.
  const owner = entryOwner(entry);
  const where = `${entry.room}${owner ? ` · ${owner}` : ""}`;
  // A letter is about 0.58 of the text size wide: the line gets the size at which all of it fits, down to the smallest readable.
  const fitted = (size: number, letters: number) => clamp(width * lines / (letters * 0.58), 1.1, size);
  return <div className={`${css.item} ${tones[who.color]}`} data-state={state} title={entry.title} style={{ height: u(height), marginTop: u(gap), fontSize: u(hours) }}>
    <Badge code={who.code} size={Math.min(1.7, hours * 0.75)} />
    {small != null
      ? <span className={css.pair}>
        {/* Line one: the hours, then the room in what is left of the line. Line two: whose it is, in full. */}
        <span className={css.line}>
          <span className={css.title}>{span(entry)}</span>
          <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(clamp((width - hours * 0.6 * 11 - 1.2) / (entry.room.length * 0.58), 1.1, small)) }}>{entry.room}</span>
        </span>
        {owner && <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(fitted(small, owner.length)) }}>{owner}</span>}
      </span>
      : <span className={css.one}><span className={css.title}>{span(entry)}</span><span className={css.sub}> · {withBooker ? where : entry.room}</span></span>}
    {state === "berlangsung" && <span className={css.on} style={{ fontSize: u(Math.min(hours, 1.8)) }}>Kini</span>}
  </div>;
}

function Message({ title, body }: { title: string; body: string }) {
  return <div className={css.message}><h2>{title}</h2><p>{body}</p></div>;
}
