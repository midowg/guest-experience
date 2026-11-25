"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, ChevronRight, Eye, MoreHorizontal, Plus, Search, Settings2 } from "lucide-react";
import css from "./admin-options.module.css";

/*
 * Three directions for the admin's home (21 Nov 2026), to choose from before the whole admin is
 * redone: apps shown by their own logo, events by their main photo when they have one.
 */

type App = { key: string; name: string; what: string; logo?: string; tone: string; mark: string; status: string; waiting?: string };
type Event = { id: string; title: string; kind: string; date: string; status: "Tayang" | "Draf" | "Arsip"; photo?: string; tone: string; live?: string; rsvp?: string };

const A = "/panduan-ke-werkudara/assets/";
const apps: App[] = [
  { key: "wam", name: "Pra WAM", what: "Aplikasi karyawan", logo: "/wam/icon-192.png", tone: "#1f4fd1", mark: "W", status: "WAM 45 hari lagi", waiting: "2 reset password" },
  { key: "wam_acara", name: "WAM 2026", what: "Selama acara", tone: "#0b1f4d", mark: "26", status: "5–8 Jan 2027" },
  { key: "hr", name: "WG People", what: "HR karyawan", logo: "/people/icon-192.png", tone: "#0d9488", mark: "P", status: "Absen hari ini 38/51", waiting: "3 foto wajah" },
  { key: "booking", name: "Booking Kantor", what: "Ruang meeting", tone: "#0d9488", mark: "B", status: "6 booking hari ini" },
  { key: "tv", name: "TV kantor", what: "Signage", tone: "#ea580c", mark: "TV", status: "3 layar menyala" },
  { key: "wlm", name: "WLM", what: "Werkudara Life Mode", logo: "/wlm/icon-192.png", tone: "#e0457b", mark: "WLM", status: "128 catatan minggu ini" },
];
const events: Event[] = [
  { id: "1", title: "Sales Meeting TDN Yogyakarta", kind: "Program & trip", date: "21–23 Nov 2026", status: "Tayang", photo: A + "pendopo-1000.webp", tone: "#1f4fd1", live: "Hari H · hari ke-1", rsvp: "112/120 hadir" },
  { id: "2", title: "Kunjungan Vortex Buana Edumedia", kind: "Welcome", date: "4 Des 2026, 10.00", status: "Tayang", photo: A + "exterior-1280.webp", tone: "#0d9488", rsvp: "4/4 hadir" },
  { id: "3", title: "Gala Dinner Akhir Tahun", kind: "Acara", date: "19 Des 2026", status: "Draf", photo: A + "garden-960.webp", tone: "#b45309", rsvp: "Belum dibuka" },
  { id: "4", title: "Friday Sharing Desember", kind: "Friday Sharing", date: "12 Des 2026", status: "Tayang", photo: A + "team-1280.webp", tone: "#e0457b", rsvp: "Rp 4,2 jt terkumpul" },
  { id: "5", title: "Handbook Trip Lombok", kind: "Handbook", date: "8–10 Jan 2027", status: "Draf", tone: "#0284c7", rsvp: "3 hari, 18 agenda" },
  { id: "6", title: "Your Visit to Werkudara", kind: "Panduan lokasi", date: "Selalu tayang", status: "Tayang", photo: A + "workspace-1000.webp", tone: "#475569" },
  { id: "7", title: "Kunjungan Mitra Oktober", kind: "Welcome", date: "15 Okt 2026", status: "Arsip", photo: A + "turn-1400.webp", tone: "#0d9488", rsvp: "6/6 hadir" },
];
const statusTone = { Tayang: "ok", Draf: "draft", Arsip: "muted" } as const;

/** An app's own logo, or its mark on its colour when it has none yet. */
function AppIcon({ app, size }: { app: App; size: number }) {
  return <span className={css.appIcon} style={{ "--tone": app.tone, width: size, height: size, borderRadius: size * .26 } as CSSProperties} aria-hidden="true">
    {app.logo ? <img src={app.logo} alt="" /> : <b style={{ fontSize: size * (app.mark.length > 2 ? .26 : app.mark.length > 1 ? .32 : .42) }}>{app.mark}</b>}
  </span>;
}
/** An event's main photo, or its kind's colour with its initials when it has none. */
function Cover({ event, className }: { event: Event; className?: string }) {
  return <span className={`${css.cover} ${className ?? ""}`} style={{ "--tone": event.tone } as CSSProperties} aria-hidden="true">
    {event.photo ? <img src={event.photo} alt="" loading="lazy" /> : <b>{event.title.split(" ").slice(0, 2).map(word => word[0]).join("")}</b>}
  </span>;
}
const Status = ({ status }: { status: Event["status"] }) => <span className={css.status} data-tone={statusTone[status]}>{status}</span>;

