"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Maximize } from "lucide-react";
import QRCode from "qrcode";
import { TV_HOME_PATH } from "@/lib/routes";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import {
  dayEntries, decimalHour, entryState, fit, shouldReload, fitText, hourSpan, imageFit, msUntilReload, nowAt, place, playlist, shownDays, tvDateLabel, tvDayHead, tvScreen, tvWeekLabel,
  type TvDay, type TvDayEntry, type TvEntry, type TvFeed, type TvRoom,
} from "@/lib/pra-wam/tv";
import base from "@/components/pra-wam/pra-wam.module.css";
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
  const [natural, setNatural] = useState<Record<string, [number, number]>>({});
  const [active, setActive] = useState(false);
  /** The server's clock minus this TV's, so a TV with a wrong clock still draws "now" in the right place. */
  const offset = useRef(0);
  const size = useSyncExternalStore(onResize, screenSize, () => "1920x1080");
  const fullscreen = useSyncExternalStore(onFullscreen, () => !!document.fullscreenElement, () => false);
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
        const response = await fetch(`${feedUrl}?w=${window.innerWidth}&h=${window.innerHeight}`, { cache: "no-store", credentials: "same-origin" });
        if (stopped) return;
        if (response.status === 404) { setGone(true); return; }
        if (!response.ok) return;
        const result = await response.json() as { ok?: boolean; data?: TvFeed };
        if (stopped || !result.ok || !result.data) return;
        // A newer build of the site answered: this page is old, so it loads itself afresh (once in a few minutes at most).
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
  }, [feedUrl, initial.version]);

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
  const items = useMemo(() => playlist(feed.settings, feed.slides), [feed.settings, feed.slides]);
  const position = items.length ? index % items.length : 0;
  const current = items[position];
  const following = items.length > 1 ? items[(position + 1) % items.length] : undefined;

  // The loop: each item stays its own time. Keyed on the item, so a clock tick does not restart it.
  const currentKey = current?.key, currentSeconds = current?.seconds, count = items.length;
  useEffect(() => {
    if (!currentKey || !currentSeconds || count < 2) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % count), currentSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [currentKey, currentSeconds, count]);

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

  // WAM's own theme (Admin WAM → Tema aplikasi), in the mode picked for the TVs: dark unless the admin chose light.
  return <div data-wam-look={feed.look} data-wam-theme={feed.settings.mode} style={{ display: "contents" }}><div className={base.app}>
  <main className={css.board} data-idle={!active} data-orientation={screen.wide ? "mendatar" : "tegak"} data-qr={qrShow ? feed.settings.qrPosition : undefined}>
    {gone ? <div className={css.slide}><Message title="Tautan TV ini sudah tidak berlaku" body="Minta tautan baru di Admin WAM → TV Announcement." /></div>
      : !current ? <div className={css.slide}><Message title="Belum ada yang ditayangkan" body="Tambahkan gambar atau nyalakan jadwal ruang di Admin WAM → TV Announcement." /></div>
      : current.kind === "hari"
        ? <Schedule key={current.key} kicker="Jadwal ruang hari ini" title={tvDateLabel(feed.date)} note={today.length ? dayNote : undefined} clock={clock}>
          {today.length === 0 ? <Message title="Belum ada ruang yang dipakai hari ini" body="Booking baru muncul di sini dengan sendirinya." />
            : screen.wide ? <DayWide rooms={today} now={now} time={time} room={room} /> : <DayTall rooms={today} now={now} time={time} room={room} />}
        </Schedule>
        : current.kind === "minggu"
          ? <Schedule key={current.key} kicker="Jadwal ruang minggu ini" title={tvWeekLabel(week.map(day => day.date))} note={weekCount ? `${weekCount} jadwal minggu ini` : undefined} clock={clock}>
            {week.every(day => day.rooms.length === 0) ? <Message title="Belum ada ruang yang dipakai minggu ini" body="Booking baru muncul di sini dengan sendirinya." />
              : screen.wide ? <WeekWide days={week} today={feed.date} now={now} room={room} /> : <WeekTall days={week} today={feed.date} now={now} room={room} />}
          </Schedule>
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

function Schedule({ kicker, title, note, clock, children }: { kicker: string; title: string; note?: string; clock: string; children: ReactNode }) {
  return <section className={`${css.slide} ${css.schedule}`} aria-label={kicker}>
    <header className={css.head}>
      <div className={css.headText}><p className={css.kicker}>{kicker}</p><h1 className={css.date}>{title}</h1>{note && <p className={css.summary}>{note}</p>}</div>
      <p className={css.clock}>{clock}<span>WIB</span></p>
    </header>
    <div className={css.body}>{children}</div>
  </section>;
}

type Room = { width: number; height: number };
const pad = (hour: number) => `${String(hour).padStart(2, "0")}.00`;
/** Every whole hour of a span, and the ones that get a label (every second one on a long day). */
function hoursOf(from: number, to: number) {
  const all = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const step = to - from > 12 ? 2 : 1;
  return { all, labelled: all.filter(hour => (hour - from) % step === 0), at: (hour: number) => ((hour - from) / Math.max(1, to - from)) * 100 };
}

/** Today on a landscape TV: a row per room against the hours. Rows share the height, so every room in use is on screen. */
function DayWide({ rooms, now, time, room }: { rooms: TvRoom[]; now: number; time: string; room: Room }) {
  const AXIS = 5, NAME = 26, GAP = 0.5;
  const hours = hourSpan(rooms), marks = hoursOf(hours.from, hours.to);
  const row = fit(room.height - AXIS, rooms.length, 26);
  const two = row >= 7;
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
          <strong className={two ? css.wrap : css.one} style={{ fontSize: u(fitText(row, 0.16, 2.6)), WebkitLineClamp: 2 }}>{item.name}</strong>
          {row >= 10 && <small className={css.one} style={{ fontSize: u(1.6) }}>{item.entries.length} jadwal</small>}
        </div>
        <div className={css.track}>
          {marks.all.slice(1, -1).map(hour => <i key={hour} style={{ left: `${marks.at(hour)}%` }} />)}
          {gone > 0 && <div className={css.gone} style={{ width: `${gone}%` }} />}
          {item.entries.map(entry => {
            const spot = place(entry, hours), state = entryState(entry, now);
            // The block's own width decides its text: a short meeting gets small text on several lines, never a cut word.
            const wide = (spot.size / 100) * track;
            const text = Math.min(fitText(wide, 0.12, 2.2, 1.3), fitText(row, 0.3, 2.2, 1.3));
            const small = Math.max(1.25, text * 0.82);
            const on = state === "berlangsung";
            const under = two ? (on ? 2 : 1) * small * 1.25 : 0;
            const lines = Math.max(1, Math.floor((row - GAP * 2 - 1.4 - under) / (text * 1.2)));
            return <div key={entry.key} className={css.block} data-state={state} style={{ left: `${spot.at}%`, width: `${spot.size}%`, top: u(GAP), bottom: u(GAP) }}>
              <span className={`${css.wrap} ${css.title}`} style={{ fontSize: u(text), WebkitLineClamp: lines }}>{entry.title}</span>
              {two && <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(small) }}>{wide >= 10 ? span(entry) : clockLabel(entry.start)}{entry.by && wide >= 26 ? ` · ${entry.by}` : ""}</span>}
              {two && on && <span className={`${css.one} ${css.on}`} style={{ fontSize: u(small) }}>Berlangsung</span>}
            </div>;
          })}
        </div>
      </div>)}
    </div>
  </>;
}

