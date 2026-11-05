"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, Plus, QrCode, Send } from "lucide-react";
import { praWamPath } from "@/lib/routes";
import { Sheet } from "./Sheet";
import css from "./quick-actions.module.css";

type Props = {
  /** The session "Saya hadir" opens now, or null when no check-in is open. */
  checkIn: { title: string; href: string } | null;
  bookingOpen: boolean;
  /** Panitia who run sessions also get Buat sesi and Kirim pengumuman. */
  manages: boolean;
  /** Where the button sits: the middle of the phone's bottom bar, or the desktop top bar. */
  place: "bar" | "top";
};

type Action = { key: string; label: string; sub: string; href: string | null; icon: ReactNode };

/**
 * Aksi cepat (DS · Komponen "Tombol tambah"): the blue + in the middle of the bottom bar opens a
 * sheet of the few things people do in a hurry, by role. "Saya hadir" opens the session whose
 * check-in is open now; when none is, it stays in the list and says so, so its place never moves.
 */
export function QuickActions({ checkIn, bookingOpen, manages, place }: Props) {
  const [open, setOpen] = useState(false);
  const actions: Action[] = [
    {
      key: "hadir", label: "Saya hadir", icon: <CheckCircle2 aria-hidden />,
      href: checkIn?.href ?? null,
      sub: checkIn ? checkIn.title : "Belum ada sesi yang dibuka. Absen dibuka 30 menit sebelum sesi mulai.",
    },
    { key: "scan", label: "Scan QR absen", sub: "Pindai QR yang dipasang di ruang sesi", href: praWamPath.scan, icon: <QrCode aria-hidden /> },
    ...(bookingOpen ? [{ key: "book", label: "Book ruang", sub: "Pesan ruang untuk rapat atau appraisal", href: praWamPath.book(), icon: <CalendarClock aria-hidden /> }] : []),
    ...(manages ? [
      { key: "sesi", label: "Buat sesi", sub: "Jadwal baru untuk peserta", href: praWamPath.newSession, icon: <CalendarPlus aria-hidden /> },
      { key: "pengumuman", label: "Kirim pengumuman", sub: "Kabar untuk peserta lewat notifikasi", href: praWamPath.announcements, icon: <Send aria-hidden /> },
    ] : []),
  ];

  return <>
    <button type="button" className={place === "bar" ? css.fab : css.topFab} aria-label="Aksi cepat" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <Plus aria-hidden />{place === "top" && <span>Aksi cepat</span>}
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Aksi cepat">
      <ul className={css.list}>
        {actions.map(action => <li key={action.key}>
          {action.href
            ? <a className={css.row} href={action.href} onClick={() => setOpen(false)}>
              <span className={css.tile}>{action.icon}</span>
              <span className={css.text}><strong>{action.label}</strong><small>{action.sub}</small></span>
              <ChevronRight className={css.chevron} aria-hidden />
            </a>
            : <div className={`${css.row} ${css.off}`} aria-disabled="true">
              <span className={css.tile}>{action.icon}</span>
              <span className={css.text}><strong>{action.label}</strong><small>{action.sub}</small></span>
            </div>}
        </li>)}
      </ul>
    </Sheet>
  </>;
}