function Top({ title, create = true }: { title: string; create?: boolean }) {
  return <header className={css.top}>
    <div><p className={css.hello}>Jumat, 21 November</p><h1>{title}</h1></div>
    <div className={css.topTools}>
      <label className={css.search}><Search size={16} aria-hidden="true" /><input placeholder="Cari acara atau aplikasi" aria-label="Cari acara atau aplikasi" /><kbd>Ctrl K</kbd></label>
      {create && <button type="button" className={css.primary}><Plus size={16} aria-hidden="true" /> Buat acara</button>}
    </div>
  </header>;
}

/** A: Galeri. Apps as a home screen of logos; events as photo cards. */
function Galeri() {
  return <>
    <Top title="Selamat pagi, Mido" />
    <section className={css.block}>
      <h2 className={css.h2}>Aplikasi</h2>
      <ul className={css.homeGrid}>{apps.map((app, index) => <li key={app.key} style={{ "--i": index } as CSSProperties}>
        <a href="#" className={css.homeApp}>
          <span className={css.homeIconWrap}><AppIcon app={app} size={64} />{app.waiting && <span className={css.badge} title={app.waiting}>!</span>}</span>
          <strong>{app.name}</strong><small>{app.status}</small>
        </a>
      </li>)}</ul>
    </section>
    <section className={css.block}>
      <div className={css.blockHead}><h2 className={css.h2}>Acara</h2><div className={css.chips}><button aria-pressed="true">Semua 7</button><button>Tayang 4</button><button>Draf 2</button><button>Arsip 1</button></div></div>
      <ul className={css.photoGrid}>{events.map((event, index) => <li key={event.id} style={{ "--i": index } as CSSProperties}>
        <a href="#" className={css.photoCard}>
          <Cover event={event} className={css.photoCover} />
          {event.live && <span className={css.live}><i /> {event.live}</span>}
          <span className={css.photoBody}>
            <span className={css.metaRow}><span className={css.kind} style={{ "--tone": event.tone } as CSSProperties}>{event.kind}</span><Status status={event.status} /></span>
            <strong>{event.title}</strong>
            <span className={css.metaRow}><span><CalendarDays size={14} aria-hidden="true" /> {event.date}</span>{event.rsvp && <span>{event.rsvp}</span>}</span>
          </span>
        </a>
      </li>)}</ul>
    </section>
  </>;
}

