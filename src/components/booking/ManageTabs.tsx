"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, DoorOpen, LayoutDashboard, ShieldCheck } from "lucide-react";
import { bookingPath } from "@/lib/routes";
import css from "./booking.module.css";

/** Kelola's places, as tabs under its title: one job each, icon and word. */
export function ManageTabs() {
  const path = usePathname();
  const tabs = [
    { href: bookingPath.manage(), label: "Ringkasan & jadwal", icon: <LayoutDashboard size={18} aria-hidden />, on: path === bookingPath.manage() },
    { href: bookingPath.manageBookings(), label: "Semua booking", icon: <CalendarRange size={18} aria-hidden />, on: path.startsWith(bookingPath.manageBookings()) },
    { href: bookingPath.manageRooms, label: "Ruangan", icon: <DoorOpen size={18} aria-hidden />, on: path.startsWith(bookingPath.manageRooms) },
    { href: bookingPath.manageAccess, label: "Akses", icon: <ShieldCheck size={18} aria-hidden />, on: path.startsWith(bookingPath.manageAccess) },
  ];
  return <nav className={css.tabs} aria-label="Kelola">
    {tabs.map(tab => <Link key={tab.label} href={tab.href} className={css.tab} aria-current={tab.on ? "page" : undefined}>{tab.icon}{tab.label}</Link>)}
  </nav>;
}
