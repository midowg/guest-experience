"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Search, X } from "lucide-react";
import { clockLabel } from "@/lib/pra-wam/appraisal";
import {
  dayEntries, entryState, itemLabel, legendItem, searchEntries, shownDays, youtubeThumb, youtubeWatch, tvDateLabel, tvDayHead, tvWeekLabel,
  type TvEntry, type TvFeed, type TvItem, type TvLegendItem, type TvState, type TvStripPhoto,
} from "@/lib/pra-wam/tv";
import { PhonePhotos } from "./TvStrip";
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
export function TvPhone({ feed, now, clock, items, position, paused, gone, legend, photos = [], onGo, onPause }: {
  feed: TvFeed; now: number; clock: string; items: readonly TvItem[]; position: number; paused: boolean; gone: boolean;
  legend: readonly TvLegendItem[]; photos?: readonly TvStripPhoto[]; onGo: (index: number) => void; onPause: (paused: boolean) => void;
}) {
  const current = items[position];
  const today = feed.days.find(day => day.date === feed.date)?.rooms ?? [];
  const week = shownDays(feed.days);
  const pictures = items.filter(item => item.kind === "gambar").length;
  const label = (item: TvItem, index: number) => item.kind === "hari" ? "Hari ini" : item.kind === "minggu" ? "Minggu ini"
    : item.kind !== "gambar" ? itemLabel(item)
    : pictures > 1 ? `Gambar ${items.slice(0, index + 1).filter(other => other.kind === "gambar").length}` : "Gambar";

  // Search: over the whole week, by name, department, room or activity. While something is typed, the results replace the loop.
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const found = searching ? searchEntries(feed.days, query) : [];
  const foundCount = found.reduce((sum, day) => sum + day.entries.length, 0);

  // A new item starts at its top.
  const scroller = useRef<HTMLElement>(null);
  const key = current?.key;
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [key]);

  const go = (index: number) => { onPause(true); onGo((index + items.length) % items.length); };
  const title = !current ? "TV Announcement" : current.kind === "hari" ? tvDateLabel(feed.date) : current.kind === "minggu" ? tvWeekLabel(week.map(day => day.date))
    : current.kind === "timeline" ? "Forum dan acara" : current.kind === "pengumuman" ? "Dari panitia" : current.kind === "teks" ? current.title || "Info" : current.kind === "sambutan" ? current.welcome.name : current.kind === "video" ? current.title || "Video" : current.kind === "ultah" ? current.birthday.name : current.slide.title || "Pengumuman";
  const kicker = !current || current.kind === "hari" ? "Jadwal ruang hari ini" : current.kind === "minggu" ? "Jadwal ruang minggu ini" : current.kind === "timeline" ? "Timeline Pra WAM" : current.kind === "sambutan" ? current.welcome.greeting : current.kind === "ultah" ? "Happy Birthday" : "Pengumuman";

  return <main ref={scroller} className={css.phone} onTouchStart={() => { if (!paused) onPause(true); }} onWheel={() => { if (!paused) onPause(true); }}>
    <header className={css.phoneHead}>
      <div>
        <p className={css.phoneKicker}>{kicker}</p>
        <h1 className={css.phoneTitle}>{title}</h1>
      </div>
      <p className={css.phoneClock}>{clock}<span>WIB</span></p>
    </header>

    {!gone && <div className={css.phoneSearch} role="search">
      <Search size={18} aria-hidden="true" />
      <input type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false} value={query}
        placeholder="Cari nama, departemen, atau ruangan" aria-label="Cari jadwal minggu ini: nama, departemen, atau ruangan"
        onChange={event => { setQuery(event.target.value); if (!paused) onPause(true); }} />
      {query && <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery("")}><X size={18} aria-hidden="true" /></button>}
    </div>}

    {searching && !gone && <div className={css.phoneBody} aria-live="polite">
      {found.length === 0 ? <Empty title="Tidak ada yang cocok" body="Coba nama orang, departemen, ruangan, atau kegiatan lain. Pencarian mencakup jadwal minggu ini." />
        : <>
          <p className={css.phoneCount}>{foundCount} jadwal minggu ini</p>
          {found.map(day => {
            const head = tvDayHead(day.date);
            return <section key={day.date} className={css.phoneGroup} aria-label={`${head.name}, ${head.day}`}>
              <h2>{head.name}, {head.day}{day.date === feed.date ? <em>Hari ini</em> : <span>{day.entries.length} jadwal</span>}</h2>
              <ul>{day.entries.map(entry => <Row key={`${entry.key}:${entry.room}`} entry={entry} now={now} tone={tones[legendItem(legend, entry.title).color]} detail={[entry.room, bookedBy(entry)].filter(Boolean).join(" · ")} />)}</ul>
            </section>;
          })}
        </>}
    </div>}

    {!searching && items.length > 1 && <nav className={css.phoneTabs} aria-label="Tayangan">
      {items.map((item, index) => <button key={item.key} type="button" aria-pressed={index === position} onClick={() => go(index)}>{label(item, index)}</button>)}
    </nav>}

    {(!searching || gone) && <div className={css.phoneBody}>
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
            : current.kind === "timeline"
              ? (feed.timeline ?? []).length === 0 ? <Empty title="Belum ada forum atau acara berikutnya" body="Jadwal dari Kelola acara muncul di sini dengan sendirinya." />
                : <ul className={css.phonePlain}>{(feed.timeline ?? []).map(entry => <li key={entry.id} className={`${css.phoneRow} ${tones[entry.color % tones.length]}`} data-state={entry.state}>
                  <i className={css.dot} aria-hidden="true" />
                  <div>
                    <p className={css.phoneHours}>{entry.when}{entry.state === "berlangsung" && <span data-state="berlangsung">Sedang berlangsung</span>}</p>
                    <p className={css.phoneName}>{entry.title}</p>
                    <p className={css.phoneDetail}>{[entry.hours, entry.left].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>)}</ul>
            : current.kind === "pengumuman"
              ? (feed.notes ?? []).length === 0 ? <Empty title="Belum ada pengumuman baru" body="Pengumuman panitia untuk semua peserta muncul di sini." />
                : <ul className={css.phonePlain}>{(feed.notes ?? []).map(note => <li key={note.id} className={css.phoneNote}>
                  <p className={css.phoneName}>{note.title}</p>
                  {note.body && <p className={css.phoneText}>{note.body}</p>}
                </li>)}</ul>
            : current.kind === "teks" ? <div className={css.phoneNote}>{current.body && <p className={css.phoneText}>{current.body}</p>}</div>
            : current.kind === "ultah" ? <div className={css.phoneNote}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {current.birthday.photo && <img className={css.phonePicture} src={current.birthday.photo} alt="" referrerPolicy="no-referrer" />}
              <p className={css.phoneName}>Happy Birthday, {current.birthday.call}</p>
              <p className={css.phoneText}>{current.birthday.wish}</p>
              {current.birthday.day && <p className={css.phoneDetail}>{current.birthday.day} {current.birthday.month}</p>}
            </div>
            : current.kind === "video" ? <div className={css.phoneNote}>
              {/* A phone does not play it by itself: a file with its controls, or a YouTube still and the way there. */}
              {current.file ? <video className={css.phonePicture} src={current.file} controls muted playsInline preload="metadata" />
                : <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={css.phonePicture} src={youtubeThumb(current.video)} alt="" referrerPolicy="no-referrer" />
                  <p className={css.phoneText}><a href={youtubeWatch(current.video)} target="_blank" rel="noopener noreferrer">Tonton di YouTube</a></p>
                </>}
            </div>
            : current.kind === "sambutan" ? <div className={css.phoneNote}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {current.welcome.image && <img className={css.phonePicture} src={current.welcome.image} alt="" referrerPolicy="no-referrer" />}
              {current.welcome.note && <p className={css.phoneText}>{current.welcome.note}</p>}
              {(current.welcome.hours || current.welcome.place) && <p className={css.phoneDetail}>{[current.welcome.hours, current.welcome.place].filter(Boolean).join(" · ")}</p>}
            </div>
            // eslint-disable-next-line @next/next/no-img-element
            : <img className={css.phonePicture} src={current.slide.src} alt={current.slide.title || "Gambar pengumuman"} referrerPolicy="no-referrer" />}
    </div>}

    {/* The photos a TV in two rows runs along its bottom: here a row to swipe and open by hand. */}
    {!searching && !gone && <PhonePhotos photos={photos} />}

    {!searching && items.length > 1 && <div className={css.phoneBar}>
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
