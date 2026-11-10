"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarCheck, CalendarClock, DoorOpen, Home, LogOut, Settings2 } from "lucide-react";
import { praWamRequest } from "@/components/pra-wam/api";
import { bookingPath, praWamApi } from "@/lib/routes";
import css from "./booking.module.css";

/** "Dita Contoh" → "DC", for the round mark beside the name. */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";

/**
 * The frame of Booking Kantor: its name, where to go (icons with words), and who is signed in.
 * On a phone the places sit in a bar at the bottom. Kelola shows only for the administration staff.
 */
export function BookingFrame({ name, canManage, children }: { name: string; canManage: boolean; children: ReactNode }) {
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);
  const places = [
    { href: bookingPath.home, label: "Beranda", icon: <Home size={20} aria-hidden />, on: path === bookingPath.home },
    { href: bookingPath.rooms(), label: "Ruangan", icon: <DoorOpen size={20} aria-hidden />, on: path.startsWith(bookingPath.rooms()) },
    { href: bookingPath.mine, label: "Booking saya", icon: <CalendarCheck size={20} aria-hidden />, on: path.startsWith(bookingPath.mine) },
    ...(canManage ? [{ href: bookingPath.manage(), label: "Kelola", icon: <Settings2 size={20} aria-hidden />, on: path.startsWith(bookingPath.manage()) }] : []),
  ];
  return <div className={css.app}>
    <header className={css.top}><div className={css.topInner}>
      <Link href={bookingPath.home} className={css.brand}><span className={css.brandMark}><CalendarClock size={20} aria-hidden /></span>Booking Kantor</Link>
      <nav className={css.nav} aria-label="Menu utama">{places.map(place =>
        <Link key={place.label} href={place.href} className={css.navLink} aria-current={place.on ? "page" : undefined}>{place.icon}{place.label}</Link>)}</nav>
      <div className={css.who}><span className={css.avatar} aria-hidden>{initials(name)}</span><span>{name}</span>
        <button type="button" className={css.out} disabled={leaving} aria-label="Keluar" onClick={async () => {
          setLeaving(true);
          try { await praWamRequest(praWamApi.logout, { method: "POST" }); } catch { /* the cookie may already be gone */ }
          window.location.assign(bookingPath.login());
        }}><LogOut size={20} aria-hidden /></button>
      </div>
    </div></header>
    <main className={css.page}>{children}</main>
  </div>;
}