/** B: Ringkas. One column of rows with a small logo or photo, dense like a work tool. */
function Ringkas() {
  return <>
    <Top title="Beranda" create={false} />
    <section className={css.block}>
      <div className={css.blockHead}><h2 className={css.h2}>Aplikasi</h2><span className={css.hint}><Settings2 size={14} aria-hidden="true" /> Ketuk untuk mengelola · <ArrowUpRight size={14} aria-hidden="true" /> buka aplikasinya</span></div>
      <ul className={css.appStrip}>{apps.map(app => <li key={app.key} className={css.appChip}>
        <AppIcon app={app} size={36} />
        <a href="#" className={css.appMain} title={`Kelola ${app.name}`}><strong>{app.name}</strong><small>{app.waiting ?? app.status}</small></a>
        {app.waiting && <span className={css.dot} aria-label={app.waiting} />}
        <a href="#" target="_blank" rel="noopener" className={css.openBtn} aria-label={`Buka aplikasi ${app.name}`} title={`Buka ${app.name}`}><ArrowUpRight size={16} /></a>
      </li>)}</ul>
    </section>
    <section className={css.block}>
      <div className={css.blockHead}>
        <div className={css.headLeft}><h2 className={css.h2}>Acara</h2><div className={css.chips}><button aria-pressed="true">Semua 7</button><button>Tayang 4</button><button>Draf 2</button><button>Arsip 1</button></div></div>
        <button type="button" className={css.primary}><Plus size={16} aria-hidden="true" /> Buat acara</button>
      </div>
      <div className={css.table} role="table" aria-label="Acara">
        <div className={css.thead} role="row"><span role="columnheader">Acara</span><span role="columnheader">Tanggal</span><span role="columnheader">Kehadiran</span><span role="columnheader">Status</span><span role="columnheader">Halaman tamu</span></div>
        {events.map(event => <div key={event.id} className={css.row} role="row">
          <span className={css.rowMain} role="cell"><Cover event={event} className={css.thumb} /><a href="#" className={css.rowLink} title="Kelola acara"><strong>{event.title}</strong><small>{event.kind}{event.live ? ` · ${event.live}` : ""}</small></a></span>
          <span role="cell" className={css.muted}>{event.date}</span>
          <span role="cell" className={css.muted}>{event.rsvp ?? "–"}</span>
          <span role="cell"><Status status={event.status} /></span>
          <span role="cell" className={css.rowActions}>
            {event.status === "Draf"
              ? <a href="#" target="_blank" rel="noopener" className={css.pageBtn} aria-label={`Pratinjau ${event.title}`}><Eye size={15} aria-hidden="true" /> <span>Pratinjau</span></a>
              : <a href="#" target="_blank" rel="noopener" className={css.pageBtn} aria-label={`Buka halaman ${event.title}`}><ArrowUpRight size={15} aria-hidden="true" /> <span>Buka</span></a>}
            <button type="button" className={css.moreBtn} aria-label={`Menu ${event.title}`}><MoreHorizontal size={18} /></button>
          </span>
        </div>)}
      </div>
    </section>
  </>;
}

/** C: Sorotan. The event running now big on its photo; apps as a dock; the rest as a photo mosaic. */
function Sorotan() {
  const [now, ...rest] = events;
  return <>
    <Top title="Selamat pagi, Mido" />
    <a href="#" className={css.spot}>
      <Cover event={now} className={css.spotCover} />
      <span className={css.spotText}>
        <span className={css.live}><i /> {now.live}</span>
        <strong>{now.title}</strong>
        <span className={css.spotMeta}><span>{now.kind}</span><span>{now.date}</span><span>{now.rsvp}</span></span>
      </span>
      <span className={css.spotGo}>Buka acara <ArrowUpRight size={18} aria-hidden="true" /></span>
    </a>
    <section className={css.block}>
      <nav className={css.dock} aria-label="Aplikasi">{apps.map(app => <a key={app.key} href="#" className={css.dockApp}>
        <span className={css.homeIconWrap}><AppIcon app={app} size={52} />{app.waiting && <span className={css.badge}>!</span>}</span><span>{app.name}</span>
      </a>)}</nav>
    </section>
    <section className={css.block}>
      <div className={css.blockHead}><h2 className={css.h2}>Acara lainnya</h2><a href="#" className={css.more}>Semua acara <ChevronRight size={16} aria-hidden="true" /></a></div>
      <ul className={css.mosaic}>{rest.map((event, index) => <li key={event.id} data-wide={index === 0 || undefined}>
        <a href="#" className={css.tile}>
          <Cover event={event} className={css.tileCover} />
          <span className={css.tileText}><Status status={event.status} /><strong>{event.title}</strong><small>{event.kind} · {event.date}</small></span>
        </a>
      </li>)}</ul>
    </section>
  </>;
}

type Option = "a" | "b" | "c";
const labels: Record<Option, string> = { a: "A · Galeri", b: "B · Ringkas", c: "C · Sorotan" };

export function AdminOptions({ initial }: { initial: Option }) {
  const [option, setOption] = useState<Option>(initial);
  const [dark, setDark] = useState(false);
  return <div className={css.page} data-dark={dark || undefined}>
    <div className={css.switcher} role="group" aria-label="Opsi tampilan">
      {(Object.keys(labels) as Option[]).map(key => <button key={key} type="button" aria-pressed={option === key} onClick={() => setOption(key)}>{labels[key]}</button>)}
      <button type="button" onClick={() => setDark(!dark)}>{dark ? "Terang" : "Gelap"}</button>
    </div>
    <main className={css.main} key={option}>{option === "a" ? <Galeri /> : option === "b" ? <Ringkas /> : <Sorotan />}</main>
  </div>;
}
