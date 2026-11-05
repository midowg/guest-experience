"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck, Plus, QrCode, Send } from "lucide-react";
import { atLabel } from "@/lib/pra-wam/agenda";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import type { CheckInWay } from "@/lib/pra-wam/attendance";
import { praWamPath } from "@/lib/routes";
import { Sheet } from "./Sheet";
import css from "./quick-actions.module.css";

type Props = {
  /** The person's session whose check-in is open now, and its one way in. */
  checkIn: { title: string; closes: string; way: CheckInWay } | null;
  /** Otherwise the next one to open. */
  upcoming: { title: string; opens: string; way: CheckInWay } | null;
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

/** "Saya hadir" opens "Kamu hadir di mana?" on Beranda at once. */
export const CHECK_IN_HREF = `${praWamPath.home}?absen=1`;

/**
 * Aksi cepat (DS · Komponen "Tombol tambah"): the blue + in the middle of the bottom bar opens a
 * sheet of what people do in a hurry, in groups by role. One way per session (5 Nov 2026): a
 * booking's session takes "Saya hadir", a panitia's session its QR, so whichever is open now is in
 * blue; the other stays in its place and says why, or which session opens next and when. The panitia also get the attendance list of each session running now, where they check
 * who is there, and the requests waiting.
 */
export function QuickActions({ checkIn, upcoming, bookingOpen, manages, running, waiting, place, now }: Props) {
  const [open, setOpen] = useState(false);
  const until = checkIn && `${checkIn.title} · dibuka sampai ${clockLabel(wibTime(checkIn.closes))}`;
  const later = (way: CheckInWay) => upcoming?.way === way ? `Belum dibuka. ${upcoming.title}: absen dibuka ${atLabel(upcoming.opens, now)}.` : null;
  const absen: Action[] = [
    {
      key: "hadir", label: "Saya hadir", icon: <CheckCircle2 aria-hidden />, main: checkIn?.way === "tombol",
      href: checkIn?.way === "tombol" ? CHECK_IN_HREF : null,
      sub: checkIn?.way === "tombol" ? until! : later("tombol") ?? "Untuk sesi dari booking ruang. Tidak ada yang dibuka sekarang.",
    },
    {
      key: "scan", label: "Scan QR absen", icon: <QrCode aria-hidden />, main: checkIn?.way === "qr", href: praWamPath.scan,
      sub: checkIn?.way === "qr" ? until! : later("qr") ?? "Untuk sesi panitia: pindai QR yang ditempel di ruang",
    },
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