/** Today on a portrait TV: a column per room, the hours running down. Columns share the width. */
function DayTall({ rooms, now, time, room }: { rooms: TvRoom[]; now: number; time: string; room: Room }) {
  const SIDE = 9, TOP = 7, GAP = 0.4;
  const hours = hourSpan(rooms), marks = hoursOf(hours.from, hours.to);
  const column = fit(room.width - SIDE, rooms.length, 40);
  const nowPlace = nowAt(time, hours);
  const gone = nowPlace ?? (decimalHour(time) > hours.to ? 100 : 0);
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
            const spot = place(entry, hours), state = entryState(entry, now);
            return <div key={entry.key} className={css.block} data-state={state} style={{ top: `${spot.at}%`, height: `${spot.size}%`, left: u(GAP), right: u(GAP) }}>
              <span className={css.title} style={{ fontSize: u(fitText(column, 0.13, 2.6)) }}>{entry.title}</span>
              <span className={css.sub} style={{ fontSize: u(fitText(column, 0.1, 2)) }}>{span(entry)}{entry.by ? ` · ${entry.by}` : ""}</span>
              {state === "berlangsung" && <span className={css.on} style={{ fontSize: u(fitText(column, 0.1, 2)) }}>Berlangsung</span>}
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

/** The week on a landscape TV: a column per day. The fullest day decides the entry size, so every entry of the week is on screen. */
function WeekWide({ days, today, now, room }: { days: TvDay[]; today: string; now: number; room: Room }) {
  const HEADING = 6, GAP = 0.6;
  const lists = days.map(day => ({ day, entries: dayEntries(day) }));
  const unit = fit(room.height - HEADING - 1, Math.max(...lists.map(list => list.entries.length)), 12);
  const column = room.width / days.length;
  // Each entry: one small line (hours and room), then the title on as many lines as its height holds.
  const small = fitText(unit, 0.21, 1.7);
  const text = Math.min(fitText(unit, 0.25, 2.1, 1.3), fitText(column, 0.065, 2.1, 1.3));
  const lines = Math.floor((unit - GAP - 1 - small * 1.25) / (text * 1.2));
  return <div className={css.week} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
    {lists.map(({ day, entries }) => <div key={day.date} className={css.weekDay} data-today={day.date === today}>
      <DayHead date={day.date} today={today} height={HEADING} text={fitText(column, 0.085, 2.6)} />
      {entries.length === 0 && <p className={css.free} style={{ marginTop: u(1.2), fontSize: u(2) }}>Kosong</p>}
      {entries.map(entry => <WeekItem key={`${entry.key}:${entry.room}`} entry={entry} now={now} height={unit - GAP} gap={GAP}
        text={lines >= 1 ? text : fitText(unit, 0.5, 2.1)} sub={lines >= 1 ? small : null} lines={Math.max(1, lines)} />)}
    </div>)}
  </div>;
}

/** The week on a portrait TV: a band per day, one line per entry. All lines share the height. */
function WeekTall({ days, today, now, room }: { days: TvDay[]; today: string; now: number; room: Room }) {
  const HEADING = 1.6, GAP = 0.4;
  const lists = days.map(day => ({ day, entries: dayEntries(day) }));
  const lines = lists.reduce((sum, list) => sum + Math.max(1, list.entries.length) + HEADING, 0);
  const line = fit(room.height, lines, 7);
  return <div className={css.bands}>
    {lists.map(({ day, entries }) => <div key={day.date} className={css.weekDay} data-today={day.date === today} style={{ flex: "none" }}>
      <DayHead date={day.date} today={today} height={line * HEADING} text={fitText(line, 0.5, 2.8)} />
      {entries.length === 0 && <p className={`${css.free} ${css.one}`} style={{ height: u(line), lineHeight: u(line), fontSize: u(fitText(line, 0.42, 2)) }}>Kosong</p>}
      {entries.map(entry => <WeekItem key={`${entry.key}:${entry.room}`} entry={entry} now={now} height={line - GAP} gap={GAP} text={fitText(line, 0.42, 2.6)} sub={null} wholeSpan />)}
    </div>)}
  </div>;
}

/**
 * One entry of the week. With room for it (`sub`): a small line of hours and room, then the title
 * on up to `lines` lines, so a long title wraps instead of being cut. Without: one line of everything.
 */
function WeekItem({ entry, now, height, gap, text, sub, lines = 1, wholeSpan = false }: { entry: TvDayEntry; now: number; height: number; gap: number; text: number; sub: number | null; lines?: number; wholeSpan?: boolean }) {
  const state = entryState(entry, now);
  // "Kini", not "Berlangsung": the line also has to hold the hours and the room in a narrow day column.
  const on = state === "berlangsung" && <span className={css.on}>Kini · </span>;
  const hours = wholeSpan ? span(entry) : clockLabel(entry.start);
  return <div className={css.item} data-state={state} style={{ height: u(height), marginTop: u(gap) }}>
    {sub != null
      ? <>
        <span className={`${css.one} ${css.sub}`} style={{ fontSize: u(sub) }}>{on}<span className={css.hour}>{span(entry)}</span> · {entry.room}</span>
        <span className={`${css.wrap} ${css.title}`} style={{ fontSize: u(text), WebkitLineClamp: lines }}>{entry.title}</span>
      </>
      : <span className={css.one} style={{ fontSize: u(text) }}>
        <span className={css.hour}>{hours}</span>{" "}<span className={css.title}>{entry.title}</span><span className={css.sub}> · {on}{entry.room}</span>
      </span>}
  </div>;
}

function Message({ title, body }: { title: string; body: string }) {
  return <div className={css.message}><h2>{title}</h2><p>{body}</p></div>;
}
