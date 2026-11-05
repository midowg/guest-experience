"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck, Plus, QrCode, Send } from "lucide-react";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamPath } from "@/lib/routes";
import { Sheet } from "./Sheet";
import css from "./quick-actions.module.css";

type Props = {
  /** The person's session whose check-in is open now. */
  checkIn: { title: string; closes: string } | null;
  /** Otherwise the next one to open. */
  upcoming: { title: string; opens: string } | null;
  bookingOpen: boolean;
  /** Panitia who run sessions also get Daftar hadir, Permintaan jadwal, Buat sesi, Kirim pengumuman. */
  manages: boolean;
  /** For the panitia: the sessions whose check-in is open now. */
  running: { id: string; title: string }[];
  /** For the panitia: schedule requests waiting. */
  waiting: number;
  /** Where the button sits: the middle of the phone's bottom bar, or the desktop top bar. */
  place: "bar" | "top";
  /** The time the page was drawn, so server and browser say the same day. */
  now: string;
};

type Action = { key: string; label: string; sub: string; href: string | null; icon: ReactNode; main?: boolean; count?: number };

/** "pukul 09.00" today, else "Selasa, 10 Nov pukul 09.00". */
function when(iso: string, now: string): string {
  const day = wibDate(iso) === wibDate(now) ? "" : `${dayLabel(wibDate(iso))} `;
  return `${day}pukul ${clockLabel(wibTime(iso))}`;
}

/** Saya hadir and Scan QR go first; "Saya hadir" opens "Kamu hadir di mana?" on Beranda at once. */
export const CHECK_IN_HREF = `${praWamPath.home}?absen=1`;

/**
 * Aksi cepat (DS · Komponen "Tombol tambah"): the blue + in the middle of the bottom bar opens a
 * sheet of what people do in a hurry, in groups by role. "Saya hadir" leads, in blue while a
 * check-in is open; when none is, it stays in its place and says which session opens next and
 * when. The panitia also get the attendance list of each session running now, where they check
 * who is there, and the requests waiting.
 */
export function QuickActions({ checkIn, upcoming, bookingOpen, manages, running, waiting, place, now }: Props) {
  const [open, setOpen] = useState(false);
  const absen: Action[] = [
    {
      key: "hadir", label: "Saya hadir", icon: <CheckCircle2 aria-hidden />, main: !!checkIn,
      href: checkIn ? CHECK_IN_HREF : null,
      sub: checkIn ? `${checkIn.title} · dibuka sampai ${clockLabel(wibTime(checkIn.closes))}`
        : upcoming ? `Belum dibuka. ${upcoming.title}: absen dibuka ${when(upcoming.opens, now)}.`
        : "Tidak ada sesi yang perlu diabsen.",
    },
    { key: "scan", label: "Scan QR absen", sub: "Pindai QR yang dipasang di ruang sesi", href: praWamPath.scan, icon: <QrCode aria-hidden /> },
  ];
  const jadwal: Action[] = bookingOpen ? [{ key: "book", label: "Book ruang", sub: "Pesan ruang untuk rapat atau appraisal", href: praWamPath.book(), icon: <CalendarClock aria-hidden /> }] : [];
  const panitia: Action[] = manages ? [
    ...running.map(session => ({ key: `hadir-${session.id}`, label: "Daftar hadir", sub: `${session.title} · cek siapa yang sudah absen`, href: praWamPath.sessionAttendance(session.id), icon: <ClipboardCheck aria-hidden /> })),
    { key: "permintaan", label: "Permintaan jadwal", sub: waiting ? `${waiting} menunggu keputusan` : "Tidak ada yang menunggu", href: praWamPath.requests, icon: <ArrowLeftRight aria-hidden />, count: waiting },
    { key: "sesi", label: "Buat sesi", sub: "Jadwal baru untuk peserta", href: praWamPath.newSession, icon: <CalendarPlus aria-hidden /> },
    { key: "pengumuman", label: "Kirim pengumuman", sub: "Kabar untuk peserta lewat notifikasi", href: praWamPath.announcements, icon: <Send aria-hidden /> },
  ] : [];
  const groups = [{ label: "Absen", items: absen }, { label: "Jadwal", items: jadwal }, { label: "Panitia", items: panitia }].filter(group => group.items.length);

  return <>
    <button type="button" className={place === "bar" ? css.fab : css.topFab} aria-label={checkIn ? "Aksi cepat, absen sedang dibuka" : "Aksi cepat"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <Plus aria-hidden />{place === "top" && <span>Aksi cepat</span>}
      {checkIn && <span className={css.fabDot} aria-hidden />}
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Aksi cepat">
      {groups.map(group => <section key={group.label} className={css.group} aria-label={group.label}>
        <p className={css.groupLabel} aria-hidden>{group.label}</p>
        <ul className={css.list}>
          {group.items.map(action => <li key={action.key}>
            {action.href
              ? <a className={`${css.row} ${action.main ? css.main : ""}`} href={action.href} onClick={() => setOpen(false)}>
                <span className={css.tile}>{action.icon}</span>
                <span className={css.text}><strong>{action.label}</strong><small>{action.sub}</small></span>
                {!!action.count && <span className={css.count} aria-hidden>{action.count}</span>}
                <ChevronRight className={css.chevron} aria-hidden />
              </a>
              : <div className={`${css.row} ${css.off}`} aria-disabled="true">
                <span className={css.tile}>{action.icon}</span>
                <span className={css.text}><strong>{action.label}</strong><small>{action.sub}</small></span>
              </div>}
          </li>)}
        </ul>
      </section>)}
    </Sheet>
  </>;
}
