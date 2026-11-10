"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { clockLabel } from "@/lib/pra-wam/appraisal";
import {
  dayEntries, entryState, legendItem, shownDays, tvDateLabel, tvDayHead, tvWeekLabel,
  type TvEntry, type TvFeed, type TvItem, type TvLegendItem, type TvState,
} from "@/lib/pra-wam/tv";
import css from "./tv.module.css";

const tones = [css.c0, css.c1, css.c2, css.c3, css.c4, css.c5, css.c6, css.c7, css.c8];
const hours = (entry: Pick<TvEntry, "start" | "end">) => `${clockLabel(entry.start)}–${clockLabel(entry.end)}`;
/** Who booked, in full: the name colleagues call them by, then their department. */
const bookedBy = (entry: Pick<TvEntry, "by" | "person" | "dept">) => [entry.person?.trim(), entry.dept?.trim()].filter(Boolean).join(" · ") || entry.by;
const stateWords: Record<TvState, string> = { berlangsung: "Sedang berlangsung", selesai: "Selesai", nanti: "" };

/**
 * The board on a phone: what someone sees after scanning the QR code on a TV. The same content
 * and the same loop, laid out for a narrow screen that scrolls: a list instead of a calendar, so
 * every activity's name, hours, room and booker is written out in full. The loop can be stopped
 * (Jeda) and stepped by hand; touching the list stops it too, so it never moves under a reader.
 */
export function TvPhone({ feed, now, clock, items, position, paused, gone, legend, onGo, onPause }: {
  feed: TvFeed; now: number; clock: string; items: readonly TvItem[]; position: number; paused: boolean; gone: boolean;
  legend: readonly TvLegendItem[]; onGo: (index: number) => void; onPause: (paused: boolean) => void;
}) {
  const current = items[position];
  const today = feed.days.find(day => day.date === feed.date)?.rooms ?? [];
  const week = shownDays(feed.days);
  const pictures = items.filter(item => item.kind === "gambar").length;
  const label = (item: TvItem, index: number) => item.kind === "hari" ? "Hari ini" : item.kind === "minggu" ? "Minggu ini"
    : pictures > 1 ? `Gambar ${items.slice(0, index + 1).filter(other => other.kind === "gambar").length}` : "Gambar";

  // A new item starts at its top.
  const scroller = useRef<HTMLElement>(null);
  const key = current?.key;
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [key]);

  const go = (index: number) => { onPause(true); onGo((index + items.length) % items.length); };
  const title = !current ? "TV Announcement" : current.kind === "hari" ? tvDateLabel(feed.date) : current.kind === "minggu" ? tvWeekLabel(week.map(day => day.date)) : current.slide.title || "Pengumuman";

  return <main ref={scroller} className={css.phone} onTouchStart={() => { if (!paused) onPause(true); }} onWheel={() => { if (!paused) onPause(true); }}>
    <header className={css.phoneHead}>
      <div>
        <p className={css.phoneKicker}>{current?.kind === "minggu" ? "Jadwal ruang minggu ini" : current?.kind === "gambar" ? "Pengumuman" : "Jadwal ruang hari ini"}</p>
        <h1 className={css.phoneTitle}>{title}</h1>
      </div>
      <p className={css.phoneClock}>{clock}<span>WIB</span></p>
    </header>

    {items.length > 1 && <nav className={css.phoneTabs} aria-label="Tayangan">
      {items.map((item, index) => <button key={item.key} type="button" aria-pressed={index === position} onClick={() => go(index)}>{label(item, index)}</button>)}
    </nav>}

    <div className={css.phoneBody}>
      {gone ? <Empty title="Tautan TV ini sudah tidak berlaku" body="Minta tautan baru di Admin WAM → TV Announcement." />
        : !current ? <Empty title="Belum ada yang ditayangkan" body="Jadwal ruang dan pengumuman akan muncul di sini." />
        : current.kind === "hari"
          ? today.length === 0 ? <Empty title="Belum ada ruang yang dipakai hari ini" body="Booking baru muncul di sini dengan sendirinya." />
            : today.map(room => <section key={room.id} className={css.phoneGroup} aria-label={room.name}>
              <h2>{room.name}<span>{room.entries.length} jadwal</span></h2>
              <ul>{room.entries.map(entry => <Row key={entry.key} entry={entry} now={now} tone={tones[legendItem(legend, entry.title).color]} detail={bookedBy(entry)} />)}</ul>
            </section>)
          : current.kind === "minggu"
            ? week.every(day => day.rooms.length === 0) ? <Empty title="Belum ada ruang yang dipakai minggu ini" body="Booking baru muncul di sini dengan sendirinya." />
              : week.map(day => {
                const head = tvDayHead(day.date), entries = dayEntries(day);
                return <section key={day.date} className={css.phoneGroup} aria-label={`${head.name}, ${head.day}`} data-today={day.date === feed.date}>
                  <h2>{head.name}, {head.day}{day.date === feed.date ? <em>Hari ini</em> : <span>{entries.length ? `${entries.length} jadwal` : ""}</span>}</h2>
                  {entries.length === 0 ? <p className={css.phoneFree}>Kosong</p>
                    : <ul>{entries.map(entry => <Row key={`${entry.key}:${entry.room}`} entry={entry} now={now} tone={tones[legendItem(legend, entry.title).color]} detail={[entry.room, bookedBy(entry)].filter(Boolean).join(" · ")} />)}</ul>}
                </section>;
              })
            // eslint-disable-next-line @next/next/no-img-element
            : <img className={css.phonePicture} src={current.slide.src} alt={current.slide.title || "Gambar pengumuman"} referrerPolicy="no-referrer" />}
    </div>

    {items.length > 1 && <div className={css.phoneBar}>
      <button type="button" onClick={() => go(position - 1)} aria-label="Tayangan sebelumnya"><ChevronLeft size={22} aria-hidden="true" /></button>
      <button type="button" className={css.phonePlay} aria-pressed={!paused} onClick={() => onPause(!paused)}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        {paused ? "Putar otomatis" : "Jeda"}
      </button>
      <button type="button" onClick={() => go(position + 1)} aria-label="Tayangan berikutnya"><ChevronRight size={22} aria-hidden="true" /></button>
    </div>}
  </main>;
}

/** One activity, written out: its colour, hours and state, its name in full, then where or whose it is. */
function Row({ entry, now, tone, detail }: { entry: TvEntry; now: number; tone: string; detail: string }) {
  const state = entryState(entry, now);
  return <li className={`${css.phoneRow} ${tone}`} data-state={state}>
    <i className={css.dot} aria-hidden="true" />
    <div>
      <p className={css.phoneHours}>{hours(entry)}{stateWords[state] && <span data-state={state}>{stateWords[state]}</span>}</p>
      <p className={css.phoneName}>{entry.title}</p>
      {detail && <p className={css.phoneDetail}>{detail}</p>}
    </div>
  </li>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className={css.phoneEmpty}><h2>{title}</h2><p>{body}</p></div>;
}
