"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, ScanFace, Settings2 } from "lucide-react";
import { praWamRequest } from "@/components/pra-wam/api";
import { hrPath, praWamApi } from "@/lib/routes";
import css from "@/components/booking/booking.module.css";
import hr from "./hr.module.css";

/** "Dita Contoh" → "DC", for the round mark beside the name. */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";

/**
 * The frame of HR Werkudara (20 Nov 2026): its name, where to go (icons with words), and who is
 * signed in; on a phone the places sit in a bar at the bottom. The same frame classes as Booking
 * Kantor, in HR's own colour. Kelola shows only for Admin HR. Cuti and lembur join the places later.
 * Registers HR's own service worker (scope /hr/), which makes it installable as its own app.
 */
export function HrFrame({ name, canManage, children }: { name: string; canManage: boolean; children: ReactNode }) {
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${hrPath.home}/sw.js`, { scope: `${hrPath.home}/` }).catch(() => undefined);
  }, []);
  const places = [
    { href: hrPath.home, label: "Absen", icon: <ScanFace size={20} aria-hidden />, on: path === hrPath.home },
    ...(canManage ? [{ href: hrPath.manage(), label: "Kelola", icon: <Settings2 size={20} aria-hidden />, on: path.startsWith(hrPath.manage()) }] : []),
  ];
  return <div className={`${css.app} ${hr.bk}`}>
    <header className={css.top}><div className={css.topInner}>
      <Link href={hrPath.home} className={css.brand}><span className={css.brandMark}><ScanFace size={20} aria-hidden /></span>HR Werkudara</Link>
      {/* One place only (everyone but Admin HR, until cuti and lembur come): no menu bar for it. */}
      {places.length > 1 && <nav className={css.nav} aria-label="Menu utama">{places.map(place =>
        <Link key={place.label} href={place.href} className={css.navLink} aria-current={place.on ? "page" : undefined}>{place.icon}{place.label}</Link>)}</nav>}
      <div className={css.who}><span className={css.avatar} aria-hidden>{initials(name)}</span><span>{name}</span>
        <button type="button" className={css.out} disabled={leaving} aria-label="Keluar" onClick={async () => {
          setLeaving(true);
          try { await praWamRequest(praWamApi.logout, { method: "POST" }); } catch { /* the cookie may already be gone */ }
          window.location.assign(hrPath.login());
        }}><LogOut size={20} aria-hidden /></button>
      </div>
    </div></header>
    <main className={css.page}>{children}</main>
  </div>;
}
